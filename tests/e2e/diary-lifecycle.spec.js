import { test, expect } from '@playwright/test';
import { account } from '../support/account.js';

const date = offset => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date(Date.now() + offset * 86400000));
const save = page => page.getByRole('button', { name: 'Сохранить', exact: true }).click();
async function diary(context) {
    const api = await account(context);
    const day = date(-2), previous = date(-3);
    await api.write('/sleeps', { day: previous, kind: 'night', start: `${previous}T21:00:00+03:00`, end: `${day}T07:00:00+03:00` });
    return { ...api, day };
}
async function addNap(page, day, start = '10:00', end = '11:00') {
    await page.getByRole('button', { name: 'Добавить событие', exact: true }).click();
    await page.getByLabel('Начало сна', { exact: true }).fill(`${day}T${start}`);
    await page.getByLabel('Конец сна (пусто — ещё спит)').fill(`${day}T${end}`);
    await save(page);
}
const editNap = page => page.locator('.time-row.nap').first().getByRole('button', { name: 'Изменить интервал', exact: true }).click();

test('sleep and note create, edit, delete persist and recalculate the diary', async ({ page, context }) => {
    const { day, read } = await diary(context);
    await page.goto(`/?date=${day}`);
    await addNap(page, day);
    const nap = page.locator('.time-row.nap');
    await expect(nap).toContainText('1 ч');
    await nap.getByRole('button', { name: 'Добавить заметку', exact: true }).click();
    await page.getByLabel('Заметка', { exact: true }).fill('Первая заметка');
    await save(page);
    await page.reload();
    await expect(nap).toContainText('Первая заметка');
    await editNap(page);
    await page.getByLabel('Конец сна (пусто — ещё спит)').fill(`${day}T11:30`);
    await save(page);
    await expect(nap).toContainText('1 ч 30 м');
    expect((await read(`/days/${day}`)).metrics.day_sleep_seconds).toBe(5400);
    await nap.getByRole('button', { name: 'Изменить заметку', exact: true }).click();
    await page.getByLabel('Заметка', { exact: true }).fill('Исправленная заметка');
    await save(page);
    await expect(nap).toContainText('Исправленная заметка');
    await nap.getByRole('button', { name: 'Изменить заметку', exact: true }).click();
    await page.getByRole('button', { name: 'Удалить заметку', exact: true }).click();
    await expect(nap.getByRole('button', { name: 'Добавить заметку', exact: true })).toBeVisible();
    await editNap(page);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Удалить сон', exact: true }).click();
    await expect(nap).toHaveCount(0);
    await page.reload();
    expect((await read(`/days/${day}`)).metrics.day_sleep_seconds).toBe(0);
    await expect(page.getByText('Исправленная заметка', { exact: true })).toHaveCount(0);
});

test('invalid bounds and overlap preserve input and do not change stored data', async ({ page, context }) => {
    const { day, read } = await diary(context);
    await page.goto(`/?date=${day}`);
    await addNap(page, day);
    await expect(page.locator('.time-row.nap')).toHaveCount(1);
    await addNap(page, day, '10:30', '12:00');
    await expect(page.getByRole('alert')).toContainText('пересекаются');
    await expect(page.getByLabel('Начало сна', { exact: true })).toHaveValue(`${day}T10:30`);
    expect((await read(`/days/${day}`)).sleeps).toHaveLength(1);
    await page.getByLabel('Начало сна', { exact: true }).fill(`${day}T13:00`);
    await save(page);
    await expect(page.getByRole('alert')).toContainText('позже начала');
    expect((await read(`/days/${day}`)).sleeps).toHaveLength(1);
    await page.getByLabel('Конец сна (пусто — ещё спит)').fill(`${day}T14:00`);
    await save(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.time-row.nap')).toHaveCount(2);
    expect((await read(`/days/${day}`)).metrics.day_sleep_seconds).toBe(7200);
});

test('two browser tabs cannot silently overwrite another edit', async ({ page, context }) => {
    const { day, read } = await diary(context);
    await page.goto(`/?date=${day}`);
    await addNap(page, day);
    await expect(page.locator('.time-row.nap')).toHaveCount(1);
    const second = await context.newPage();
    await second.goto(`/?date=${day}`);
    await editNap(second);
    await second.getByLabel('Конец сна (пусто — ещё спит)').fill(`${day}T11:45`);
    await editNap(page);
    await page.getByLabel('Конец сна (пусто — ещё спит)').fill(`${day}T11:30`);
    await save(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    second.on('dialog', dialog => dialog.dismiss());
    await save(second);
    await expect(second.getByRole('alert')).toContainText(/Данные изменились|Изменения не сохранены/);
    await expect(second.getByLabel('Конец сна (пусто — ещё спит)')).toHaveValue(`${day}T11:45`);
    expect((await read(`/days/${day}`)).sleeps[0].end).toBe(`${day}T08:30:00Z`);
    await second.close();
});

test('schedule edits and archival preserve historical snapshots', async ({ page, context }) => {
    const { day, write, read } = await diary(context);
    await page.goto('/schedules');
    await page.getByRole('button', { name: 'Создать график', exact: true }).click();
    await page.getByLabel('Название графика').fill('Сохранённый режим');
    await save(page);
    await expect(page.getByRole('heading', { name: 'Сохранённый режим', exact: true })).toBeVisible();
    const plan = (await read('/schedules')).items[0];
    await write(`/days/${day}/schedule`, { schedule_id: plan.id }, 'PUT', (await read(`/days/${day}`)).version);
    await page.getByRole('button', { name: 'Сделать по умолчанию', exact: true }).click();
    await expect(page.getByText('По умолчанию', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Настроить график', exact: true }).click();
    await page.getByLabel('Название графика').fill('Новый режим');
    await save(page);
    await expect(page.getByRole('heading', { name: 'Новый режим', exact: true })).toBeVisible();
    expect((await read(`/days/${day}`)).schedule.name).toBe('Сохранённый режим');
    await page.getByRole('button', { name: 'Действия с графиком «Новый режим»' }).click();
    await page.getByRole('button', { name: 'В архив', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    expect((await read('/session')).user.default_schedule_id).toBeNull();
    expect((await read(`/days/${day}`)).schedule.name).toBe('Сохранённый режим');
    await page.getByRole('button', { name: 'Действия с графиком «Новый режим»' }).click();
    await page.getByRole('button', { name: 'Вернуть из архива', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await read('/schedules')).items[0].archived).toBe(false);
});

test('timezone changes persist without reinterpreting historical sleep times', async ({ page, context }) => {
    const { day, read } = await diary(context);
    await page.goto(`/?date=${day}`);
    await addNap(page, day);
    await expect(page.locator('.time-row.nap')).toHaveCount(1);
    await page.getByRole('link', { name: 'Профиль', exact: true }).click();
    await page.getByRole('button', { name: 'Изменить личные данные', exact: true }).click();
    await page.getByLabel('Ваше имя').fill('Новое имя родителя');
    await save(page);
    await expect(page.getByRole('heading', { name: 'Новое имя родителя' })).toBeVisible();
    await page.getByRole('button', { name: /Часовой пояс Europe\/Moscow/ }).click();
    await page.getByRole('textbox', { name: 'Часовой пояс', exact: true }).fill('Europe/Berlin');
    await save(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    expect((await read('/session')).user.timezone).toBe('Europe/Berlin');
    const saved = await read(`/days/${day}`);
    expect(saved.timezone).toBe('Europe/Moscow');
    expect(saved.sleeps[0].start).toBe(`${day}T07:00:00Z`);
    await page.goto(`/?date=${day}`);
    await expect(page.locator('.time-row.nap')).toContainText('10:00');
});

test('another signed-in family cannot see or modify a private diary', async ({ page, context, browser }) => {
    const { day, read } = await diary(context);
    await page.goto(`/?date=${day}`);
    await addNap(page, day);
    await expect(page.locator('.time-row.nap')).toHaveCount(1);
    const original = (await read(`/days/${day}`)).sleeps[0];
    const other = await browser.newContext({ baseURL: new URL(page.url()).origin });
    try {
        const secondAccount = await account(other);
        const second = await other.newPage();
        await second.goto(`/?date=${day}`);
        await expect(second.getByRole('button', { name: 'Добавить ночной сон', exact: true })).toBeVisible();
        await expect(second.locator('.time-row.nap')).toHaveCount(0);
        const session = await secondAccount.read('/session');
        const response = await other.request.patch(`/api/v1/sleeps/${original.id}`, {
            headers: { 'X-CSRF-Token': session.csrf_token, 'If-Match': `"${original.version}"` },
            data: { end: `${day}T09:00:00Z` },
        });
        expect(response.status()).toBe(404);
        expect((await read(`/days/${day}`)).sleeps[0]).toEqual(original);
        await page.reload();
        await expect(page.locator('.time-row.nap')).toContainText('1 ч');
    } finally {
        await other.close();
    }
});
