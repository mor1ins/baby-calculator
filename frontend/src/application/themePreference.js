import { themeModes, themeStorage } from '../contracts/theme.js';

export function changeTheme(command, bus) {
    if (command.action !== 'read' && command.action !== 'write') throw new Error('Unknown theme action');
    if (command.action === 'write' && !themeModes.includes(command.mode)) throw new Error('Unknown theme mode');
    return bus.send({ ...command, type: themeStorage });
}
