import asyncio

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine

from service.contracts.health import CheckDatabase

SCHEMA_REVISION = "0004_automatic_morning"


class DatabaseReadinessHandler:
    def __init__(self, engine: AsyncEngine | None, timeout: float) -> None:
        self._engine = engine
        self._timeout = timeout

    async def _check(self, engine: AsyncEngine) -> bool:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
            revisions = await connection.scalars(text("SELECT version_num FROM alembic_version"))
            return set(revisions) == {SCHEMA_REVISION}

    async def handle(self, _message: CheckDatabase) -> bool:
        if self._engine is None:
            return False
        try:
            return await asyncio.wait_for(self._check(self._engine), timeout=self._timeout)
        except (SQLAlchemyError, OSError, asyncio.TimeoutError):
            return False
