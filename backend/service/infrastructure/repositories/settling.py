from datetime import date, datetime
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from service.contracts.operations import AppError, Operation, OperationResult
from service.infrastructure.repositories.common import check_version
from service.infrastructure.repositories.days import DaysRepository


class SettlingRepository:
    def __init__(self, days: DaysRepository) -> None:
        self.days = days

    async def write(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        diary = await self.days.schedules.diary(user["id"])
        current = await self.days.records.one(
            "SELECT * FROM settling_attempts WHERE diary_id=:diary AND end_at IS NULL", diary=diary["id"],
        )
        if op.name == "startSettling":
            if current or any(sleep["end"] is None for sleep in await self.days.sleeps(diary["id"])):
                raise AppError(409, "active_interval", "Сначала завершите текущее укладывание или сон")
            day = date.fromisoformat(op.data["day"])
            if day != op.now.astimezone(ZoneInfo(diary["timezone"])).date():
                raise AppError(422, "validation_error", "Начать укладывание можно только сегодня")
            await self.days.ensure(diary, day, initialize=True)
            row = await self.days.records.require(
                """INSERT INTO settling_attempts(id,diary_id,day,start_at) VALUES (:id,:diary,:day,:now)
                   RETURNING id,day,start_at,end_at,sleep_id,version""",
                id=uuid4(), diary=diary["id"], day=day, now=op.now,
            )
            return OperationResult(row, 201)
        if current is None or str(current["id"]) != op.params["attempt_id"]:
            raise AppError(404, "not_found", "Активное укладывание не найдено")
        check_version(current["version"], op.version)
        if op.name == "cancelSettling":
            await self.days.records.rows("DELETE FROM settling_attempts WHERE id=:id", id=current["id"])
        else:
            await self.days.records.rows(
                "UPDATE settling_attempts SET end_at=:now,version=version+1 WHERE id=:id",
                id=current["id"], now=op.now,
            )
        return OperationResult(status=204)

    async def attach(self, diary_id: Any, sleep_id: Any, start: datetime) -> None:
        active = await self.days.records.one(
            "SELECT * FROM settling_attempts WHERE diary_id=:diary AND end_at IS NULL", diary=diary_id,
        )
        if active is None:
            return
        if start < active["start_at"]:
            raise AppError(422, "validation_error", "Засыпание не может предшествовать началу укладывания")
        await self.days.records.rows(
            "UPDATE settling_attempts SET end_at=:end,sleep_id=:sleep,version=version+1 WHERE id=:id",
            id=active["id"], end=start, sleep=sleep_id,
        )

    async def reconcile(self, sleep_id: Any, start: datetime | None, day: date) -> None:
        linked = await self.days.records.one(
            "SELECT * FROM settling_attempts WHERE sleep_id=:sleep", sleep=sleep_id,
        )
        if linked is None:
            return
        if start is not None and start < linked["start_at"]:
            raise AppError(422, "validation_error", "Засыпание не может предшествовать началу укладывания")
        await self.days.records.rows(
            """UPDATE settling_attempts SET end_at=:end,sleep_id=:sleep,day=:day,version=version+1
               WHERE id=:id""", id=linked["id"], end=start or linked["end_at"],
            sleep=sleep_id if start else None, day=day,
        )
