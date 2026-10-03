from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from service.contracts.messages import Command
from service.contracts.repositories import Account, Diary, NewAccount


@dataclass(frozen=True)
class CreateAccountDiary(Command):
    """Internal persistence operation; password hashing and registration policy belong to A-01."""

    account: NewAccount
    diary_id: UUID
    timezone: str
    now: datetime


@dataclass(frozen=True)
class AccountDiary:
    account: Account
    diary: Diary
