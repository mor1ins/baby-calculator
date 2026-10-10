import json
import secrets
from datetime import date
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from service.contracts.operations import AppError, Operation, OperationResult
from service.infrastructure.repositories.days import DaysRepository
from service.infrastructure.security import token_digest


def public_child(child: dict[str, Any], today: date) -> dict[str, Any]:
    age = ""
    if child.get("born"):
        born = date.fromisoformat(child["born"])
        months = (today.year - born.year) * 12 + today.month - born.month - int(today.day < born.day)
        age = f"{months // 12} г. {months % 12} м." if months >= 12 else f"{max(0, months)} мес."
    return {"name": child.get("name", "Малыш"), "photo": child.get("photo", ""), "age": age}


class ReportsRepository:
    def __init__(self, days: DaysRepository) -> None:
        self.days = days

    async def report(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        return OperationResult(await self.document(op, user, public=False))

    async def document(self, op: Operation, user: dict[str, Any], public: bool) -> dict[str, Any]:
        values = op.data if op.name == "createShare" else op.params
        start, end = (date.fromisoformat(values[key]) for key in ("from", "to"))
        diary = await self.days.schedules.diary(user["id"])
        today = op.now.astimezone(ZoneInfo(diary["timezone"])).date()
        if not 0 <= (end - start).days <= 365 or end > today:
            raise AppError(422, "validation_error", "Выберите от 1 до 366 дней, не позднее сегодня")
        rows = await self.days.records.rows(
            "SELECT date FROM diary_days WHERE diary_id=:id AND date BETWEEN :start AND :end ORDER BY date",
            id=diary["id"], start=start, end=end,
        )
        documents = [await self.days.document(diary, row["date"]) for row in rows]
        changes = await self.days.records.rows(
            """SELECT id,date,text,version FROM routine_changes WHERE diary_id=:id AND date BETWEEN :start AND :end
               ORDER BY date,id""", id=diary["id"], start=start, end=end,
        )
        if public:
            for document in documents:
                document["comments"] = []
                document["context"] = {key: value for key, value in document["context"].items()
                                       if key in {"help", "mood"}}
        return {"from": start, "to": end, "timezone": diary["timezone"], "as_of": op.now,
                "documents": documents, "changes": changes,
                "child": public_child(diary["child"], today) if public else None}

    async def create_share(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        snapshot = await self.document(op, user, public=True)
        if not any(document["sleeps"] for document in snapshot["documents"]):
            raise AppError(422, "empty_report", "В выбранном периоде нет записей")
        diary = await self.days.schedules.diary(user["id"])
        token = secrets.token_urlsafe(32)
        row = await self.days.records.require(
            """INSERT INTO report_shares(id,diary_id,token_hash,snapshot,created_at)
               VALUES (:id,:diary,:token,CAST(:snapshot AS jsonb),:now) RETURNING id,created_at""",
            id=uuid4(), diary=diary["id"], token=token_digest(token),
            snapshot=json.dumps(snapshot, default=str), now=op.now,
        )
        return OperationResult({**row, "token": token}, 201)

    async def shares(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        diary = await self.days.schedules.diary(user["id"])
        if op.name == "revokeShare":
            await self.days.records.require(
                "UPDATE report_shares SET revoked_at=:now WHERE id=:id AND diary_id=:diary RETURNING id",
                id=op.params["share_id"], diary=diary["id"], now=op.now,
            )
            return OperationResult(status=204)
        rows = await self.days.records.rows(
            """SELECT id,created_at,revoked_at,snapshot->>'from' AS "from",snapshot->>'to' AS "to"
               FROM report_shares WHERE diary_id=:id ORDER BY created_at DESC""", id=diary["id"],
        )
        return OperationResult({"items": rows})

    async def public(self, op: Operation, _user: dict[str, Any]) -> OperationResult:
        row = await self.days.records.require(
            """SELECT r.snapshot FROM report_shares r JOIN diaries d ON d.id=r.diary_id
               JOIN users u ON u.id=d.user_id
               WHERE r.token_hash=:token AND r.revoked_at IS NULL AND NOT u.blocked""",
            token=token_digest(op.params["token"]),
        )
        return OperationResult(row["snapshot"])
