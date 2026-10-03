from service.contracts.operations import OperationRepository, OperationResult, PersistOperation


class PersistOperationHandler:
    def __init__(self, repository: OperationRepository) -> None:
        self._repository = repository

    async def handle(self, message: PersistOperation) -> OperationResult:
        return await self._repository.execute(message.operation)
