import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

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
    render(
        <Providers runtime={runtime}>
            <MemoryRouter initialEntries={[`/?date=${day.date}`]}>
                <DayPage user={{ timezone: day.timezone }} owner={owner} />
            </MemoryRouter>
        </Providers>,
    );
    expect(await screen.findByRole('heading', { name: 'Уже сегодня' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Лента дня' })).toBeVisible();
    for (const number of [1, 2]) {
        expect(screen.getByRole('heading', { name: `Дневной сон ${number}` })).toBeVisible();
    }
    const finish = screen.queryByRole('button', { name: 'Завершить ночной сон', exact: true });
    expect(Boolean(finish)).toBe(!owner);
    if (!owner) {
        expect(screen.getByRole('heading', { name: 'Малыш спит уже' })).toBeVisible();
        const night = screen.getByRole('heading', { name: /^Ночной сон/, level: 3 }).closest('section');
        await userEvent.click(within(night).getByRole('button', { name: 'Завершить / исправить' }));
        expect(screen.getByLabelText('Начало сна')).toHaveValue('2026-10-10T21:12');
    }
});
