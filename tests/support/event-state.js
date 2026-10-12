import { expect } from '@playwright/test';
import { account } from './account.js';

// Keep today's fixture away from midnight without replacing either server or browser clocks.
const moscowHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
const offset = moscowHour >= 6 ? 3 : -10;
const zone = offset === 3 ? 'Europe/Moscow' : 'Pacific/Honolulu';
export const localInput = value => new Date(Date.parse(value) + offset * 3600000).toISOString().slice(0, 16);
export const instant = input => new Date(`${input}:00${offset === 3 ? '+03:00' : '-10:00'}`).toISOString().replace('.000', '');

export async function eventState(context, mode) {
    const api = await account(context, zone);
    const today = localInput(new Date().toISOString()).slice(0, 10);
    const todayStart = Date.parse(instant(`${today}T00:00`));
    const historical = ['history', 'overnight'].includes(mode);
    const start = todayStart - (historical ? 86400000 : 0);
    const day = localInput(new Date(start).toISOString()).slice(0, 10);
    const previous = localInput(new Date(start - 86400000).toISOString()).slice(0, 10);
    const width = historical ? 86400000 : Date.now() - start;
    const at = fraction => localInput(new Date(start + width * fraction).toISOString());
    const sleep = (kind, from, to) => api.write('/sleeps', { day, kind, start: instant(at(from)), end: to === null ? null : instant(at(to)) });
    if (mode !== 'empty') {
        await api.write('/sleeps', { day: previous, kind: 'night', start: instant(`${previous}T21:00`), end: instant(`${day}T00:00`) });
        await sleep('nap', 0.1, 0.2);
        if (!historical) {
            const attempt = await api.write('/settling', { day });
            await api.write(`/settling/${attempt.id}`, {}, 'PATCH', attempt.version);
            const saved = (await api.read(`/days/${day}`)).settling[0];
            await api.write(`/settling/${saved.id}`, { start: instant(at(0.22)), end: instant(at(0.24)) }, 'PUT', saved.version);
        }
        if (mode === 'settling') {
            const attempt = await api.write('/settling', { day });
            await api.write(`/settling/${attempt.id}`, { start: instant(at(0.65)), end: null }, 'PUT', attempt.version);
        } else if (mode === 'nap') {
            await sleep('nap', 0.65, null);
        } else if (['night', 'night_awake', 'overnight', 'history'].includes(mode)) {
            await sleep('night', 0.65, mode === 'history' ? 1 : null);
            await api.write('/night-wakings', { day, start: instant(at(0.7)), end: mode === 'night_awake' ? null : instant(at(0.75)) });
        }
    }
    return { ...api, day, at, url: mode === 'history' ? `/?date=${day}` : '/' };
}

export async function expectMode(page, mode) {
    if (mode === 'empty') await expect(page.getByRole('button', { name: 'Добавить ночной сон', exact: true })).toBeVisible();
    else if (mode === 'settling') await expect(page.getByRole('heading', { name: 'Укладывание длится' })).toBeVisible();
    else if (['night', 'overnight', 'night_awake'].includes(mode)) {
        await expect(page.getByRole('heading', { name: mode === 'night_awake' ? 'Малыш бодрствует' : 'Малыш спит уже' })).toBeVisible();
    } else if (mode === 'nap') await expect(page.getByRole('button', { name: 'Проснулся', exact: true })).toBeVisible();
    else if (mode === 'awake') await expect(page.getByRole('button', { name: 'Начать укладывание', exact: true })).toBeVisible();
    else await expect(page.getByRole('heading', { name: 'День дневника', exact: true })).toBeVisible();
}
