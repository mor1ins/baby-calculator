import assert from 'node:assert/strict';
import { expect, test } from '@playwright/test';

import { account } from '../support/account.js';

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
    await page.getByRole('button', { name: 'Добавить событие', exact: true }).click();
    await page.getByLabel('Тип события').selectOption('night_awake');
    await page.getByLabel('Начало ночного бодрствования', { exact: true }).fill(`${yesterday}T22:00`);
    await page.getByLabel('Конец ночного бодрствования (пусто — ещё бодрствует)').fill(`${yesterday}T22:30`);
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Ночное бодрствование', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Ночное бодрствование', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Малыш бодрствует' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Снова уснул', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Добавить событие', exact: true })).toBeVisible();
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
    await page.goto('/');
    await page.getByRole('button', { name: 'Проснулся', exact: true }).click();
    const last = day.sleeps[0].wakings.at(-1);
    await expect(page.getByLabel('Начало сна', { exact: true })).toHaveValue(localInput(new Date(last.end)));
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const finished = (await read(`/days/${yesterday}`)).sleeps[0];
    assert.equal(finished.start, day.sleeps[0].start);
    assert.deepEqual(finished.wakings, day.sleeps[0].wakings);
    assert(finished.end);

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


for (const state of ['none', 'resumed', 'awake']) {
    for (const nextDay of [false, true]) {
        test(`wake-up ${state}, ${nextDay ? 'after' : 'before'} midnight persists through reload`, async ({ page, context }) => {
            const { write, read } = await account(context);
            const day = localDate(new Date(Date.now() - 2 * 86400000));
            const following = localDate(new Date(Date.now() - 86400000));
            const parent = await write('/sleeps', { day, kind: 'night', start: `${day}T20:00:00+03:00`, end: null });
            const waking = state === 'none' ? null : await write('/night-wakings', {
                day, start: `${day}T20:05:00+03:00`, end: state === 'resumed' ? `${day}T20:07:00+03:00` : null,
            });
            await page.goto(`/?date=${day}`);
            await page.getByRole('button', { name: 'Проснулся', exact: true }).click();
            const label = state === 'awake' ? 'Начало ночного бодрствования' : 'Начало сна';
            const start = state === 'none' ? '20:00' : state === 'awake' ? '20:05' : '20:07';
            await expect(page.getByLabel(label, { exact: true })).toHaveValue(`${day}T${start}`);
            const end = nextDay ? `${following}T07:00` : `${day}T20:28`;
            await page.getByLabel('Время пробуждения').fill(end);
            await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
            await expect(page.getByRole('dialog')).toHaveCount(0);
            const saved = (await read(`/days/${day}`)).sleeps[0];
            expect(saved.start).toBe(parent.start);
            expect(saved.end).toBe(new Date(`${end}:00+03:00`).toISOString().replace('.000', ''));
            expect(saved.ends_night).toBe(nextDay);
            if (waking) expect(saved.wakings[0].end).toBe(waking.end || saved.end);
            expect(Boolean((await read(`/days/${following}`)).previous_night)).toBe(nextDay);
            await page.reload();
            await expect(page.getByRole('button', { name: 'Проснулся', exact: true })).toHaveCount(0);
        });
    }
}

test('manual night waking bounds can be corrected and deleted from the timeline', async ({ page, context }) => {
    const { write, read } = await account(context);
    const day = localDate(new Date(Date.now() - 2 * 86400000));
    const following = localDate(new Date(Date.now() - 86400000));
    await write('/sleeps', { day, kind: 'night', start: `${day}T21:00:00+03:00`, end: `${following}T07:00:00+03:00` });
    await page.goto(`/?date=${day}`);
    await page.getByRole('button', { name: 'Добавить событие', exact: true }).click();
    await page.getByLabel('Тип события').selectOption('night_awake');
    await page.getByLabel('Начало ночного бодрствования', { exact: true }).fill(`${day}T22:00`);
    await page.getByLabel('Конец ночного бодрствования (пусто — ещё бодрствует)').fill(`${day}T22:30`);
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    const row = page.locator('.time-row.night-awake');
    await expect(row).toContainText('30 м');
    expect((await read(`/days/${day}`)).metrics.night_sleep_seconds).toBe(34200);
    await row.getByRole('button', { name: 'Изменить интервал', exact: true }).click();
    await page.getByLabel('Начало ночного бодрствования', { exact: true }).fill(`${day}T20:00`);
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect((await read(`/days/${day}`)).metrics.night_sleep_seconds).toBe(34200);
    await page.getByLabel('Начало ночного бодрствования', { exact: true }).fill(`${day}T22:10`);
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(row).toContainText('20 м');
    await page.reload();
    await expect(row).toContainText('20 м');
    await row.getByRole('button', { name: 'Изменить интервал', exact: true }).click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Удалить бодрствование', exact: true }).click();
    await expect(row).toHaveCount(0);
    expect((await read(`/days/${day}`)).metrics.night_sleep_seconds).toBe(36000);
});
