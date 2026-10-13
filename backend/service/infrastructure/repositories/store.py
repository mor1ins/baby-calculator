from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from service.contracts.operations import AppError, Operation, OperationResult
from service.infrastructure.repositories.common import Records
from service.infrastructure.repositories.identity import IdentityRepository
from service.infrastructure.repositories.transaction import Transaction


@dataclass
class RepositoryScope:
    records: Records
    identity: IdentityRepository
    actions: dict[str, Callable[[Operation, dict[str, Any]], Any]]
    finish: Callable[[Operation], Any]


class SqlOperationRepository:
    def __init__(self, session_factory: Callable[[], AsyncSession],
                 scope_factory: Callable[[Transaction], RepositoryScope],
                 transaction_factory: Callable[[AsyncSession], Transaction]) -> None:
        self._sessions = session_factory
        self._transactions = transaction_factory
        self._scope_factory = scope_factory

    async def execute(self, operation: Operation) -> OperationResult:
        async with self._sessions() as session:
            async with session.begin():
                transaction = self._transactions(session)
                transaction.active = True
                try:
                    scope = self._scope_factory(transaction)
                    result = await self._execute(scope, operation)
                    await scope.finish(operation)
                finally:
                    transaction.active = False
            return result

    async def _execute(self, scope: RepositoryScope, op: Operation) -> OperationResult:
        if op.name == "getPublicReport":
            public: OperationResult = await scope.actions[op.name](op, {})
            return public
        context = await scope.identity.authenticate(op)
        if op.name == "getSession":
            return await scope.identity.session(op, context)
        if op.name in {"register", "login"}:
            if await self._limited(scope.records, op):
                return OperationResult(error=AppError(429, "rate_limited", "Слишком много попыток. Подождите минуту"))
            auth_handler = scope.identity.register if op.name == "register" else scope.identity.login
            return await auth_handler(op)
        if op.name == "logout":
            await scope.identity.revoke(op)
            return OperationResult(status=204, cookie="")
        if context is None or context["user_id"] is None:
            raise AppError(401, "unauthenticated", "Войдите в аккаунт")
        user = await scope.identity.user(context["user_id"])
        role = "admin" if op.name.startswith("admin") or op.name in {"listUsers"} else "user"
        if role not in user["roles"]:
            raise AppError(403, "forbidden", "Недостаточно прав")
        handler = scope.actions[op.name]
        result: OperationResult = await handler(op, user)
        return result

    async def _limited(self, records: Records, op: Operation) -> bool:
        key = f"{op.name}:{op.params.get('_peer', 'local')}"
        row = await records.require(
            """INSERT INTO auth_limits(key,window_start,attempts) VALUES (:key,:now,1)
               ON CONFLICT (key) DO UPDATE SET
               attempts=CASE WHEN auth_limits.window_start < :now - interval '1 minute'
                   THEN 1 ELSE auth_limits.attempts+1 END,
               window_start=CASE WHEN auth_limits.window_start < :now - interval '1 minute'
                   THEN :now ELSE auth_limits.window_start END RETURNING attempts""", key=key, now=op.now,
        )
        return bool(row["attempts"] > 15)
