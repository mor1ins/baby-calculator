from datetime import date, datetime, timedelta
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from service.contracts.operations import AppError, Operation, OperationResult
from service.infrastructure.repositories.common import check_version
from service.infrastructure.repositories.days import DaysRepository
from service.infrastructure.repositories.night_wakings import event_times


class SettlingRepository:
    def __init__(self, days: DaysRepository) -> None:
        self.days = days

    async def write(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        diary = await self.days.schedules.diary(user["id"])
        current = await self.days.records.one(
            "SELECT * FROM settling_attempts WHERE diary_id=:diary AND end_at IS NULL", diary=diary["id"],
        )
        if op.name == "startSettling":
            active_sleep = await self.days.records.one(
                "SELECT id FROM sleep_intervals WHERE diary_id=:id AND end_at IS NULL AND deleted_at IS NULL",
                id=diary["id"],
            )
            if current or active_sleep:
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

    async def update(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        diary = await self.days.schedules.diary(user["id"])
        current = await self.days.records.one(
            "SELECT * FROM settling_attempts WHERE diary_id=:diary AND id=:id",
            diary=diary["id"], id=op.params["attempt_id"],
        )
        if current is None:
            raise AppError(404, "not_found", "Укладывание не найдено")
        check_version(current["version"], op.version)
        values = dict(op.data)
        event_times(values, op.now, 0)
        if (values["end"] is None) != (current["end_at"] is None):
            raise AppError(422, "validation_error", "Для завершённого укладывания укажите обе границы")
        local_day = values["start"].astimezone(ZoneInfo(diary["timezone"])).date()
        if not current["day"] <= local_day <= current["day"] + timedelta(days=1):
            raise AppError(422, "validation_error", "Начало укладывания не относится к выбранному дню")
        sleeps = await self.days.sleeps(diary["id"])
        linked = next((sleep for sleep in sleeps if sleep["id"] == current["sleep_id"]), None)
        if linked and (values["end"] is None or values["end"] > linked["start"]):
            raise AppError(422, "validation_error", "Укладывание должно закончиться до засыпания")
        for sleep in sleeps:
            if (values["end"] is None or sleep["start"] < values["end"]) and (
                    sleep["end"] is None or values["start"] < sleep["end"]):
                raise AppError(409, "settling_overlap", "Укладывание пересекается со сном")
        overlap = await self.days.records.one(
            """SELECT id FROM settling_attempts WHERE diary_id=:diary AND id<>:id
               AND tstzrange(start_at,end_at,'[)') && tstzrange(:start,:end,'[)')""",
            diary=diary["id"], id=current["id"], **values,
        )
        if overlap:
            raise AppError(409, "settling_overlap", "Укладывания пересекаются")
        await self.days.records.rows(
            "UPDATE settling_attempts SET start_at=:start,end_at=:end,version=version+1 WHERE id=:id",
            id=current["id"], **values,
        )
        day = await self.days.ensure(diary, current["day"])
        self.days.dirty.add(day["id"])
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

    async def reconcile(self, sleep_id: Any, start: datetime | None, day: date,
                        previous_start: datetime | None = None) -> None:
        linked = await self.days.records.one(
            "SELECT * FROM settling_attempts WHERE sleep_id=:sleep", sleep=sleep_id,
        )
        if linked is None:
            return
        if start is not None and start < linked["start_at"]:
            raise AppError(422, "validation_error", "Засыпание не может предшествовать началу укладывания")
        end = linked["end_at"]
        if start is not None and (previous_start is None or end == previous_start):
            end = start
        if start is not None and end > start:
            raise AppError(422, "validation_error", "Сон начинается раньше окончания укладывания")
        await self.days.records.rows(
            """UPDATE settling_attempts SET end_at=:end,sleep_id=:sleep,day=:day,version=version+1
               WHERE id=:id""", id=linked["id"], end=end,
            sleep=sleep_id if start else None, day=day,
        )
