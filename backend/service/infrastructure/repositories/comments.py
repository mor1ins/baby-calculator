from typing import Any
from uuid import UUID

from service.contracts.operations import AppError, Operation, OperationResult
from service.infrastructure.repositories.common import check_version, nonempty
from service.infrastructure.repositories.events import EventsRepository
from service.infrastructure.repositories.sleeps import SleepsRepository


class CommentsRepository:
    def __init__(self, sleeps: SleepsRepository, events: EventsRepository) -> None:
        self._sleeps = sleeps
        self._events = events

    async def write(self, op: Operation, user: dict[str, Any]) -> OperationResult:
        diary = await self._sleeps.days.schedules.diary(user["id"])
        records = self._sleeps.days.records
        await records.rows("SELECT pg_advisory_xact_lock(hashtextextended(:key,0))", key=op.params["comment_id"])
        current = await records.one("SELECT * FROM interval_comments WHERE id=:id", id=op.params["comment_id"])
        if current and current["diary_id"] != diary["id"]:
            raise AppError(404, "not_found", "Заметка не найдена")
        check_version(current["version"] if current else 0, op.version)
        if current:
            await self._touch(current, diary["id"], op)
        if op.name == "deleteComment":
            if current is None:
                raise AppError(404, "not_found", "Заметка не найдена")
            await records.rows("DELETE FROM interval_comments WHERE id=:id", id=current["id"])
            return OperationResult(status=204)
        return await self._put(op, diary["id"], current)

    async def _put(self, op: Operation, diary_id: Any, current: dict[str, Any] | None) -> OperationResult:
        records = self._sleeps.days.records
        try:
            target_id = UUID(op.data["target_id"])
        except ValueError as exc:
            raise AppError(409, "comment_target_changed", "Интервал изменился") from exc
        target = await records.one(
            "SELECT * FROM interval_targets WHERE id=:id AND diary_id=:diary AND retired_at IS NULL",
            id=target_id, diary=diary_id,
        )
        if target is None:
            raise AppError(409, "comment_target_changed", "Интервал изменился. Выберите новый")
        occupied = await records.one("SELECT id FROM interval_comments WHERE target_id=:id", id=target_id)
        if occupied and str(occupied["id"]) != op.params["comment_id"]:
            raise AppError(409, "comment_exists", "У этого интервала уже есть заметка")
        comment = await records.require(
            """INSERT INTO interval_comments(id,diary_id,day_id,target_id,text,created_at,updated_at)
               VALUES (:id,:diary,:day,:target,:text,:now,:now)
               ON CONFLICT (id) DO UPDATE SET day_id=:day,target_id=:target,text=:text,
                   version=interval_comments.version+1,updated_at=:now RETURNING id,version,target_id,text,day_id""",
            id=op.params["comment_id"], diary=diary_id, day=target["day_id"], target=target_id,
            text=nonempty(op.data["text"]), now=op.now,
        )
        if not current or current["target_id"] != target_id:
            await self._touch(comment, diary_id, op)
        comment.pop("day_id")
        return OperationResult(comment)

    async def _touch(self, comment: dict[str, Any], diary_id: Any, op: Operation) -> None:
        self._sleeps.days.dirty.add(comment["day_id"])
        target = await self._sleeps.days.records.one("SELECT sleep_id FROM interval_targets WHERE id=:id",
                                                     id=comment["target_id"])
        if target and target["sleep_id"]:
            sleep = await self._sleeps.find(diary_id, str(target["sleep_id"]))
            await self._events.touch(sleep, op)
