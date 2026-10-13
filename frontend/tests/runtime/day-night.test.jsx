import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

import { createRuntime } from '../../src/composition/container.js';
import { Providers } from '../../src/composition/Providers.jsx';
import { DayPage } from '../../src/presentation/Day.jsx';

function nightDay() {
    const date = '2026-10-10';
    const sleeps = [
        ['first', 'nap', '05:40:00', '06:13:00', 1980],
        ['second', 'nap', '10:48:00', '13:01:53', 8033],
        ['night', 'night', '18:12:19', null, 761],
    ].map(([id, kind, start, end, duration_seconds]) => ({
        id,
        sleep_id: id,
        day: date,
        kind,
        start: `${date}T${start}Z`,
        end: end && `${date}T${end}Z`,
        duration_seconds,
        status: end ? 'completed' : 'ongoing',
        version: 1,
    }));
    return {
        date,
        timezone: 'Europe/Moscow',
        as_of: `${date}T18:25:00Z`,
        sleeps,
        timeline: sleeps,
        metrics: { day_sleep_seconds: 10013, day_awake_seconds: 43526, night_sleep_seconds: 761 },
        issues: ['missing_night_end'],
        orphaned_comments: [],
        settling: [],
    };
}

it.each([undefined, 'another-user'])('keeps daytime records visible during the night (owner: %s)', async (owner) => {
    const day = nightDay();
    const execute = vi.fn().mockResolvedValue(day);
    const runtime = createRuntime({ diaryRepository: { execute } });
    showDay(runtime, day, `/?date=${day.date}`, owner);
    expect(await screen.findByRole('heading', { name: 'Уже сегодня' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Лента дня' })).toBeVisible();
    for (const number of [1, 2]) {
        expect(screen.getByRole('heading', { name: `Дневной сон ${number}` })).toBeVisible();
    }
    const finish = screen.queryByRole('button', { name: 'Проснулся', exact: true });
    expect(Boolean(finish)).toBe(!owner);
    if (!owner) {
        expect(screen.getByRole('heading', { name: 'Малыш спит уже' })).toBeVisible();
        const night = screen.getByRole('heading', { name: /^Ночной сон/, level: 3 }).closest('section');
        await userEvent.click(within(night).getByRole('button', { name: 'Завершить / исправить' }));
        expect(screen.getByLabelText('Начало сна')).toHaveValue('2026-10-10T21:12');
    }
});

function showDay(runtime, day, route, owner) {
    render(
        <Providers runtime={runtime}>
            <MemoryRouter initialEntries={[route]}>
                <DayPage user={{ timezone: day.timezone }} owner={owner} />
            </MemoryRouter>
        </Providers>,
    );
}

afterEach(() => vi.useRealTimers());

function morningScenario() {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-11T06:00:00Z'));
    const night = { ...nightDay(), as_of: '2026-10-11T06:00:00Z' };
    const morning = { ...night, date: '2026-10-11', sleeps: [], timeline: [], previous_night: null };
    const execute = vi.fn(async ({ action, key, values }) => {
        if (action === 'updateSleep') {
            night.sleeps = night.sleeps.map((sleep) => (sleep.id === key ? { ...sleep, ...values } : sleep));
            morning.previous_night = night.sleeps.find((sleep) => sleep.id === key);
            return morning.previous_night;
        }
        if (action === 'child') return { profile: {}, version: 0 };
        if (action === 'schedules') return { items: [] };
        return structuredClone(key === night.date ? night : morning);
    });
    return { night, morning, execute, runtime: createRuntime({ diaryRepository: { execute } }) };
}

it.each(['none', 'resumed', 'awake'])(
    'finishes the last night segment without changing earlier sleep (%s)',
    async (state) => {
        const { runtime, morning, night, execute } = morningScenario();
        vi.setSystemTime(new Date('2026-10-11T06:00:45.678Z'));
        const sleep = night.sleeps.at(-1);
        if (state !== 'none')
            sleep.wakings = [
                { id: 'latest', start: '2026-10-11T02:00:00Z', end: state === 'awake' ? null : '2026-10-11T03:00:27Z' },
                { id: 'earlier', start: '2026-10-10T22:00:00Z', end: '2026-10-10T22:20:00Z' },
            ];
        const original = structuredClone(sleep);
        showDay(runtime, morning, '/');
        expect(
            await screen.findByRole('heading', { name: state === 'awake' ? 'Малыш бодрствует' : 'Малыш спит уже' }),
        ).toBeVisible();
        expect(screen.queryByText('Продолжается сон предыдущего дня.')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Добавить событие', exact: true })).toBeVisible();
        await userEvent.click(screen.getByRole('button', { name: 'Проснулся', exact: true }));
        expect(screen.getByLabelText('День цикла')).toHaveValue('2026-10-10');
        const start = screen.getByLabelText(state === 'awake' ? 'Начало ночного бодрствования' : 'Начало сна');
        expect(start).toHaveValue(
            { none: '2026-10-10T21:12', resumed: '2026-10-11T06:00', awake: '2026-10-11T05:00' }[state],
        );
        expect(start).toHaveAttribute('readonly');
        expect(screen.getByLabelText('Время пробуждения')).toHaveValue('2026-10-11T09:00');
        await userEvent.click(screen.getByRole('button', { name: 'Сохранить', exact: true }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(await screen.findByRole('heading', { name: 'Сегодня', exact: true })).toBeVisible();
        expect(execute.mock.calls.find(([request]) => request.action === 'updateSleep')[0]).toMatchObject({
            key: 'night',
            values: { end: '2026-10-11T06:00:45.678Z' },
        });
        expect(execute.mock.calls.find(([request]) => request.action === 'updateSleep')[0].values).toEqual({
            end: '2026-10-11T06:00:45.678Z',
        });
        expect(morning.previous_night.start).toBe(original.start);
        expect(morning.previous_night.wakings).toEqual(original.wakings);
    },
);

it.each([
    ['/?date=2026-10-09', undefined],
    ['/', 'another-user'],
])('preserves a selected historical day or administrator view (%s, %s)', async (route, owner) => {
    const { runtime, morning, execute } = morningScenario();
    showDay(runtime, morning, route, owner);
    await screen.findByRole('heading', { name: owner ? 'Лента дня' : /У каждого дня/ });
    expect(screen.queryByRole('heading', { name: 'Малыш спит уже' })).not.toBeInTheDocument();
    expect(execute.mock.calls.some(([request]) => request.key === '2026-10-10')).toBe(false);
});

it('keeps the night visible when an open home screen crosses midnight', async () => {
    const { runtime, night, execute } = morningScenario();
    night.as_of = '2026-10-10T20:59:00Z';
    vi.setSystemTime(new Date(night.as_of));
    showDay(runtime, night, '/');
    await screen.findByRole('heading', { name: 'Малыш спит уже' });
    night.as_of = '2026-10-11T06:00:00Z';
    vi.setSystemTime(new Date(night.as_of));
    await act(async () => runtime.queryClient.invalidateQueries({ queryKey: ['data'] }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Проснулся', exact: true })).toBeVisible());
    expect(screen.queryByRole('button', { name: 'Открыть текущий сон' })).not.toBeInTheDocument();
    await waitFor(() => expect(execute.mock.calls.some(([request]) => request.key === '2026-10-11')).toBe(true));
});
