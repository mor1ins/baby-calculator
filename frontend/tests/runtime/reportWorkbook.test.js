import ExcelJS from 'exceljs';
import { expect, test, vi } from 'vitest';

import { BrowserDiaryRepository } from '../../src/infrastructure/repositories/browserDiary.js';
import { reportWorkbook } from '../../src/infrastructure/repositories/reportWorkbook.js';

const report = {
    from: '2026-10-01',
    to: '2026-10-03',
    rows: [],
    export_days: [
        {
            date: '2026-10-01',
            timezone: 'Europe/Moscow',
            notes: ['Заметка дня'],
            timeline: [
                {
                    kind: 'night',
                    start: '2026-09-30T17:39:00Z',
                    end: '2026-10-01T04:12:00Z',
                    duration_seconds: 37980,
                    comment: { text: '=HYPERLINK("unsafe")' },
                },
                { kind: 'awake', start: '2026-10-01T04:12:00Z', end: '2026-10-01T07:39:00Z', duration_seconds: 12420 },
                { kind: 'nap', start: '2026-10-01T07:39:00Z', end: null, duration_seconds: 100 },
                { kind: 'nap', status: 'forecast', start: '2026-10-01T10:39:00Z' },
            ],
        },
    ],
};
async function sheetFrom(bytes) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    return workbook.worksheets[0];
}
test('exports the reference layout, local times, literal notes, empty dates and open intervals', async () => {
    const sheet = await sheetFrom(await reportWorkbook(report));
    expect(sheet.name).toBe('01.10.2026 - 03.10.2026');
    expect(sheet.getCell('D1').value).toEqual(new Date('2026-10-03T00:00:00Z'));
    expect(sheet.getCell('B3').value).toBe('Ночной сон\n20:39 - 07:12 /10ч 33м/\n=HYPERLINK("unsafe")');
    expect(sheet.getCell('B3').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell('B3').fill.fgColor.argb).toBe('FF93CCEA');
    expect(sheet.getCell('B4').value).toBe('07:12 - 10:39 /3ч 27м/');
    expect(sheet.getCell('B5').value).toBe('Дневной сон\n10:39 - …');
    expect(sheet.getCell('B5').fill.fgColor.argb).toBe('FFF9C6A1');
    expect(sheet.getCell('B6').value).toBe('Заметки\nЗаметка дня');
    expect(sheet.getCell('C3').value).toBeNull();
});
test.each([true, false])('downloads the selected period (private: %s)', async (privateExport) => {
    const execute = vi.fn().mockResolvedValue(report);
    const download = vi.fn();
    const repository = new BrowserDiaryRepository({ execute }, { download });
    const period = { from: report.from, to: report.to };
    await repository.execute({ action: 'exportReport', values: privateExport ? { period } : { report, notes: false } });
    expect(execute).toHaveBeenCalledTimes(privateExport ? 1 : 0);
    if (privateExport) expect(execute).toHaveBeenCalledWith({ action: 'report', values: period }, undefined);
    const [bytes, filename] = download.mock.calls[0];
    expect(filename).toBe('tishe-2026-10-01-2026-10-03.xlsx');
    const sheet = await sheetFrom(bytes);
    expect(sheet.getCell('B3').value.includes('HYPERLINK')).toBe(privateExport);
});
test('does not download when the export has been cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const download = vi.fn();
    const repository = new BrowserDiaryRepository({}, { download });
    await expect(
        repository.execute({ action: 'exportReport', values: { report } }, controller.signal),
    ).rejects.toThrow();
    expect(download).not.toHaveBeenCalled();
});

test('keeps long notes readable across continuation cells', async () => {
    const long = structuredClone(report);
    long.export_days[0].notes = ['Строка заметки\n'.repeat(90)];
    const sheet = await sheetFrom(await reportWorkbook(long));
    expect(sheet.rowCount).toBeGreaterThan(8);
    const cells = [];
    sheet.eachRow((row) => {
        expect(row.height || 15).toBeLessThanOrEqual(409);
        if (row.number >= 6) cells.push(row.getCell(2).value);
    });
    expect(cells.join('\n').match(/Строка заметки/g)).toHaveLength(90);
});
