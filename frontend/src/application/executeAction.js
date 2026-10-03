import { persistAction } from '../contracts/operations.js';

export function executeAction(command, bus) {
    return bus.send({ ...command, type: persistAction });
}
