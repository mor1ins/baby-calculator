import json
from datetime import date
from typing import Any
from uuid import uuid4

from service.contracts.operations import AppError, Operation, OperationResult
from service.infrastructure.repositories.common import Records, check_version
from service.infrastructure.repositories.schedules import SchedulesRepository


class DaysRepository:
    def __init__(self, records: Records, schedules: SchedulesRepository) -> None:
        self.records = records
        self.schedules = schedules
        self.created: set[Any] = set()
        self.dirty: set[Any] = set()

    async def ensure(self, diary: dict[str, Any], day: date, initialize: bool = False) -> dict[str, Any]:
        row = await self.records.one("SELECT * FROM diary_days WHERE diary_id=:id AND date=:date",
                                     id=diary["id"], date=day)
        if row is None:
            row = await self.records.require(
                """INSERT INTO diary_days(id,diary_id,date,timezone) VALUES (:id,:diary,:date,:timezone)
                   RETURNING *""", id=uuid4(), diary=diary["id"], date=day, timezone=diary["timezone"],
            )
            self.created.add(row["id"])
        if initialize and not row["schedule_initialized"]:
            snapshot = await self.snapshot(diary["id"], diary["default_schedule_id"])
            await self.assign(row["id"], snapshot)
            row.update(schedule_initialized=True, schedule_snapshot=snapshot)
        return row

    async def snapshot(self, diary_id: Any, schedule_id: Any) -> dict[str, Any] | None:
        if schedule_id is None:
            return None
        schedule = await self.schedules.active(diary_id, schedule_id)
        return {"source_id": str(schedule["id"]), "name": schedule["name"], "segments": schedule["segments"]}

    async def assign(self, day_id: Any, snapshot: dict[str, Any] | None) -> None:
        await self.records.rows(
            "UPDATE diary_days SET schedule_initialized=true,schedule_snapshot=CAST(:snapshot AS jsonb) WHERE id=:id",
            id=day_id, snapshot=json.dumps(snapshot) if snapshot else None,
        )
        self.dirty.add(day_id)

    async def finish(self, op: Operation) -> None:
        for day_id in self.dirty - self.created:
            await self.records.rows("UPDATE diary_days SET version=version+1,updated_at=:now WHERE id=:id",
                                    id=day_id, now=op.now)

    async def assign_schedule(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        diary = await self.schedules.diary(user["id"])
        day = date.fromisoformat(op.params["date"])
        current = await self.records.one("SELECT version FROM diary_days WHERE diary_id=:id AND date=:date",
                                         id=diary["id"], date=day)
        check_version(current["version"] if current else 0, op.version)
        row = await self.ensure(diary, day)
        await self.assign(row["id"], await self.snapshot(diary["id"], op.data["schedule_id"]))
        return OperationResult(await self.document(diary, day))

    async def sleeps(self, diary_id: Any) -> list[dict[str, Any]]:
        rows = await self.records.rows(
            """SELECT s.id,s.version,d.date AS day,s.day_id,s.kind,s.start_at AS start,s.end_at AS end,s.ends_night
               FROM sleep_intervals s JOIN diary_days d ON d.id=s.day_id
               WHERE s.diary_id=:id AND s.deleted_at IS NULL ORDER BY s.start_at,s.id""", id=diary_id,
        )
        events = await self.records.rows(
            """SELECT id,sleep_id,occurred_at FROM sleep_events WHERE diary_id=:id AND deleted_at IS NULL
               ORDER BY occurred_at,id""", id=diary_id,
        )
        for sleep in rows:
            sleep["events"] = [{"id": event["id"], "occurred_at": event["occurred_at"]}
                               for event in events if event["sleep_id"] == sleep["id"]]
        return rows

    async def document(self, diary: dict[str, Any], day: date) -> dict[str, Any]:
        row = await self.records.one("SELECT * FROM diary_days WHERE diary_id=:id AND date=:date",
                                     id=diary["id"], date=day)
        zone = row["timezone"] if row else diary["timezone"]
        sleeps = await self.sleeps(diary["id"])
        previous_ids = await self.records.rows(
            """SELECT s.id FROM sleep_intervals s JOIN diary_days d ON d.id=s.day_id
               WHERE s.diary_id=:id AND s.ends_night AND s.deleted_at IS NULL AND d.date < :date
                   AND (s.end_at AT TIME ZONE d.timezone)::date=:date""", id=diary["id"], date=day,
        )
        previous = [sleep for sleep in sleeps if sleep["id"] in {row["id"] for row in previous_ids}]
        comments = await self.records.rows(
            """SELECT c.id,c.version,c.target_id,c.text FROM interval_comments c JOIN diary_days d ON d.id=c.day_id
               WHERE d.diary_id=:id AND d.date=:date ORDER BY c.created_at,c.id""", id=diary["id"], date=day,
        )
        targets = await self.records.rows(
            """SELECT t.* FROM interval_targets t JOIN diary_days d ON d.id=t.day_id
               WHERE d.diary_id=:id AND d.date=:date AND t.retired_at IS NULL""", id=diary["id"], date=day,
        )
        version = row["version"] + int(row["id"] in self.dirty - self.created) if row else 0
        schedule = row["schedule_snapshot"] if row and row["schedule_initialized"] else await self.snapshot(
            diary["id"], diary["default_schedule_id"])
        return {"date": day, "version": version, "timezone": zone,
                "schedule": schedule,
                "previous_night": previous[-1] if previous else None,
                "sleeps": [sleep for sleep in sleeps if sleep["day"] == day], "targets": targets,
                "comments": comments}

    async def get_day(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        diary = await self.schedules.diary(op.params["user_id"] if op.name.startswith("admin") else user["id"])
        return OperationResult(await self.document(diary, date.fromisoformat(op.params["date"])))

    async def list_days(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        start, end = (date.fromisoformat(op.params[key]) for key in ("from", "to"))
        if not 0 <= (end - start).days <= 30:
            raise AppError(422, "validation_error", "Диапазон истории — от 1 до 31 дня")
        diary = await self.schedules.diary(op.params["user_id"] if op.name.startswith("admin") else user["id"])
        rows = await self.records.rows(
            "SELECT date FROM diary_days WHERE diary_id=:id AND date BETWEEN :start AND :end ORDER BY date DESC",
            id=diary["id"], start=start, end=end,
        )
        return OperationResult([await self.document(diary, row["date"]) for row in rows])
