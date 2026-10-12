import ExcelJS from 'exceljs';
import assert from 'node:assert/strict';

export async function checkWorkbook(download, from, to, note, privateReport) {
    assert.equal(await download.failure(), null);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(await download.path());
    assert.equal(workbook.worksheets.length, 1);
    const sheet = workbook.worksheets[0];
    const dates = sheet.getRow(1).values.slice(2).map(value => value.toISOString().slice(0, 10));
    assert.equal(dates[0], from);
    assert.equal(dates.at(-1), to);
    assert.equal(dates.length, (Date.parse(to) - Date.parse(from)) / 86400000 + 1);
    const text = JSON.stringify(sheet.getSheetValues());
    assert.equal(text.includes(note), privateReport);
    assert(text.includes('Ночной сон'));
    assert(!text.includes('OUTSIDE_SELECTED_PERIOD'));
}
