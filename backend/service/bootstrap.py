from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from service.api.errors import register_error_handlers
from service.container import Container, register_handlers
from service.contracts.health import RuntimeStatus
from service.settings import Settings


def create_app(*, container: Container | None = None) -> FastAPI:
    container = container if container is not None else Container()
    settings: Settings = container.settings()
    register_handlers(container)
    status: RuntimeStatus = container.runtime_status()
    engine = container.database_engine()

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        status.started = True
        try:
            yield
        finally:
            status.started = False
            if engine is not None:
                await engine.dispose()

    docs_enabled = settings.environment in {"local", "dev", "test"}
    app = FastAPI(
        title="Тише: backend", version="0.1.0", debug=False, lifespan=lifespan,
        docs_url="/docs" if docs_enabled else None, redoc_url=None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )
    register_error_handlers(app)
    app.include_router(container.health_endpoints().router())
    app.include_router(container.api_endpoints().router())
    return app
