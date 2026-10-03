from datetime import datetime
from uuid import UUID

from service.contracts.repositories import Account, NewAccount, VersionConflict
from service.infrastructure.repositories.transaction import Transaction


class SqlAccountsRepository:
    def __init__(self, transaction: Transaction) -> None:
        self._transaction = transaction

    async def add(self, account: NewAccount, now: datetime) -> Account:
        await self._transaction.execute(
            """INSERT INTO users(id,email,name,password_hash,created_at,updated_at)
               VALUES (:id,:email,:name,:password_hash,:now,:now)""",
            {"id": account.id, "email": account.email, "name": account.name,
             "password_hash": account.password_hash, "now": now},
        )
        await self._transaction.execute(
            "INSERT INTO user_roles(user_id,role_code) VALUES (:id,'user')", {"id": account.id},
        )
        return Account(account.id, account.email, account.name, False, 1, frozenset({"user"}))

    async def find(self, account_id: UUID) -> Account | None:
        result = await self._transaction.execute(
            "SELECT id,email,name,blocked,version FROM users WHERE id=:id", {"id": account_id},
        )
        row = result.mappings().one_or_none()
        if row is None:
            return None
        roles = await self._transaction.execute(
            "SELECT role_code FROM user_roles WHERE user_id=:id", {"id": account_id},
        )
        return Account(row["id"], row["email"], row["name"], row["blocked"], row["version"], frozenset(roles.scalars()))

    async def rename(self, account_id: UUID, name: str, expected_version: int, now: datetime) -> Account:
        result = await self._transaction.execute(
            """UPDATE users SET name=:name,version=version+1,updated_at=:now
               WHERE id=:id AND version=:version RETURNING id""",
            {"id": account_id, "name": name, "version": expected_version, "now": now},
        )
        if result.scalar_one_or_none() is None:
            self._transaction.failed = True
            raise VersionConflict("Account version conflict")
        account = await self.find(account_id)
        assert account is not None
        return account
