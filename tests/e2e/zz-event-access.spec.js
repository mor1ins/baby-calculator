import { expect, test } from '@playwright/test';
import { eventState, expectMode, instant, localInput } from '../support/event-state.js';

const modes = ['empty', 'awake', 'settling', 'nap', 'night', 'night_awake', 'overnight', 'history'];
const save = page => page.getByRole('button', { name: 'Сохранить', exact: true }).click();
const plusMinute = value => localInput(new Date(Date.parse(value) + 60000).toISOString());

async function addEvent(page, fixture) {
    await page.getByRole('button', { name: 'Добавить событие', exact: true }).click();
    await expect(page.getByLabel('День цикла', { exact: true })).toHaveValue(fixture.day);
    const type = page.getByLabel('Тип события');
    await expect(type.locator('option')).toHaveText(['Ночной сон', 'Дневной сон', 'Ночное бодрствование']);
    await type.selectOption('nap');
    await page.getByLabel('Начало сна', { exact: true }).fill(fixture.at(0.3));
    await page.getByLabel('Конец сна (пусто — ещё спит)').fill(fixture.at(0.4));
    await save(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const day = await fixture.read(`/days/${fixture.day}`);
    expect(day.sleeps.some(item => item.start === instant(fixture.at(0.3)) && item.end === instant(fixture.at(0.4)))).toBe(true);
}

async function editEvent(page, fixture, event) {
    const day = await fixture.read(`/days/${fixture.day}`);
    const kind = event.kind;
    const start = event.start || event.start_at;
    const entry = day.timeline.find(item => kind === 'night_awake' || kind === 'settling'
        ? item.id === event.id : item.sleep_id === event.id && item.kind === kind);
    const index = day.timeline.filter(item => item.kind === kind).indexOf(entry);
    expect(index).toBeGreaterThanOrEqual(0);
    const row = page.locator(`.time-row.${kind.replace('_', '-')}`).nth(index);
    await row.getByRole('button', { name: /^(Изменить интервал|Завершить \/ исправить)$/ }).click();
    const label = kind === 'settling' ? 'Начало укладывания' : kind === 'night_awake' ? 'Начало ночного бодрствования' : 'Начало сна';
    const value = plusMinute(start);
    await page.getByLabel(label, { exact: true }).fill(value);
    await save(page);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Добавить событие', exact: true })).toBeVisible();
    const updated = await fixture.read(`/days/${fixture.day}`);
    const candidates = kind === 'settling' ? updated.settling : kind === 'night_awake' ? updated.sleeps.flatMap(item => item.wakings) : updated.sleeps;
    const saved = candidates.find(item => item.id === event.id);
    expect(saved.start || saved.start_at).toBe(instant(value));
    expect(saved.end ?? saved.end_at ?? null).toBe(event.end ?? event.end_at ?? null);
}

async function editAwakeBoundaries(page, fixture) {
    const day = await fixture.read(`/days/${fixture.day}`);
    const entries = day.timeline.filter(item => item.kind === 'awake' && item.status !== 'forecast');
    for (const [index, entry] of entries.entries()) {
        await page.locator('.time-row.awake').nth(index).getByRole('button', { name: 'Исправить границы', exact: true }).click();
        await page.getByRole('button', { name: /^Окончание предыдущего сна/ }).click();
        const value = plusMinute(entry.start);
        await page.getByLabel('Конец сна (пусто — ещё спит)').fill(value);
        await save(page);
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await page.reload();
        await expect(page.getByRole('button', { name: 'Добавить событие', exact: true })).toBeVisible();
        const updated = await fixture.read(`/days/${fixture.day}`);
        expect(updated.timeline.some(item => item.kind === 'awake' && item.start === instant(value))).toBe(true);
    }
}

for (const mode of modes) {
    test(`${mode}: adding and editing events remains available through reload`, async ({ page, context }) => {
        const fixture = await eventState(context, mode);
        await page.goto(fixture.url);
        await expectMode(page, mode);
        await page.reload();
        await expectMode(page, mode);
        const before = await fixture.read(`/days/${fixture.day}`);
        await addEvent(page, fixture);
        if (mode !== 'empty') await expectMode(page, mode);
        await page.reload();
        await expect(page.getByRole('button', { name: 'Добавить событие', exact: true })).toBeVisible();
        const day = await fixture.read(`/days/${fixture.day}`);
        // Edit every stored event in the displayed cycle, including active ones, via its timeline row.
        const events = [
            ...day.sleeps,
            ...day.sleeps.flatMap(sleep => sleep.wakings.map(item => ({ ...item, kind: 'night_awake' }))),
            ...day.settling.map(item => ({ ...item, kind: 'settling' })),
        ];
        for (const event of events) await editEvent(page, fixture, event);
        await editAwakeBoundaries(page, fixture);
        if (mode !== 'empty') await expectMode(page, mode);
        const after = await fixture.read(`/days/${fixture.day}`);
        for (const sleep of before.sleeps.filter(item => !item.end)) {
            expect(after.sleeps.find(item => item.id === sleep.id).end).toBe(sleep.end);
        }
    });
}
