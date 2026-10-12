import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { Rhythm } from '../../src/presentation/ReportPanels.jsx';
import { rhythmScale } from '../../src/presentation/rhythmScale.js';

const rows = [
    { date: '2026-10-01', morning: 345, nightStart: 1230, nightEnd: 1810, settleStart: 1229, naps: [[600, 660]] },
    { date: '2026-10-02', morning: 420, nightStart: 1200, nightEnd: 1800, settleStart: 1190, naps: [[610, 670]] },
].map((row) => ({ ...row, timeline: [], settling: 1, timezone: 'Europe/Moscow' }));

test('uses a shared compact scale without hiding early mornings or late bedtimes', () => {
    expect(rhythmScale(rows)).toEqual({ from: 300, to: 1260 });
    expect(rhythmScale([{ ...rows[0], nightStart: 1470 }]).to).toBe(1260);
    expect(rhythmScale([])).toEqual({ from: 330, to: 1230 });
});

test('draws the incoming night and updates calculations when another day is selected', async () => {
    const { container } = render(<Rhythm report={{ rows, from: '2026-10-01', calendar_days: 2 }} />);
    expect(screen.getByText('05:00 → 21:00')).toBeVisible();
    expect(container.querySelectorAll('.rhythm-svg .night')).toHaveLength(4);
    const bar = container.querySelector('.rhythm-svg .settling').getAttribute('d');
    const [left, right] = bar
        .match(/M([\d.]+) 0H([\d.]+)/)
        .slice(1)
        .map(Number);
    expect(right - left).toBeCloseTo(1.6);
    expect(screen.getByText(/Подъём/)).toBeVisible();
    const calculations = within(screen.getByRole('region', { name: 'Расчёты дня и следующей ночи' }));
    expect(calculations.getByText('20:00')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Расписание 01.10' }));
    expect(calculations.getByText('20:30')).toBeVisible();
    expect(calculations.queryByText('20:00')).not.toBeInTheDocument();
});

test('shows a night waking only on its calendar date without extending beyond midnight', () => {
    const previous = { ...rows[0], nightWakings: [[1620, 1710]] };
    const following = { ...rows[1], nightWakings: [[180, 270]] };
    expect(rhythmScale([previous, following])).toEqual({ from: 150, to: 1260 });
    const { container } = render(
        <Rhythm report={{ rows: [previous, following], from: previous.date, calendar_days: 2 }} />,
    );
    const tracks = container.querySelectorAll('.rhythm-svg');
    expect(tracks[0].querySelector('.night-awake')).toBeNull();
    expect(tracks[1].querySelectorAll('.night-awake')).toHaveLength(1);
});

test('clips a waking across midnight into two calendar-day portions', () => {
    const split = [
        { ...rows[0], nightWakings: [[1430, 1460]] },
        { ...rows[1], nightWakings: [[-10, 20]] },
    ];
    expect(rhythmScale(split)).toEqual({ from: 0, to: 1440 });
    const { container } = render(<Rhythm report={{ rows: split, from: split[0].date, calendar_days: 2 }} />);
    expect(screen.getByText('00:00 → 00:00')).toBeVisible();
    const bars = [...container.querySelectorAll('.rhythm-svg .night-awake')];
    expect(bars).toHaveLength(2);
    const coordinates = bars.map((bar) =>
        bar
            .getAttribute('d')
            .match(/M([\d.]+) 0H([\d.]+)/)
            .slice(1)
            .map(Number),
    );
    expect(coordinates[0][1]).toBe(100);
    expect(coordinates[1][0]).toBe(0);
    expect(coordinates[1][1]).toBeCloseTo((20 / 1440) * 100);
});
