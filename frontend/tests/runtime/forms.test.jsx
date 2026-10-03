import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { Form } from '../../src/presentation/Forms.jsx';
import { absoluteTime, inputTime } from '../../src/presentation/time.js';

it('sends only visible fields, preserves failed input and clears passwords', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('Ошибка'));
    render(
        <Form
            initial={{ timezone: 'Europe/Moscow', email: 'mother@example.com' }}
            fields={[
                { name: 'email', label: 'Email' },
                { name: 'password', label: 'Пароль', type: 'password' },
            ]}
            submit={submit}
        />,
    );
    await userEvent.type(screen.getByLabelText('Пароль'), 'test-password');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ошибка');
    expect(submit).toHaveBeenCalledWith({ email: 'mother@example.com', password: 'test-password' });
    expect(screen.getByLabelText('Email')).toHaveValue('mother@example.com');
    expect(screen.getByLabelText('Пароль')).toHaveValue('');
});

it('converts diary-zone input and rejects ambiguous or nonexistent local times', () => {
    expect(absoluteTime('2026-10-03T06:30', 'Europe/Moscow')).toBe('2026-10-03T03:30:00Z');
    expect(inputTime('2026-10-03T03:30:00Z', 'Europe/Moscow')).toBe('2026-10-03T06:30');
    for (const value of ['2025-10-26T02:30', '2025-03-30T02:30']) {
        expect(() => absoluteTime(value, 'Europe/Berlin')).toThrow();
    }
});

it('retains user edits when a newer resource version arrives', async () => {
    const submit = vi.fn().mockRejectedValue(Object.assign(new Error('Conflict'), { code: 'version_conflict' }));
    const fields = [{ name: 'text', label: 'Текст' }];
    const rendered = render(<Form fields={fields} initial={{ text: 'Раньше' }} submit={submit} />);
    await userEvent.clear(screen.getByLabelText('Текст'));
    await userEvent.type(screen.getByLabelText('Текст'), 'Моя правка');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Данные изменились');
    rendered.rerender(<Form fields={fields} initial={{ text: 'Чужая правка' }} submit={submit} />);
    expect(screen.getByLabelText('Текст')).toHaveValue('Моя правка');
});
