import { expect, test } from '@playwright/test';
import { account } from '../support/account.js';

const date = days => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date(Date.now() - days * 86400000));
const label = day => day.split('-').slice(1).reverse().join('.');

for (const crossesMidnight of [false, true]) {
    test(`rhythm respects calendar midnight: ${crossesMidnight ? 'split waking' : 'waking after midnight'}`, async ({ page, context }, testInfo) => {
        const { write } = await account(context);
        const first = date(3), second = date(2), third = date(1);
        await write('/sleeps', { day: first, kind: 'nap', start: `${first}T10:00:00+03:00`, end: `${first}T11:00:00+03:00` });
        await write('/sleeps', { day: first, kind: 'night', start: `${first}T21:00:00+03:00`, end: `${second}T07:00:00+03:00` });
        await write('/night-wakings', {
            day: first,
            start: crossesMidnight ? `${first}T23:50:00+03:00` : `${second}T03:00:00+03:00`,
            end: crossesMidnight ? `${second}T00:20:00+03:00` : `${second}T04:30:00+03:00`,
        });
        await write('/sleeps', { day: second, kind: 'nap', start: `${second}T11:00:00+03:00`, end: `${second}T12:00:00+03:00` });
        await write('/sleeps', { day: second, kind: 'night', start: `${second}T21:00:00+03:00`, end: `${third}T07:00:00+03:00` });
        await page.goto(`/statistics?from=${first}&to=${second}`);
        await page.getByRole('button', { name: 'Ритм суток', exact: true }).click();
        const axis = page.locator('.rhythm-axis span');
        await expect(axis.first()).toHaveText(crossesMidnight ? '00:00' : '02:30');
        await expect(axis.last()).toHaveText(crossesMidnight ? '00:00' : '21:30');
        const firstRow = page.getByRole('button', { name: `Расписание ${label(first)}`, exact: true });
        const secondRow = page.getByRole('button', { name: `Расписание ${label(second)}`, exact: true });
        await expect(firstRow.locator('.night-awake')).toHaveCount(crossesMidnight ? 1 : 0);
        await expect(secondRow.locator('.night-awake')).toHaveCount(1);
        for (const row of [firstRow, secondRow]) {
            for (const bar of await row.locator('path').all()) {
                const [, left, right] = (await bar.getAttribute('d')).match(/M([\d.]+) 0H([\d.]+)/);
                expect(Number(left)).toBeGreaterThanOrEqual(0);
                expect(Number(right)).toBeLessThanOrEqual(100);
                expect(Number(right)).toBeGreaterThan(Number(left));
            }
        }
        await page.screenshot({ path: testInfo.outputPath('calendar-rhythm.png'), fullPage: true });
    });
}
