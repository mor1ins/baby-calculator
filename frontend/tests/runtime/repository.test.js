import { describe, expect, it, vi } from 'vitest';

import { createRuntime } from '../../src/composition/container.js';
import { commands } from '../../src/contracts/messages.js';
import { ApiClient } from '../../src/infrastructure/apiClient.js';
import { HttpSessionRepository } from '../../src/infrastructure/repositories/session.js';
import { jsonResponse, member, session } from './support.js';

class MemorySessionRepository {
    constructor(value) {
        this.value = value;
    }
    async read(signal) {
        signal?.throwIfAborted();
        return structuredClone(this.value);
    }
}

const factories = {
    memory: (value) => new MemorySessionRepository(value),
    http: (value) => new HttpSessionRepository(new ApiClient(vi.fn().mockResolvedValue(jsonResponse(value)))),
};

describe.each(Object.entries(factories))('%s repository contract', (_name, factory) => {
    it.each([null, member()])('reads the session through the real composition', async (user) => {
        const runtime = createRuntime({ repository: factory(session(user)) });
        await expect(runtime.bus.send({ type: commands.loadSession })).resolves.toEqual(session(user));
    });
    it('respects cancellation', async () => {
        const signal = AbortSignal.abort();
        await expect(factory(session()).read(signal)).rejects.toMatchObject({ name: 'AbortError' });
    });
});

it('isolates repositories and query caches between containers', async () => {
    const first = createRuntime({ repository: factories.memory(session(member('Анна'))) });
    const second = createRuntime({ repository: factories.memory(session(member('Мария'))) });
    first.queryClient.setQueryData(['session'], session(member('Кэш')));
    expect(second.queryClient.getQueryData(['session'])).toBeUndefined();
    const result = await Promise.all([first, second].map(({ bus }) => bus.send({ type: commands.loadSession })));
    expect(result.map(({ user }) => user.name)).toEqual(['Анна', 'Мария']);
});
