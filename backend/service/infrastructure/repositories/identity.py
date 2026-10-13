import secrets
from datetime import timedelta
from typing import Any
from uuid import uuid4

from service.contracts.operations import AppError, Operation, OperationResult
from service.contracts.repositories import AccountsRepository, DiariesRepository, Diary, NewAccount
from service.infrastructure.repositories.common import Records, check_timezone, nonempty
from service.infrastructure.security import Passwords, token_digest


class IdentityRepository:
    def __init__(self, records: Records, passwords: Passwords,
                 accounts: AccountsRepository, diaries: DiariesRepository) -> None:
        self._accounts = accounts
        self._diaries = diaries
        self._records = records
        self._passwords = passwords

    async def user(self, user_id: Any) -> dict[str, Any]:
        user = await self._records.require(
            """SELECT u.id,u.version,u.name,u.email,u.blocked,d.timezone,d.default_schedule_id
               FROM users u LEFT JOIN diaries d ON d.user_id=u.id WHERE u.id=:id""", id=user_id,
        )
        roles = await self._records.rows("SELECT role_code FROM user_roles WHERE user_id=:id ORDER BY role_code",
                                         id=user_id)
        user["roles"] = [row["role_code"] for row in roles]
        user["timezone"] = user["timezone"] or "Europe/Moscow"
        return user

    async def context(self, op: Operation) -> dict[str, Any] | None:
        row = await self._records.one(
            "SELECT * FROM sessions WHERE token_hash=:token", token=token_digest(op.token),
        )
        if row is None:
            return None
        if row["user_id"] is not None:
            # Lock the account before any writes; blocking and active writes serialize.
            user = await self._records.require("SELECT blocked FROM users WHERE id=:id FOR UPDATE", id=row["user_id"])
            if user["blocked"] and op.name != "logout":
                raise AppError(403, "account_blocked", "Аккаунт заблокирован")
        row = await self._records.require("SELECT * FROM sessions WHERE token_hash=:token",
                                          token=token_digest(op.token))
        if row["expires_at"] <= op.now or (row["revoked_at"] and op.name != "logout"):
            return None
        return row

    async def authenticate(self, op: Operation) -> dict[str, Any] | None:
        context = await self.context(op)
        if op.name == "getSession":
            if context is None and op.token:
                raise AppError(401, "unauthenticated", "Сессия завершилась")
            return context
        if context is None:
            raise AppError(401, "unauthenticated", "Войдите в аккаунт")
        if op.name not in {"listDays", "getDay", "listSchedules", "listUsers", "adminListDays",
                           "adminGetDay", "adminListSchedules", "getChild", "getReport", "listShares"}:
            if not secrets.compare_digest(bytes(context["csrf_nonce"]).hex(), op.csrf):
                raise AppError(403, "csrf_invalid", "Обновите страницу перед сохранением")
        return context

    async def session(self, op: Operation, context: dict[str, Any] | None) -> OperationResult:
        if context is None:
            return await self.rotate(op, None)
        user = await self.user(context["user_id"]) if context["user_id"] else None
        return OperationResult({"user": user, "csrf_token": bytes(context["csrf_nonce"]).hex()})

    async def rotate(self, op: Operation, user_id: Any) -> OperationResult:
        token, csrf = secrets.token_urlsafe(32), secrets.token_bytes(32)
        await self.revoke(op)
        await self._records.rows(
            """INSERT INTO sessions(id,user_id,token_hash,csrf_nonce,expires_at,created_at)
               VALUES (:id,:user,:token,:csrf,:expires,:now)""",
            id=uuid4(), user=user_id, token=token_digest(token), csrf=csrf,
            expires=op.now + timedelta(days=30), now=op.now,
        )
        user = await self.user(user_id) if user_id else None
        return OperationResult({"user": user, "csrf_token": csrf.hex()}, cookie=token)

    async def revoke(self, op: Operation) -> None:
        await self._records.rows("UPDATE sessions SET revoked_at=:now WHERE token_hash=:token",
                                 now=op.now, token=token_digest(op.token))

    async def register(self, op: Operation) -> OperationResult:
        data = op.data
        check_timezone(data["timezone"])
        email = data["email"].strip().lower()
        await self._records.rows("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))", key=email)
        if await self._records.one("SELECT id FROM users WHERE email=:email", email=email):
            raise AppError(409, "email_taken", "Этот email уже зарегистрирован")
        user_id = uuid4()
        await self._accounts.add(NewAccount(
            user_id, email, nonempty(data["name"]), await self._passwords.hash(data["password"]),
        ), op.now)
        await self._diaries.add(Diary(uuid4(), user_id, data["timezone"]), op.now)
        result = await self.rotate(op, user_id)
        result.status = 201
        return result

    async def login(self, op: Operation) -> OperationResult:
        record = await self._records.one("SELECT * FROM users WHERE email=:email FOR SHARE",
                                         email=op.data["email"].strip().lower())
        valid = await self._passwords.verify(op.data["password"], record["password_hash"] if record else None)
        if not valid or record is None:
            return OperationResult(error=AppError(401, "invalid_credentials", "Неверный email или пароль"))
        if record["blocked"]:
            return OperationResult(error=AppError(403, "account_blocked", "Аккаунт заблокирован"))
        return await self.rotate(op, record["id"])
