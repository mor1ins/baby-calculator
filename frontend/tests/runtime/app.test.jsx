import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import { createRuntime } from '../../src/composition/container.js';
import { Providers } from '../../src/composition/Providers.jsx';
import { App } from '../../src/presentation/App.jsx';
import { deferred, jsonResponse, member, session } from './support.js';

function mount(runtime, path = '/') {
    return render(
        <Providers runtime={runtime}>
            <MemoryRouter initialEntries={[path]}>
                <App />
            </MemoryRouter>
        </Providers>,
    );
}

it('shows loading, then the session and accessible route navigation', async () => {
    const pending = deferred();
    const runtime = createRuntime({ repository: { read: () => pending.promise } });
    mount(runtime);
    expect(screen.getByRole('status')).toHaveTextContent('Подключаем');
    await act(async () => pending.resolve(session(member())));
    expect(await screen.findByText(/Здравствуйте, Анна/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Мои графики' }));
    expect(screen.getByRole('heading', { name: 'Мои графики' })).toHaveFocus();
});

it('shows a retryable error without inventing diary records', async () => {
    const transport = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('private network detail'))
        .mockResolvedValueOnce(jsonResponse(session()));
    mount(createRuntime({ transport }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось подключиться');
    expect(screen.queryByText('private network detail')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByRole('link', { name: 'Войти', exact: true })).toHaveAttribute('href', '/login');
});

it.each([
    [401, 'unauthenticated', /Сессия завершилась/],
    [403, 'account_blocked', /Доступ к аккаунту ограничен/],
])('handles access errors %s', async (status, code, message) => {
    mount(createRuntime({ transport: vi.fn().mockResolvedValue(jsonResponse({ code }, status)) }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
});

it('cancels unmounted requests and ignores their late responses', async () => {
    const old = deferred();
    const transport = vi
        .fn()
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce(jsonResponse(session(member('Новая'))));
    const runtime = createRuntime({ transport });
    const first = mount(runtime);
    first.unmount();
    expect(transport.mock.calls[0][1].signal.aborted).toBe(true);
    mount(runtime);
    expect(await screen.findByText(/Здравствуйте, Новая/)).toBeInTheDocument();
    await act(async () => old.resolve(jsonResponse(session(member('Старая')))));
    expect(screen.queryByText(/Здравствуйте, Старая/)).not.toBeInTheDocument();
});

it('handles unknown paths without querying private data', () => {
    const transport = vi.fn();
    mount(createRuntime({ transport }), '/missing');
    expect(screen.getByRole('heading', { name: 'Страница не найдена' })).toBeInTheDocument();
    expect(transport).not.toHaveBeenCalled();
});
