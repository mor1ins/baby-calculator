import { themeModes } from '../../contracts/theme.js';

const storageKey = 'tishe.theme';

export class BrowserThemeRepository {
    #environment;
    #media;
    #mode;
    #listeners = new Set();

    constructor(environment = globalThis) {
        this.#environment = environment;
        this.#media = environment.matchMedia?.('(prefers-color-scheme: dark)');
    }

    #storedMode() {
        try {
            const saved = this.#environment.localStorage.getItem(storageKey);
            return themeModes.includes(saved) ? saved : 'auto';
        } catch {
            return 'auto';
        }
    }

    read() {
        this.#mode ??= this.#storedMode();
        const system = this.#media?.matches ? 'dark' : 'light';
        return { mode: this.#mode, resolved: this.#mode === 'auto' ? system : this.#mode };
    }

    write(mode) {
        this.#mode = mode;
        try {
            this.#environment.localStorage.setItem(storageKey, mode);
        } catch {
            // An unavailable store must not prevent switching in this session.
        }
        this.#notify();
        return this.read();
    }

    #notify = () => {
        const preference = this.read();
        this.#listeners.forEach((listener) => listener(preference));
    };

    #storageChanged = (event) => {
        if (event.key !== storageKey && event.key !== null) return;
        this.#mode = this.#storedMode();
        this.#notify();
    };

    subscribe(listener) {
        this.#listeners.add(listener);
        if (this.#listeners.size === 1) {
            this.#media?.addEventListener('change', this.#notify);
            this.#environment.addEventListener('storage', this.#storageChanged);
        }
        return () => {
            this.#listeners.delete(listener);
            if (this.#listeners.size !== 0) return;
            this.#media?.removeEventListener('change', this.#notify);
            this.#environment.removeEventListener('storage', this.#storageChanged);
        };
    }
}
