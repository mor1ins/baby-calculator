import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

const example = (name) => JSON.parse(readFileSync(new URL(`../../api/examples/${name}.json`, import.meta.url)));

test('approved mobile composition, responsive layout and modal keyboard behavior', async ({ page }) => {
    const day = example('day');
    const session = example('session');
    const plan = { ...day.schedule, id: day.schedule.source_id, version: 1, archived: false };
    await page.clock.setFixedTime(new Date(day.as_of));
    await page.route('**/api/v1/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        let body = { items: [] };
        if (path.endsWith('/session')) body = session;
        else if (path.endsWith('/schedules')) body = { items: [plan] };
        else if (path.endsWith('/days')) body = { items: [day] };
        else if (path.includes('/days/')) body = path.endsWith(day.date) ? day : example('empty-day');
        await route.fulfill({ json: body });
    });
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Текущий промежуток' })).toBeVisible();
    await expect(page.getByText('До следующего сна', { exact: true })).toBeVisible();
    for (const width of [320, 360, 390, 430]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'test-results/design-today.png', fullPage: true });
    const trigger = page.getByRole('button', { name: 'Записать сон вручную' });
    await trigger.click();
    const sheet = page.getByRole('dialog', { name: 'Записать сон' });
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement))).toBe(true);
    await page.screenshot({ path: 'test-results/design-sleep-sheet.png' });
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(trigger).toBeFocused();
    for (const [name, file] of [['Мои графики', 'schedules'], ['История', 'history'], ['Профиль', 'profile']]) {
        await page.getByRole('link', { name, exact: true }).click();
        await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
        await page.screenshot({ path: `test-results/design-${file}.png`, fullPage: true });
        if (file === 'schedules') {
            const actions = page.getByRole('button', { name: `Действия с графиком «${plan.name}»` });
            for (const width of [320, 390, 768]) {
                await page.setViewportSize({ width, height: 844 });
                const card = page.locator('.schedule-card');
                const before = await card.boundingBox();
                await actions.click();
                await expect(page.getByRole('button', { name: 'Копировать график', exact: true })).toBeVisible();
                expect((await card.boundingBox()).height).toBe(before.height);
                expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
                await page.screenshot({ path: `test-results/schedule-actions-${width}.png` });
                await page.keyboard.press('Escape');
                await expect(actions).toBeFocused();
            }
            await page.setViewportSize({ width: 390, height: 844 });
        }
    }
});
