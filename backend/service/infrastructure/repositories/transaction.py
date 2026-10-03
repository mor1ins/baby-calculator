from typing import Any

from sqlalchemy import Result, text
from sqlalchemy.exc import DataError, IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from service.contracts.repositories import PersistenceConflict


class Transaction:
    """Session access stays inside infrastructure; repositories cannot outlive this scope."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.active = False
        self.failed = False

    def require_active(self) -> None:
        if not self.active or self.failed:
            raise RuntimeError("Transaction is inactive or requires rollback")

    async def execute(self, statement: str, parameters: dict[str, Any]) -> Result[Any]:
        self.require_active()
        try:
            result = await self.session.execute(text(statement), parameters)
            return result
        except SQLAlchemyError as exc:
            self.failed = True
            if isinstance(exc, (IntegrityError, DataError)):
                raise PersistenceConflict("Database constraint conflict") from exc
            raise
