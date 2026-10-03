import { expect, it, vi } from 'vitest';

import { createRuntime } from '../../src/composition/container.js';
import { commands } from '../../src/contracts/messages.js';
import { MessageBus } from '../../src/messaging/MessageBus.js';
import { session } from './support.js';

it('uses the real container and repository injection', async () => {
    const repository = { read: vi.fn().mockResolvedValue(session()) };
    const runtime = createRuntime({ repository });
    await expect(runtime.bus.send({ type: commands.loadSession })).resolves.toEqual(session());
    expect(repository.read).toHaveBeenCalledOnce();
    await expect(runtime.bus.send({ type: commands.readSession })).rejects.toThrow('Invalid message route');
});

function countingBus(calls, budget = 3) {
    return new MessageBus(
        {
            root: {
                layer: 'application',
                handle: async (_message, bus) =>
                    Promise.all(Array.from({ length: calls }, () => bus.send({ type: 'read' }))),
            },
            read: { layer: 'infrastructure', handle: async () => 42 },
        },
        budget,
    );
}

it('counts parallel child transfers and isolates concurrent root commands', async () => {
    await expect(countingBus(3).send({ type: 'root' })).rejects.toThrow('Message budget exceeded');
    const bus = countingBus(2);
    await expect(Promise.all([bus.send({ type: 'root' }), bus.send({ type: 'root' })])).resolves.toEqual([
        [42, 42],
        [42, 42],
    ]);
});

it('forbids same-layer nested commands', async () => {
    const bus = new MessageBus({
        root: { layer: 'application', handle: (_command, scoped) => scoped.send({ type: 'root' }) },
    });
    await expect(bus.send({ type: 'root' })).rejects.toThrow('Invalid message route');
});

it('closes escaped scopes and recovers after handler errors', async () => {
    let escaped;
    const handler = vi.fn(async (_command, scoped) => {
        escaped = scoped;
        throw new Error('Failed');
    });
    const bus = new MessageBus({
        root: { layer: 'application', handle: handler },
        read: { layer: 'infrastructure', handle: async () => 42 },
    });
    await expect(bus.send({ type: 'root' })).rejects.toThrow('Failed');
    await expect(escaped.send({ type: 'read' })).rejects.toThrow('Invalid message route');
    handler.mockImplementationOnce((_command, scoped) => scoped.send({ type: 'read' }));
    await expect(bus.send({ type: 'root' })).resolves.toBe(42);
});

it.each(['domain', 'infrastructure'])('forbids reverse calls from %s', async (layer) => {
    const bus = new MessageBus({
        root: { layer: 'application', handle: (_command, scoped) => scoped.send({ type: 'child' }) },
        child: { layer, handle: (_command, scoped) => scoped.send({ type: 'root' }) },
    });
    await expect(bus.send({ type: 'root' })).rejects.toThrow('Invalid message route');
});
