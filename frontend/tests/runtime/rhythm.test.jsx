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
    expect(rhythmScale([{ ...rows[0], nightStart: 1470 }]).to).toBe(1500);
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

test('keeps night wakings visible in the shared scale with their own chart color', () => {
    const waking = { ...rows[0], nightWakings: [[1500, 1545]] };
    expect(rhythmScale([waking])).toEqual({ from: 300, to: 1590 });
    const { container } = render(<Rhythm report={{ rows: [waking], from: waking.date, calendar_days: 1 }} />);
    expect(screen.getByText('Ночное бодрствование')).toBeVisible();
    expect(container.querySelector('.rhythm-svg .night-awake')).not.toBeNull();
});
