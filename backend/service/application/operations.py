from service.contracts.messages import MessageBus
from service.contracts.operations import CalculateDays, Operation, OperationResult, PersistOperation


class OperationHandler:
    def __init__(self, bus: MessageBus) -> None:
        self._bus = bus

    async def handle(self, message: Operation) -> OperationResult:
        result: OperationResult = await self._bus.send(PersistOperation(message))
        if result.error:
            raise result.error
        if message.name in {"getDay", "adminGetDay", "listDays", "adminListDays", "setDaySchedule"}:
            listing = message.name in {"listDays", "adminListDays"}
            documents = result.body if listing else [result.body]
            calculated = await self._bus.send(CalculateDays(documents, message.now, listing))
            result.body = {"items": calculated} if listing else calculated[0]
        return result
