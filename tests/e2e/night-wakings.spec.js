import assert from 'node:assert/strict';
import { expect, test } from '@playwright/test';

async function account(context) {
    const api = context.request;
    let session = await (await api.get('/api/v1/session')).json();
    const write = async (path, data, method = 'POST', version) => {
        const response = await api.fetch('/api/v1' + path, {
            method, data,
            headers: { 'X-CSRF-Token': session.csrf_token, ...(version ? { 'If-Match': `"${version}"` } : {}) },
        });
        assert(response.ok(), await response.text());
        return response.status() === 204 ? null : response.json();
    };
    session = await write('/register', {
        email: `night-waking-${Date.now()}@example.com`, password: 'Night-Waking-test-123',
        name: 'Тест', timezone: 'Europe/Moscow',
    });
    return { write, read: async (path) => (await api.get('/api/v1' + path)).json() };
}

const localDate = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(value);
const localInput = (value) => new Date(value.getTime() + 3 * 3600000).toISOString().slice(0, 16);

test('night waking can be entered, timed, edited and shown in the rhythm chart', async ({ page, context }, testInfo) => {
    const { write, read } = await account(context);
    const today = localDate(new Date());
    const yesterday = localDate(new Date(Date.now() - 86400000));
    await write('/sleeps', { day: yesterday, kind: 'night', start: `${yesterday}T21:00:00+03:00`, end: null });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Малыш спит уже' })).toBeVisible();
    for (const theme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: theme });
        await page.screenshot({ path: testInfo.outputPath(`night-home-${theme}.png`), fullPage: true });
    }
    await write('/night-wakings', { day: yesterday, start: `${yesterday}T22:00:00+03:00`, end: `${yesterday}T22:30:00+03:00` });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ночное бодрствование', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ночное бодрствование', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Малыш бодрствует' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Снова уснул', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('night-awake-mobile.png'), fullPage: true });
    await page.getByRole('button', { name: 'Снова уснул', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Малыш спит уже' })).toBeVisible();
    const row = page.locator('.time-row.night-awake').first();
    await row.getByRole('button', { name: 'Изменить интервал' }).click();
    await page.getByLabel(/Конец ночного бодрствования/).fill(`${yesterday}T22:45`);
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(row).toContainText('45 м');
    const day = await read(`/days/${yesterday}`);
    assert.equal(day.sleeps[0].wakings.length, 2);
    assert.equal(day.metrics.day_awake_seconds, null);
    await page.goto(`/statistics?from=${yesterday}&to=${today}`);
    await page.getByRole('button', { name: 'Ритм суток', exact: true }).click();
    await expect(page.locator('.rhythm-svg .night-awake').first()).toBeAttached();
    for (const theme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize({ width: 320, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        await page.screenshot({ path: testInfo.outputPath(`night-rhythm-${theme}.png`), fullPage: true });
    }
});

test('settling is a timeline event with editable boundaries', async ({ page, context }, testInfo) => {
    const { write } = await account(context);
    const now = new Date();
    const today = localDate(now);
    const yesterday = localDate(new Date(now.getTime() - 86400000));
    const start = new Date(now.getTime() - 30 * 60000);
    const sleepStart = new Date(now.getTime() - 10 * 60000);
    await write('/sleeps', { day: yesterday, kind: 'night', start: `${yesterday}T18:00:00+03:00`, end: `${today}T00:00:00+03:00` });
    const attempt = await write('/settling', { day: today });
    await write(`/settling/${attempt.id}`, { start: start.toISOString(), end: null }, 'PUT', attempt.version);
    await write('/sleeps', { day: today, kind: 'nap', start: sleepStart.toISOString(), end: null });
    await page.goto('/');
    const row = page.locator('.time-row.settling');
    await expect(row.getByRole('heading', { name: 'Укладывание', exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'Изменить интервал' }).click();
    await page.getByLabel('Начало укладывания').fill(localInput(new Date(start.getTime() + 5 * 60000)));
    await page.getByLabel('Конец укладывания').fill(localInput(new Date(sleepStart.getTime() - 2 * 60000)));
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(row).toContainText('13 м');
    await page.screenshot({ path: testInfo.outputPath('settling-edited.png'), fullPage: true });
});
