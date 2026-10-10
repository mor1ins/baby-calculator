import json
from datetime import date
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from service.contracts.operations import AppError, Operation, OperationResult
from service.infrastructure.repositories.common import check_version, nonempty
from service.infrastructure.repositories.days import DaysRepository


class DetailsRepository:
    def __init__(self, days: DaysRepository) -> None:
        self.days = days

    async def child(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        diary = await self.days.schedules.diary(user["id"])
        if op.name == "updateChild":
            check_version(diary["child_version"], op.version)
            born = op.data.get("born")
            if born and date.fromisoformat(born) > op.now.astimezone(ZoneInfo(diary["timezone"])).date():
                raise AppError(422, "validation_error", "Дата рождения не может быть в будущем")
            await self.days.records.rows(
                "UPDATE diaries SET child=CAST(:child AS jsonb),child_version=child_version+1 WHERE id=:id",
                id=diary["id"], child=json.dumps(op.data),
            )
            diary.update(child=op.data, child_version=diary["child_version"] + 1)
        return OperationResult({"profile": diary["child"], "version": diary["child_version"]})

    async def context(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        diary = await self.days.schedules.diary(user["id"])
        day = date.fromisoformat(op.params["date"])
        current = await self.days.document(diary, day)
        check_version(current["version"], op.version)
        row = await self.days.ensure(diary, day)
        await self.days.records.rows(
            "UPDATE diary_days SET context=CAST(:context AS jsonb) WHERE id=:id",
            id=row["id"], context=json.dumps(op.data),
        )
        self.days.dirty.add(row["id"])
        return OperationResult(status=204)

    async def change(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        diary = await self.days.schedules.diary(user["id"])
        if op.name == "createChange":
            row = await self.days.records.require(
                """INSERT INTO routine_changes(id,diary_id,date,text) VALUES (:id,:diary,:date,:text)
                   RETURNING id,date,text,version""", id=uuid4(), diary=diary["id"],
                date=date.fromisoformat(op.data["date"]), text=nonempty(op.data["text"]),
            )
            return OperationResult(row, 201)
        row = await self.days.records.require(
            "SELECT * FROM routine_changes WHERE id=:id AND diary_id=:diary",
            id=op.params["change_id"], diary=diary["id"],
        )
        check_version(row["version"], op.version)
        await self.days.records.rows("DELETE FROM routine_changes WHERE id=:id", id=row["id"])
        return OperationResult(status=204)
