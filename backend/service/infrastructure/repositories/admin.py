import base64
import json
from typing import Any
from uuid import UUID, uuid4

from service.contracts.operations import AppError, Operation, OperationResult
from service.infrastructure.repositories.common import Records, check_version, nonempty
from service.infrastructure.repositories.identity import IdentityRepository


class AdminRepository:
    def __init__(self, records: Records, identity: IdentityRepository) -> None:
        self._records = records
        self._identity = identity

    async def users(self, op: Operation, _actor: dict[str, Any]) -> OperationResult:
        query, limit = op.params.get("q", ""), int(op.params.get("limit", "30"))
        cursor = self._cursor(op.params.get("cursor"), query, limit)
        rows = await self._records.rows(
            """SELECT id FROM users WHERE (name ILIKE :query OR email ILIKE :query)
               AND (CAST(:cursor AS uuid) IS NULL OR id > CAST(:cursor AS uuid)) ORDER BY id LIMIT :limit""",
            query=f"%{query}%", cursor=cursor, limit=limit + 1,
        )
        next_cursor = None
        if len(rows) > limit:
            payload = json.dumps([str(rows[limit - 1]["id"]), query, limit]).encode()
            next_cursor = base64.urlsafe_b64encode(payload).decode()
        return OperationResult({"items": [await self._identity.user(row["id"]) for row in rows[:limit]],
                                "next_cursor": next_cursor})

    @staticmethod
    def _cursor(value: str | None, query: str, limit: int) -> str | None:
        if value is None:
            return None
        try:
            key, old_query, old_limit = json.loads(base64.urlsafe_b64decode(value))
            if (old_query, old_limit) != (query, limit):
                raise ValueError("Cursor parameters changed")
            return str(UUID(key))
        except (ValueError, TypeError) as exc:
            raise AppError(422, "validation_error", "Некорректный курсор") from exc

    async def status(self, op: Operation, actor: dict[str, Any]) -> OperationResult:
        target_id = op.params["user_id"]
        if str(actor["id"]) == target_id:
            raise AppError(403, "forbidden", "Нельзя изменить собственную блокировку")
        # Check immutable roles before locking another admin's account.
        target = await self._identity.user(target_id)
        if "admin" in target["roles"]:
            raise AppError(403, "forbidden", "Блокировка администратора запрещена")
        row = await self._records.require("SELECT version FROM users WHERE id=:id FOR UPDATE", id=target_id)
        check_version(row["version"], op.version)
        await self._records.rows("UPDATE users SET blocked=:blocked,version=version+1,updated_at=:now WHERE id=:id",
                                 id=target_id, blocked=op.data["blocked"], now=op.now)
        if op.data["blocked"]:
            await self._records.rows("UPDATE sessions SET revoked_at=:now WHERE user_id=:id", id=target_id, now=op.now)
        await self._records.rows(
            """INSERT INTO admin_audit_log(id,actor_user_id,target_user_id,action,reason,created_at)
               VALUES (:id,:actor,:target,:action,:reason,:now)""",
            id=uuid4(), actor=actor["id"], target=target_id, action="block" if op.data["blocked"] else "unblock",
            reason=nonempty(op.data["reason"]), now=op.now,
        )
        return OperationResult(await self._identity.user(target_id))
