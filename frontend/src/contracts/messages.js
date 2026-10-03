export const commands = Object.freeze({ loadSession: 'session.load', readSession: 'session.read' });

/**
 * @typedef {{type: string}} Command
 * @typedef {{send(command: Command, options?: {signal?: AbortSignal}): Promise<unknown>}} MessageBus
 * @typedef {{read(signal?: AbortSignal): Promise<{user: object|null, csrf_token: string}>}} SessionRepository
 */
