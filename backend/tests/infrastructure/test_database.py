import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import SecretStr, ValidationError
from sqlalchemy.exc import OperationalError

from service.container import Container, create_database_engine, register_handlers
from service.contracts.health import CheckDatabase
from service.infrastructure.database import DatabaseReadinessHandler
from service.messaging.bus import ArchitectureViolation
from service.settings import Settings


@pytest.mark.parametrize("url", ["sqlite:///test.db", "postgresql://localhost/test", "bad-secret-url"])
def test_database_url_rejects_other_drivers_without_exposing_input(url: str) -> None:
    with pytest.raises(ValidationError) as caught:
        Settings(database_url=SecretStr(url))
    assert url not in str(caught.value)


@pytest.mark.asyncio
async def test_unconfigured_database_is_not_ready() -> None:
    assert create_database_engine(Settings(database_url=None)) is None
    assert not await DatabaseReadinessHandler(None, 1).handle(CheckDatabase())


@pytest.mark.asyncio
async def test_database_command_cannot_skip_application() -> None:
    with pytest.raises(ArchitectureViolation, match="api -> infrastructure"):
        container = Container()
        register_handlers(container)
        await container.message_bus().send(CheckDatabase())


@pytest.mark.asyncio
async def test_readiness_timeout_and_database_errors() -> None:
    connection_context = AsyncMock()
    engine = MagicMock()
    engine.connect.return_value = connection_context
    handler = DatabaseReadinessHandler(engine, 0.01)

    async def slow_connection() -> None:
        await asyncio.sleep(60)

    connection_context.__aenter__.side_effect = slow_connection
    assert not await handler.handle(CheckDatabase())
    connection_context.__aenter__.side_effect = OperationalError("SELECT 1", {}, Exception("private detail"))
    assert not await handler.handle(CheckDatabase())
