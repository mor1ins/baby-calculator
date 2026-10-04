from datetime import datetime
from typing import Any

from service.contracts.operations import AppError, Operation, OperationResult
from service.infrastructure.repositories.sleep_rules import exceeds_clock_tolerance
from service.infrastructure.repositories.sleeps import SleepsRepository


class EventsRepository:
    def __init__(self, sleeps: SleepsRepository, clock_skew_tolerance_minutes: int) -> None:
        self._sleeps = sleeps
        self._clock_skew_tolerance_minutes = clock_skew_tolerance_minutes

    async def touch(self, sleep: dict[str, Any], op: Operation) -> None:
        records = self._sleeps.days.records
        await records.rows("UPDATE sleep_intervals SET version=version+1,updated_at=:now WHERE id=:id",
                           id=sleep["id"], now=op.now)
        targets = await records.rows(
            "SELECT day_id FROM interval_targets WHERE left_sleep_id=:id AND retired_at IS NULL", id=sleep["id"],
        )
        self._sleeps.days.dirty.update([sleep["day_id"], *(target["day_id"] for target in targets)])

    async def write(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        diary = await self._sleeps.days.schedules.diary(user["id"])
        sleep = await self._sleeps.find(diary["id"], op.params["sleep_id"])
        records = self._sleeps.days.records
        # Serialize reuse of a client UUID, even across different owners.
        await records.rows("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))", key=op.params["event_id"])
        event = await records.one("SELECT * FROM sleep_events WHERE id=:id", id=op.params["event_id"])
        if event and (event["diary_id"] != diary["id"] or event["sleep_id"] != sleep["id"]):
            raise AppError(409, "idempotency_conflict", "Идентификатор отметки уже использован")
        if op.name == "deleteSleepEvent":
            return await self._delete(op, sleep, diary["id"], event)
        occurred = datetime.fromisoformat(op.data["occurred_at"].replace("Z", "+00:00"))
        if event:
            return self._repeat(event, occurred)
        if sleep["kind"] != "night" or sleep["end"] is not None:
            raise AppError(409, "sleep_closed", "Отметка доступна только во время ночного сна")
        if occurred < sleep["start"] or exceeds_clock_tolerance(
                occurred, op.now, self._clock_skew_tolerance_minutes):
            raise AppError(422, "validation_error", "Отметка должна находиться внутри текущего сна")
        await records.rows(
            """INSERT INTO sleep_events(id,diary_id,sleep_id,occurred_at,created_at)
               VALUES (:id,:diary,:sleep,:occurred,:now)""", id=op.params["event_id"], diary=diary["id"],
            sleep=sleep["id"], occurred=occurred, now=op.now,
        )
        await self.touch(sleep, op)
        return OperationResult({"id": op.params["event_id"], "occurred_at": occurred}, 201)

    @staticmethod
    def _repeat(event: dict[str, Any], occurred: datetime) -> OperationResult:
        if event["deleted_at"]:
            raise AppError(409, "event_deleted", "Эта отметка уже отменена")
        if event["occurred_at"] != occurred:
            raise AppError(409, "idempotency_conflict", "Данные повторного запроса отличаются")
        return OperationResult({"id": event["id"], "occurred_at": occurred})

    async def _delete(self, op: Operation, sleep: dict[str, Any], diary_id: Any,
                      event: dict[str, Any] | None) -> OperationResult:
        records = self._sleeps.days.records
        if event is None:
            await records.rows(
                """INSERT INTO sleep_events(id,diary_id,sleep_id,created_at,deleted_at)
                   VALUES (:id,:diary,:sleep,:now,:now)""",
                id=op.params["event_id"], diary=diary_id, sleep=sleep["id"], now=op.now,
            )
        elif not event["deleted_at"]:
            await records.rows("UPDATE sleep_events SET deleted_at=:now WHERE id=:id", id=event["id"], now=op.now)
            await self.touch(sleep, op)
        return OperationResult(status=204)
