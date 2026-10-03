from service.contracts.health import CheckDatabase, CheckReadiness, RuntimeStatus
from service.contracts.messages import MessageBus


class ReadinessHandler:
    def __init__(self, status: RuntimeStatus, bus: MessageBus) -> None:
        self._status = status
        self._bus = bus

    async def handle(self, _message: CheckReadiness) -> bool:
        return self._status.started and bool(await self._bus.send(CheckDatabase()))
