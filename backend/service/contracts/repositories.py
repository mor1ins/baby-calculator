from dataclasses import dataclass, field
from datetime import datetime
from types import TracebackType
from typing import Protocol
from uuid import UUID


@dataclass(frozen=True)
class NewAccount:
    id: UUID
    email: str
    name: str
    password_hash: str = field(repr=False)


@dataclass(frozen=True)
class Account:
    id: UUID
    email: str
    name: str
    blocked: bool
    version: int
    roles: frozenset[str]


@dataclass(frozen=True)
class Diary:
    id: UUID
    user_id: UUID
    timezone: str
    default_schedule_id: UUID | None = None


class PersistenceConflict(Exception):
    """A write conflicts with an existing record or database invariant."""


class VersionConflict(PersistenceConflict):
    """The expected resource version no longer matches."""


class AccountsRepository(Protocol):
    async def add(self, account: NewAccount, now: datetime) -> Account:
        ...

    async def find(self, account_id: UUID) -> Account | None:
        ...

    async def rename(self, account_id: UUID, name: str, expected_version: int, now: datetime) -> Account:
        ...


class DiariesRepository(Protocol):
    async def add(self, diary: Diary, now: datetime) -> Diary:
        ...

    async def find_by_owner(self, user_id: UUID) -> Diary | None:
        ...


class UnitOfWork(Protocol):
    @property
    def accounts(self) -> AccountsRepository:
        ...

    @property
    def diaries(self) -> DiariesRepository:
        ...

    async def __aenter__(self) -> "UnitOfWork":
        ...

    async def __aexit__(
        self, exc_type: type[BaseException] | None, exc: BaseException | None, traceback: TracebackType | None,
    ) -> None:
        ...

    async def commit(self) -> None:
        ...
