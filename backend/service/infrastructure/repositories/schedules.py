from typing import Any
from uuid import uuid4

from service.contracts.operations import AppError, Operation, OperationResult
from service.infrastructure.repositories.common import Records, check_timezone, check_version, nonempty
from service.infrastructure.repositories.identity import IdentityRepository


def validate_segments(segments: list[dict[str, Any]]) -> None:
    kinds = [part["kind"] for part in segments]
    expected = ["awake"] + [item for _ in range((len(kinds) - 2) // 2) for item in ("nap", "awake")] + ["night"]
    if kinds != expected:
        raise AppError(422, "validation_error", "Нужен порядок: бодрствование, сон, бодрствование… ночной сон")


class SchedulesRepository:
    def __init__(self, records: Records, identity: IdentityRepository) -> None:
        self._records = records
        self._identity = identity

    async def diary(self, user_id: Any) -> dict[str, Any]:
        return await self._records.require("SELECT * FROM diaries WHERE user_id=:id FOR UPDATE", id=user_id)

    async def get(self, diary_id: Any, schedule_id: Any) -> dict[str, Any]:
        result = await self._records.require(
            "SELECT id,version,name,archived FROM schedule_templates WHERE diary_id=:diary AND id=:id",
            diary=diary_id, id=schedule_id,
        )
        result["segments"] = await self._records.rows(
            "SELECT kind,duration_minutes FROM schedule_segments WHERE schedule_id=:id ORDER BY position",
            id=schedule_id,
        )
        return result

    async def active(self, diary_id: Any, schedule_id: Any) -> dict[str, Any]:
        result = await self.get(diary_id, schedule_id)
        if result["archived"]:
            raise AppError(409, "schedule_archived", "График в архиве")
        return result

    async def list_schedules(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        diary = await self.diary(op.params["user_id"] if op.name == "adminListSchedules" else user["id"])
        rows = await self._records.rows("SELECT id FROM schedule_templates WHERE diary_id=:id ORDER BY created_at,id",
                                        id=diary["id"])
        return OperationResult({"items": [await self.get(diary["id"], row["id"]) for row in rows]})

    async def segments(self, schedule_id: Any, segments: list[dict[str, Any]]) -> None:
        validate_segments(segments)
        await self._records.rows("DELETE FROM schedule_segments WHERE schedule_id=:id", id=schedule_id)
        for position, segment in enumerate(segments):
            await self._records.rows(
                """INSERT INTO schedule_segments(schedule_id,position,kind,duration_minutes)
                   VALUES (:id,:position,:kind,:duration)""",
                id=schedule_id, position=position, kind=segment["kind"], duration=segment["duration_minutes"],
            )

    async def create(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        diary = await self.diary(user["id"])
        schedule_id = uuid4()
        await self._records.rows(
            """INSERT INTO schedule_templates(id,diary_id,name,created_at,updated_at)
               VALUES (:id,:diary,:name,:now,:now)""", id=schedule_id, diary=diary["id"],
            name=nonempty(op.data["name"]), now=op.now,
        )
        await self.segments(schedule_id, op.data["segments"])
        return OperationResult(await self.get(diary["id"], schedule_id), 201)

    async def update(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        diary = await self.diary(user["id"])
        current = await self.get(diary["id"], op.params["schedule_id"])
        check_version(current["version"], op.version)
        data = {**current, **op.data}
        await self._records.rows(
            """UPDATE schedule_templates SET name=:name,archived=:archived,version=version+1,updated_at=:now
               WHERE id=:id""", name=nonempty(data["name"]), archived=data["archived"], now=op.now, id=current["id"],
        )
        if "segments" in op.data:
            await self.segments(current["id"], data["segments"])
        if data["archived"] and diary["default_schedule_id"] == current["id"]:
            await self._records.rows("UPDATE diaries SET default_schedule_id=NULL WHERE id=:id", id=diary["id"])
            await self._records.rows("UPDATE users SET version=version+1,updated_at=:now WHERE id=:id",
                                     now=op.now, id=user["id"])
        return OperationResult(await self.get(diary["id"], current["id"]))

    async def profile(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        check_version(user["version"], op.version)
        diary = await self.diary(user["id"])
        data = {**user, **op.data}
        check_timezone(data["timezone"])
        if data["default_schedule_id"] is not None:
            await self.active(diary["id"], data["default_schedule_id"])
        await self._records.rows("UPDATE users SET name=:name,version=version+1,updated_at=:now WHERE id=:id",
                                 name=nonempty(data["name"]), now=op.now, id=user["id"])
        await self._records.rows(
            "UPDATE diaries SET timezone=:timezone,default_schedule_id=:schedule,updated_at=:now WHERE id=:id",
            timezone=data["timezone"], schedule=data["default_schedule_id"], now=op.now, id=diary["id"],
        )
        return OperationResult(await self._identity.user(user["id"]))
