import { commands } from '../contracts/messages.js';

export function loadSession(_command, bus) {
    return bus.send({ type: commands.readSession });
}
