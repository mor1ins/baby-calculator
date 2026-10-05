export function themeHandler(repository) {
    return (command) => (command.action === 'write' ? repository.write(command.mode) : repository.read());
}
