export function actionHandler(repository) {
    return (command, { signal }) => repository.execute(command, signal);
}
