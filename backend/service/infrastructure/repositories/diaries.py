from datetime import datetime
from uuid import UUID

from service.contracts.repositories import Diary
from service.infrastructure.repositories.transaction import Transaction


class SqlDiariesRepository:
    def __init__(self, transaction: Transaction) -> None:
        self._transaction = transaction

    async def add(self, diary: Diary, now: datetime) -> Diary:
        await self._transaction.execute(
            """INSERT INTO diaries(id,user_id,timezone,default_schedule_id,created_at,updated_at)
               VALUES (:id,:user_id,:timezone,:schedule,:now,:now)""",
            {"id": diary.id, "user_id": diary.user_id, "timezone": diary.timezone,
             "schedule": diary.default_schedule_id, "now": now},
        )
        return diary

    async def find_by_owner(self, user_id: UUID) -> Diary | None:
        result = await self._transaction.execute(
            "SELECT id,user_id,timezone,default_schedule_id FROM diaries WHERE user_id=:user_id", {"user_id": user_id},
        )
        row = result.mappings().one_or_none()
        if row is None:
            return None
        return Diary(row["id"], row["user_id"], row["timezone"], row["default_schedule_id"])
