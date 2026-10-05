import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';

import { createRuntime } from '../../src/composition/container.js';
import { Providers } from '../../src/composition/Providers.jsx';
import { themePreference } from '../../src/contracts/theme.js';
import { BrowserThemeRepository } from '../../src/infrastructure/repositories/theme.js';
import { App } from '../../src/presentation/App.jsx';
import { ThemeSelector } from '../../src/presentation/theme/ThemeSelector.jsx';
import { member, session } from './support.js';

function environment(saved = null, dark = false) {
    const media = Object.assign(new EventTarget(), { matches: dark });
    const storage = new Map(saved === null ? [] : [['tishe.theme', saved]]);
    const browser = Object.assign(new EventTarget(), {
        matchMedia: () => media,
        localStorage: {
            getItem: (key) => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value),
        },
    });
    return {
        browser,
        system(value) {
            media.matches = value;
            media.dispatchEvent(new Event('change'));
        },
        external(value, key = 'tishe.theme') {
            storage.set('tishe.theme', value);
            browser.dispatchEvent(Object.assign(new Event('storage'), { key }));
        },
    };
}

const cleanup = [];
afterEach(() => {
    cleanup.splice(0).forEach((stop) => stop());
    delete globalThis.document.documentElement.dataset.theme;
});

async function mountTheme(env, profile = false) {
    const runtime = createRuntime({
        themeRepository: new BrowserThemeRepository(env.browser),
        repository: { read: async () => session(member()) },
    });
    cleanup.push(await runtime.startTheme(globalThis.document.documentElement));
    const view = render(
        <Providers runtime={runtime}>
            <MemoryRouter initialEntries={['/profile']}>{profile ? <App /> : <ThemeSelector />}</MemoryRouter>
        </Providers>,
    );
    return { ...view, runtime };
}

it.each([
    [null, false, 'Авто', 'light'],
    ['invalid', true, 'Авто', 'dark'],
    ['dark', false, 'Тёмная', 'dark'],
    ['light', true, 'Светлая', 'light'],
])('initializes preference %s before mounting UI', async (saved, dark, label, resolved) => {
    await mountTheme(environment(saved, dark));
    expect(screen.getByRole('radio', { name: label })).toBeChecked();
    expect(globalThis.document.documentElement).toHaveAttribute('data-theme', resolved);
});

it('switches in Profile with keyboard, persists, and follows the OS only in auto mode', async () => {
    const env = environment();
    const view = await mountTheme(env, true);
    const automatic = await screen.findByRole('radio', { name: 'Авто' });
    automatic.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Тёмная' })).toBeChecked();
    expect(env.browser.localStorage.getItem('tishe.theme')).toBe('dark');
    act(() => env.system(false));
    expect(globalThis.document.documentElement.dataset.theme).toBe('dark');
    view.unmount();
    await mountTheme(env);
    expect(screen.getByRole('radio', { name: 'Тёмная' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Авто' }));
    expect(globalThis.document.documentElement.dataset.theme).toBe('light');
    act(() => env.system(true));
    expect(globalThis.document.documentElement.dataset.theme).toBe('dark');
    await userEvent.click(screen.getByRole('radio', { name: 'Светлая' }));
    expect(globalThis.document.documentElement.dataset.theme).toBe('light');
});

it('synchronizes storage events and ignores unrelated keys', async () => {
    const env = environment('light', true);
    await mountTheme(env);
    act(() => env.external('dark', 'unrelated'));
    expect(globalThis.document.documentElement.dataset.theme).toBe('light');
    act(() => env.external('dark'));
    expect(await screen.findByRole('radio', { name: 'Тёмная' })).toBeChecked();
    act(() => env.external(null, null));
    expect(await screen.findByRole('radio', { name: 'Авто' })).toBeChecked();
    expect(globalThis.document.documentElement.dataset.theme).toBe('dark');
});

it('keeps switching when browser storage is unavailable', async () => {
    const env = environment();
    Object.defineProperty(env.browser, 'localStorage', {
        get() {
            throw new Error('Denied');
        },
    });
    await mountTheme(env);
    await userEvent.click(screen.getByRole('radio', { name: 'Тёмная' }));
    expect(globalThis.document.documentElement.dataset.theme).toBe('dark');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('releases OS and storage subscriptions on disposal', async () => {
    const env = environment();
    await mountTheme(env);
    cleanup.pop()();
    act(() => env.system(true));
    expect(globalThis.document.documentElement.dataset.theme).toBe('light');
    act(() => env.external('dark'));
    expect(globalThis.document.documentElement.dataset.theme).toBe('light');
});

it('validates theme commands before entering infrastructure', async () => {
    const repository = { read: vi.fn(), write: vi.fn() };
    const { bus } = createRuntime({ themeRepository: repository });
    await expect(bus.send({ type: themePreference, action: 'write', mode: 'broken' })).rejects.toThrow(
        'Unknown theme mode',
    );
    await expect(bus.send({ type: themePreference, action: 'delete' })).rejects.toThrow('Unknown theme action');
    expect(repository.write).not.toHaveBeenCalled();
});
