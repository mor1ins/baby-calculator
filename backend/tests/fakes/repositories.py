from dataclasses import dataclass, field, replace
from datetime import datetime
from types import TracebackType
from uuid import UUID

from service.contracts.repositories import Account, Diary, NewAccount, PersistenceConflict, VersionConflict


@dataclass
class MemoryStore:
    accounts: dict[UUID, Account] = field(default_factory=dict)
    diaries: dict[UUID, Diary] = field(default_factory=dict)


@dataclass
class MemoryTransaction:
    store: MemoryStore
    active: bool = True
    failed: bool = False

    def require_active(self) -> None:
        if not self.active or self.failed:
            raise RuntimeError("Transaction is inactive or requires rollback")

    def check_name(self, name: str) -> None:
        if not name.strip(" ") or len(name) > 80:
            self.conflict()

    def conflict(self) -> None:
        self.failed = True
        raise PersistenceConflict("Database constraint conflict")


class FakeAccountsRepository:
    def __init__(self, transaction: MemoryTransaction) -> None:
        self._transaction = transaction

    async def add(self, account: NewAccount, now: datetime) -> Account:
        del now  # Persistence timestamps are not exposed by this repository contract.
        self._transaction.require_active()
        self._transaction.check_name(account.name)
        if not account.email or account.email != account.email.strip(" ").lower() or len(account.email) > 254:
            self._transaction.conflict()
        accounts = self._transaction.store.accounts
        if account.id in accounts or any(item.email == account.email for item in accounts.values()):
            self._transaction.conflict()
        result = Account(account.id, account.email, account.name, False, 1, frozenset({"user"}))
        accounts[result.id] = result
        return result

    async def find(self, account_id: UUID) -> Account | None:
        self._transaction.require_active()
        return self._transaction.store.accounts.get(account_id)

    async def rename(self, account_id: UUID, name: str, expected_version: int, now: datetime) -> Account:
        del now
        current = await self.find(account_id)
        if current is None or current.version != expected_version:
            self._transaction.failed = True
            raise VersionConflict("Account version conflict")
        self._transaction.check_name(name)
        updated = replace(current, name=name, version=current.version + 1)
        self._transaction.store.accounts[account_id] = updated
        return updated


class FakeDiariesRepository:
    def __init__(self, transaction: MemoryTransaction) -> None:
        self._transaction = transaction

    async def add(self, diary: Diary, now: datetime) -> Diary:
        del now
        self._transaction.require_active()
        store = self._transaction.store
        if (not diary.timezone or diary.default_schedule_id is not None
                or diary.user_id not in store.accounts or diary.user_id in store.diaries
                or any(item.id == diary.id for item in store.diaries.values())):
            self._transaction.conflict()
        store.diaries[diary.user_id] = diary
        return diary

    async def find_by_owner(self, user_id: UUID) -> Diary | None:
        self._transaction.require_active()
        return self._transaction.store.diaries.get(user_id)


class FakeUnitOfWork:
    """Transactional fake for sequential unit tests, not a PostgreSQL concurrency emulator."""

    def __init__(self, store: MemoryStore) -> None:
        self._store = store
        self._transaction: MemoryTransaction | None = None
        self._accounts: FakeAccountsRepository | None = None
        self._diaries: FakeDiariesRepository | None = None

    def _repositories(self) -> tuple[FakeAccountsRepository, FakeDiariesRepository]:
        if self._transaction is None or self._accounts is None or self._diaries is None:
            raise RuntimeError("Unit of Work has not started")
        self._transaction.require_active()
        return self._accounts, self._diaries

    @property
    def accounts(self) -> FakeAccountsRepository:
        return self._repositories()[0]

    @property
    def diaries(self) -> FakeDiariesRepository:
        return self._repositories()[1]

    async def __aenter__(self) -> "FakeUnitOfWork":
        if self._transaction is not None:
            raise RuntimeError("Unit of Work instances are single-use")
        self._transaction = MemoryTransaction(MemoryStore(self._store.accounts.copy(), self._store.diaries.copy()))
        self._accounts = FakeAccountsRepository(self._transaction)
        self._diaries = FakeDiariesRepository(self._transaction)
        return self

    async def commit(self) -> None:
        self._repositories()
        transaction = self._transaction
        assert transaction is not None
        self._store.accounts = transaction.store.accounts
        self._store.diaries = transaction.store.diaries
        transaction.active = False

    async def __aexit__(
        self, exc_type: type[BaseException] | None, exc: BaseException | None, traceback: TracebackType | None,
    ) -> None:
        assert self._transaction is not None
        self._transaction.active = False
