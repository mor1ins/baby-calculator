import { expect, test } from 'vitest';

import { BrowserDiaryRepository, reportCsv } from '../../src/infrastructure/repositories/browserDiary.js';

const report = {
    from: '2026-10-01',
    to: '2026-10-01',
    timezone: 'Europe/Moscow',
    rows: [
        {
            date: '2026-10-01',
            timezone: 'UTC',
            sleeps: [{ id: 'night', kind: 'night', start: '2026-10-01T20:00:00Z', end: null }],
            timeline: [{ sleep_id: 'night', comment: { text: '=HYPERLINK("unsafe")' } }],
        },
    ],
};
test('CSV excludes notes by default and keeps an open sleep duration unknown', () => {
    const csv = reportCsv(report, false);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"UTC";"night"');
    expect(csv).not.toContain('HYPERLINK');
    expect(csv.endsWith(';"";""')).toBe(true);
    expect(reportCsv(report, true)).toContain('"\'=HYPERLINK(""unsafe"")"');
});
test('public snapshot export does not re-fetch private data', async () => {
    const downloads = [];
    const repository = new BrowserDiaryRepository(
        {
            execute: () => {
                throw new Error('Unexpected private request');
            },
        },
        { download: (...args) => downloads.push(args) },
    );
    await repository.execute({ action: 'exportReport', values: { report, notes: false } });
    expect(downloads).toEqual([[reportCsv(report, false), 'tishe-2026-10-01-2026-10-01.csv']]);
});
