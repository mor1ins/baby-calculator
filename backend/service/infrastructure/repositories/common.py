from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.engine import CursorResult

from service.contracts.operations import AppError
from service.infrastructure.repositories.transaction import Transaction


class Records:
    def __init__(self, transaction: Transaction) -> None:
        self.transaction = transaction

    async def rows(self, statement: str, **parameters: Any) -> list[dict[str, Any]]:
        result = await self.transaction.execute(statement, parameters)
        if isinstance(result, CursorResult) and result.returns_rows:
            return [dict(row) for row in result.mappings()]
        return []

    async def one(self, statement: str, **parameters: Any) -> dict[str, Any] | None:
        rows = await self.rows(statement, **parameters)
        return rows[0] if rows else None

    async def require(self, statement: str, **parameters: Any) -> dict[str, Any]:
        result = await self.one(statement, **parameters)
        if result is None:
            raise AppError(404, "not_found", "Запись не найдена")
        return result


def check_version(actual: int, expected: int | None) -> None:
    if expected is None:
        raise AppError(428, "version_required", "Нужна версия записи")
    if actual != expected:
        raise AppError(412, "version_conflict", "Запись изменилась. Обновите данные и сверьте изменения")


def check_timezone(value: str) -> None:
    try:
        ZoneInfo(value)
    except (ValueError, ZoneInfoNotFoundError) as exc:
        raise AppError(422, "validation_error", "Неизвестный часовой пояс") from exc


def nonempty(value: str) -> str:
    result = value.strip()
    if not result:
        raise AppError(422, "validation_error", "Поле не может быть пустым")
    return result
