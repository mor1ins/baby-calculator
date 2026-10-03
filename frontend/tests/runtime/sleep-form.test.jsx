import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { createRuntime } from '../../src/composition/container.js';
import { Providers } from '../../src/composition/Providers.jsx';
import { SleepForm } from '../../src/presentation/SleepForm.jsx';

it('patches only changed fields without truncating saved timestamp precision', async () => {
    const sleep = {
        id: 'sleep',
        day: '2026-10-03',
        kind: 'nap',
        start: '2026-10-03T07:50:41.700Z',
        end: '2026-10-03T09:10:38.400Z',
        ends_night: false,
        version: 3,
    };
    const execute = vi.fn().mockResolvedValue(sleep);
    const close = vi.fn();
    const runtime = createRuntime({ diaryRepository: { execute } });
    const day = { date: sleep.day, timezone: 'Europe/Moscow', sleeps: [sleep], previous_night: null };
    render(
        <Providers runtime={runtime}>
            <SleepForm sleep={sleep} day={day} close={close} />
        </Providers>,
    );
    fireEvent.change(screen.getByLabelText('Конец сна (пусто — ещё спит)'), { target: { value: '2026-10-03T12:20' } });
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить', exact: true }));
    expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'updateSleep', version: 3, values: { end: '2026-10-03T09:20:00Z' } }),
        undefined,
    );
    expect(close).toHaveBeenCalledOnce();
});
