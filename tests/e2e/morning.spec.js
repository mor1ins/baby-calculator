import { test, expect } from '@playwright/test';

test('editing the night end starts today without a separate morning marker', async ({ page }) => {
    const date = (offset) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' })
        .format(new Date(Date.now() + offset * 86400000));
    const yesterday = date(-2), today = date(-1);
    const anonymous = await page.request.get('/api/v1/session');
    const registered = await page.request.post('/api/v1/register', {
        headers: { 'X-CSRF-Token': (await anonymous.json()).csrf_token },
        data: { name: 'Утренний сценарий', email: `morning-${Date.now()}@example.com`,
            password: 'Morning-test-123', timezone: 'Europe/Moscow' },
    });
    expect(registered.status()).toBe(201);
    const created = await page.request.post('/api/v1/sleeps', {
        headers: { 'X-CSRF-Token': (await registered.json()).csrf_token },
        data: { day: yesterday, kind: 'night', start: `${yesterday}T21:30:00+03:00`, end: null },
    });
    expect(created.status()).toBe(201);
    await page.goto(`/?date=${yesterday}`);
    await page.getByRole('button', { name: 'Завершить / исправить', exact: true }).click();
    await expect(page.getByLabel('Окончательное утреннее пробуждение')).toHaveCount(0);
    await page.getByLabel('Конец сна (пусто — ещё спит)').fill(`${today}T07:07`);
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Исправить сон' })).toHaveCount(0);
    await page.goto(`/?date=${today}`);
    await expect(page.getByText('Предыдущая ночь · подъём 07:07')).toBeVisible();
    await expect(page.getByText(/Утренняя граница неизвестна/)).toHaveCount(0);
    const current = await page.request.get(`/api/v1/days/${today}`);
    const day = await current.json();
    expect(day.previous_night.id).toBe((await created.json()).id);
    expect(day.timeline[0].start).toBe(`${today}T04:07:00Z`);
    expect(day.metrics.day_awake_seconds).toBeGreaterThan(0);
});
