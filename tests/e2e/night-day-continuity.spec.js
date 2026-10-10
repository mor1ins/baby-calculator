import { test, expect } from '@playwright/test';

test('starting night through settling keeps the whole day visible after reload', async ({ page }, testInfo) => {
    const api = page.request;
    let session = await (await api.get('/api/v1/session')).json();
    const post = async (path, data, method = 'POST', version) => {
        const response = await api.fetch(`/api/v1${path}`, {
            method, data,
            headers: { 'X-CSRF-Token': session.csrf_token, ...(version === undefined ? {} : { 'If-Match': `"${version}"` }) },
        });
        expect(response.ok(), await response.text()).toBeTruthy();
        return response.json();
    };
    session = await post('/register', {
        email: `night-continuity-${Date.now()}@example.com`, password: 'Local-night-test-123',
        name: 'Ночной тест', timezone: 'Europe/Moscow',
    });
    const schedule = await post('/schedules', {
        name: 'Два дневных сна',
        segments: ['awake', 'nap', 'awake', 'nap', 'awake', 'night'].map(kind => ({ kind, duration_minutes: kind === 'night' ? 600 : 60 })),
    });
    await post('/me', { default_schedule_id: schedule.id }, 'PATCH', session.user.version);
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date());
    const midnight = Date.parse(`${date}T00:00:00+03:00`);
    const previous = new Date(midnight - 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/Moscow' });
    const stamp = fraction => new Date(midnight + (Date.now() - midnight) * fraction).toISOString();
    await post('/sleeps', { day: previous, kind: 'night', start: new Date(midnight - 36000000).toISOString(), end: stamp(0) });
    for (const [start, end] of [[0.2, 0.3], [0.5, 0.6]]) {
        await post('/sleeps', { day: date, kind: 'nap', start: stamp(start), end: stamp(end) });
    }
    await page.goto('/');
    await page.getByRole('button', { name: 'Начать укладывание', exact: true }).click();
    await page.getByRole('button', { name: 'Уснул', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Минут назад' }).press('Home');
    await page.getByRole('button', { name: 'Записать сон', exact: true }).click();
    for (const reload of [false, true]) {
        if (reload) await page.reload();
        await expect(page.getByRole('heading', { name: 'Малыш спит уже' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Уже сегодня' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Лента дня' })).toBeVisible();
        await expect(page.locator('.time-row.nap')).toHaveCount(2);
        await expect(page.locator('.time-row.night')).toHaveCount(1);
        await expect(page.locator('.settling-note')).toContainText('Укладывание');
    }
    for (const colorScheme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
        await page.screenshot({ path: testInfo.outputPath(`night-${colorScheme}.png`), fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    }
    await page.getByRole('button', { name: 'Завершить ночной сон', exact: true }).click();
    await expect(page.getByLabel('Начало сна')).toBeVisible();
    await page.getByRole('button', { name: 'Отмена', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.time-row.nap')).toHaveCount(2);
    await expect(page.locator('.time-row.night')).toHaveCount(1);
});
