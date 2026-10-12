import { test, expect } from '@playwright/test';

test('morning home keeps the ongoing night directly available until wake-up', async ({ page }) => {
    const anonymous = await (await page.request.get('/api/v1/session')).json();
    const registered = await page.request.post('/api/v1/register', {
        headers: { 'X-CSRF-Token': anonymous.csrf_token },
        data: { name: 'Утренняя проверка', email: `overnight-${Date.now()}@example.com`,
            password: 'Overnight-test-123', timezone: 'Europe/Moscow' },
    });
    expect(registered.status()).toBe(201);
    const session = await registered.json();
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date());
    const midnight = Date.parse(`${today}T00:00:00+03:00`);
    const previous = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date(midnight - 1));
    const created = await page.request.post('/api/v1/sleeps', {
        headers: { 'X-CSRF-Token': session.csrf_token },
        data: { day: previous, kind: 'night', start: new Date(midnight - 3 * 3600000).toISOString(), end: null },
    });
    expect(created.status()).toBe(201);
    const sleep = await created.json();
    await page.goto('/');
    for (const reload of [false, true]) {
        if (reload) await page.reload();
        await expect(page.getByRole('heading', { name: 'Малыш спит уже' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Завершить ночной сон', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Открыть текущий сон' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Добавить ночной сон', exact: true })).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Завершить ночной сон', exact: true }).click();
    await expect(page.getByLabel('День цикла')).toHaveValue(previous);
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
    const day = await (await page.request.get(`/api/v1/days/${today}`)).json();
    expect(day.previous_night.id).toBe(sleep.id);
    expect(day.previous_night.ends_night).toBe(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
});
