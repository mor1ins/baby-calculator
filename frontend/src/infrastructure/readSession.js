export function sessionReader(repository) {
    return (_command, { signal }) => repository.read(signal);
}
