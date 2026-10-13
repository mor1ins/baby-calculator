from datetime import datetime
from typing import Any
from uuid import uuid4

from service.contracts.operations import AppError, Operation, OperationResult
from service.infrastructure.repositories.common import check_version
from service.infrastructure.repositories.days import DaysRepository
from service.infrastructure.repositories.sleep_rules import exceeds_clock_tolerance


def event_times(values: dict[str, Any], now: datetime, tolerance: int) -> None:
    for field in ("start", "end"):
        if isinstance(values[field], str):
            values[field] = datetime.fromisoformat(values[field].replace("Z", "+00:00"))
        if values[field] and exceeds_clock_tolerance(values[field], now, tolerance):
            raise AppError(422, "validation_error", "Время события находится в будущем")
    if values["end"] is not None and values["end"] <= values["start"]:
        raise AppError(422, "validation_error", "Окончание должно быть позже начала")


def validate_wakings(sleep: dict[str, Any]) -> None:
    for waking in sleep.get("wakings", []):
        if (sleep["kind"] != "night" or waking["start"] < sleep["start"]
                or (sleep["end"] is not None and (waking["end"] is None or waking["end"] > sleep["end"]))):
            raise AppError(409, "wakings_outside_sleep", "Сначала исправьте границы ночного бодрствования")


class NightWakingsRepository:
    def __init__(self, days: DaysRepository, tolerance: int) -> None:
        self.days = days
        self.tolerance = tolerance

    async def write(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        diary = await self.days.schedules.diary(user["id"])
        current = None
        if op.name != "createNightWaking":
            current = await self.days.records.one(
                """SELECT id,version,sleep_id,start_at AS start,end_at AS end FROM night_wakings
                   WHERE diary_id=:diary AND id=:id""", diary=diary["id"], id=op.params["waking_id"],
            )
            if current is None:
                raise AppError(404, "not_found", "Ночное бодрствование не найдено")
            check_version(current["version"], op.version)
        sleeps = await self.days.sleeps(diary["id"])
        if op.name == "deleteNightWaking":
            assert current is not None
            await self.days.records.rows("DELETE FROM night_wakings WHERE id=:id", id=current["id"])
            deleted_parent = next(sleep for sleep in sleeps if sleep["id"] == current["sleep_id"])
            self.days.dirty.add(deleted_parent["day_id"])
            return OperationResult(status=204)
        values = {**(current or {"id": uuid4(), "version": 1}), **op.data}
        event_times(values, op.now, self.tolerance)
        parent = next((sleep for sleep in sleeps if sleep["kind"] == "night"
                       and (str(sleep["day"]) == values.get("day", str(sleep["day"])))
                       and (current is None or sleep["id"] == current["sleep_id"])
                       and sleep["start"] <= values["start"]
                       and (sleep["end"] is None or values["end"] is not None
                            and values["end"] <= sleep["end"])), None)
        if parent is None:
            raise AppError(422, "validation_error", "Укажите границы внутри записанного ночного сна")
        for waking in parent["wakings"]:
            if waking["id"] != values["id"] and (waking["end"] is None or values["start"] < waking["end"]) and (
                    values["end"] is None or waking["start"] < values["end"]):
                raise AppError(409, "waking_overlap", "Ночные бодрствования пересекаются")
        values.update(diary=diary["id"], sleep=parent["id"])
        if current:
            sql = """UPDATE night_wakings SET start_at=:start,end_at=:end,version=version+1 WHERE id=:id"""
        else:
            sql = """INSERT INTO night_wakings(id,diary_id,sleep_id,start_at,end_at)
                     VALUES (:id,:diary,:sleep,:start,:end)"""
        row = await self.days.records.require(
            sql + " RETURNING id,version,sleep_id,start_at AS start,end_at AS end", **values,
        )
        self.days.dirty.add(parent["day_id"])
        return OperationResult(row, 200 if current else 201)
