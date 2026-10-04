from datetime import date, datetime
from typing import Any
from uuid import uuid4

from service.contracts.operations import AppError, Operation, OperationResult
from service.infrastructure.repositories.common import check_version
from service.infrastructure.repositories.days import DaysRepository
from service.infrastructure.repositories.sleep_rules import sleep_cycle, sleep_times
from service.infrastructure.repositories.targets import TargetsRepository


def public_sleep(sleep: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in sleep.items() if key != "day_id"}


class SleepsRepository:
    def __init__(self, days: DaysRepository, targets: TargetsRepository, clock_skew_tolerance_minutes: int) -> None:
        self.days = days
        self._targets = targets
        self._clock_skew_tolerance_minutes = clock_skew_tolerance_minutes

    async def find(self, diary_id: Any, sleep_id: str) -> dict[str, Any]:
        sleeps = await self.days.sleeps(diary_id)
        result = next((sleep for sleep in sleeps if str(sleep["id"]) == sleep_id), None)
        if result is None:
            raise AppError(404, "not_found", "Сон не найден")
        return result

    async def write(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        diary = await self.days.schedules.diary(user["id"])
        current = await self.find(diary["id"], op.params["sleep_id"]) if op.name == "updateSleep" else None
        if current:
            check_version(current["version"], op.version)
        sleep = {**(current or {"id": uuid4(), "version": 1, "events": []}), **op.data}
        self._parse(sleep)
        day = await self.days.ensure(diary, sleep["day"], initialize=True)
        sleep_times(sleep, op.now, self._clock_skew_tolerance_minutes)
        sleep_cycle(sleep, await self.days.sleeps(diary["id"]), day["timezone"])
        await self._save(sleep, day, op, current)
        await self._targets.reconcile(diary, sleep["id"], op.now)
        self.days.dirty.add(day["id"])
        if current:
            self.days.dirty.add(current["day_id"])
        return OperationResult(public_sleep(await self.find(diary["id"], str(sleep["id"]))), 200 if current else 201)

    @staticmethod
    def _parse(sleep: dict[str, Any]) -> None:
        if isinstance(sleep["day"], str):
            sleep["day"] = date.fromisoformat(sleep["day"])
        for field in ("start", "end"):
            if isinstance(sleep[field], str):
                sleep[field] = datetime.fromisoformat(sleep[field].replace("Z", "+00:00"))

    async def _save(self, sleep: dict[str, Any], day: dict[str, Any],
                    op: Operation, current: dict[str, Any] | None) -> None:
        values = {key: sleep[key] for key in ("id", "kind", "start", "end", "ends_night")}
        day_id = day["id"]
        values.update(diary=day["diary_id"], day=day_id, now=op.now)
        if current:
            # Retire old sleep target before moving the composite FK to another day.
            if current["day_id"] != day_id:
                await self.days.records.rows(
                    """UPDATE interval_comments SET target_id=NULL,version=version+1,updated_at=:now
                       WHERE target_id IN (SELECT id FROM interval_targets WHERE sleep_id=:id)""",
                    id=sleep["id"], now=op.now,
                )
                await self.days.records.rows(
                    "UPDATE interval_targets SET day_id=:day,retired_at=:now WHERE sleep_id=:id",
                    id=sleep["id"], day=day_id, now=op.now,
                )
            await self.days.records.rows(
                """UPDATE sleep_intervals SET day_id=:day,kind=:kind,start_at=:start,end_at=:end,
                   ends_night=:ends_night,version=version+1,updated_at=:now WHERE id=:id""", **values,
            )
        else:
            await self.days.records.rows(
                """INSERT INTO sleep_intervals(id,diary_id,day_id,kind,start_at,end_at,ends_night,created_at,updated_at)
                   VALUES (:id,:diary,:day,:kind,:start,:end,:ends_night,:now,:now)""", **values,
            )

    async def delete(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        diary = await self.days.schedules.diary(user["id"])
        sleep = await self.find(diary["id"], op.params["sleep_id"])
        check_version(sleep["version"], op.version)
        if sleep["events"]:
            raise AppError(409, "sleep_has_events", "Сначала удалите ночные отметки этого сна")
        await self.days.records.rows("UPDATE sleep_intervals SET deleted_at=:now WHERE id=:id",
                                     id=sleep["id"], now=op.now)
        self.days.dirty.add(sleep["day_id"])
        await self._targets.reconcile(diary, sleep["id"], op.now)
        return OperationResult(status=204)
