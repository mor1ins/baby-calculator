import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { createRuntime } from '../../src/composition/container.js';
import { Providers } from '../../src/composition/Providers.jsx';
import { ApiError } from '../../src/contracts/errors.js';
import { Schedules } from '../../src/presentation/Schedules.jsx';
import { member, session } from './support.js';

it('retries only applying today after a saved template and day version conflict', async () => {
    const user = { ...member(), timezone: 'Europe/Moscow' };
    let plan = {
        id: 'plan',
        name: 'Обычный',
        version: 1,
        archived: false,
        segments: [
            { kind: 'awake', duration_minutes: 820 },
            { kind: 'night', duration_minutes: 600 },
        ],
    };
    let applyCount = 0;
    const execute = vi.fn(async (command) => {
        switch (command.action) {
            case 'schedules':
                return { items: [plan] };
            case 'day':
                return { version: 2, schedule: { name: 'Особый день' } };
            case 'updateSchedule':
                plan = { ...plan, ...command.values, version: 2 };
                return plan;
            case 'setSchedule':
                applyCount += 1;
                if (applyCount === 1) throw new ApiError('version_conflict', { status: 412 });
                return {};
            default:
                throw new Error('Unexpected action');
        }
    });
    const runtime = createRuntime({ repository: { read: async () => session(user) }, diaryRepository: { execute } });
    render(
        <Providers runtime={runtime}>
            <Schedules user={user} />
        </Providers>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Настроить график', exact: true }));
    const firstDuration = screen.getByLabelText('Бодрствование 1');
    expect(firstDuration).toHaveValue('13:40');
    await userEvent.clear(firstDuration);
    await userEvent.type(firstDuration, '0:00');
    expect(firstDuration).toBeInvalid();
    await userEvent.clear(firstDuration);
    await userEvent.type(firstDuration, '12:30');
    expect(firstDuration).toBeValid();
    await userEvent.selectOptions(screen.getByLabelText('Применение изменений'), 'today');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить', exact: true }));
    expect(await screen.findByText('График сохранён, но не применён к сегодняшнему дню.')).toBeInTheDocument();
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Применить к сегодня' }));
    const updates = execute.mock.calls.filter(([command]) => command.action === 'updateSchedule');
    expect(updates).toHaveLength(1);
    expect(updates[0][0].values.segments[0].duration_minutes).toBe(750);
    expect(execute.mock.calls.filter(([command]) => command.action === 'setSchedule')).toHaveLength(2);
});
