from fastapi import APIRouter, HTTPException

from service.contracts.health import CheckReadiness
from service.contracts.messages import MessageBus


class HealthEndpoints:
    def __init__(self, bus: MessageBus) -> None:
        self._bus = bus

    async def health(self) -> dict[str, str]:
        return {"status": "ok"}

    async def ready(self) -> dict[str, str]:
        if not await self._bus.send(CheckReadiness()):
            raise HTTPException(status_code=503)
        return {"status": "ready"}

    def router(self) -> APIRouter:
        router = APIRouter(tags=["operations"])
        router.add_api_route("/health", self.health, methods=["GET"])
        router.add_api_route("/ready", self.ready, methods=["GET"])
        return router
