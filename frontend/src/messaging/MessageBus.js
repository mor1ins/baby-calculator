const directions = Object.freeze({
    presentation: ['application'],
    application: ['domain', 'infrastructure'],
    domain: [],
    infrastructure: [],
});

export class MessageBus {
    #bindings;
    #budget;

    constructor(bindings, budget = 3) {
        this.#bindings = new Map(Object.entries(bindings));
        this.#budget = budget;
    }

    async send(command, { signal } = {}) {
        const execution = { calls: 0, active: true, signal };
        try {
            return await this.#dispatch(command, 'presentation', execution);
        } finally {
            execution.active = false;
        }
    }

    async #dispatch(command, source, execution) {
        execution.signal?.throwIfAborted();
        const binding = this.#bindings.get(command.type);
        if (!execution.active || !binding || !directions[source].includes(binding.layer)) {
            throw new Error('Invalid message route');
        }
        execution.calls += 1;
        if (execution.calls > this.#budget) throw new Error('Message budget exceeded');
        const scopedBus = {
            signal: execution.signal,
            send: (next) => this.#dispatch(next, binding.layer, execution),
        };
        return binding.handle(command, scopedBus);
    }
}
