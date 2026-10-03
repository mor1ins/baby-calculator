from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from service.infrastructure.repositories.accounts import SqlAccountsRepository
from service.infrastructure.repositories.admin import AdminRepository
from service.infrastructure.repositories.comments import CommentsRepository
from service.infrastructure.repositories.common import Records
from service.infrastructure.repositories.days import DaysRepository
from service.infrastructure.repositories.diaries import SqlDiariesRepository
from service.infrastructure.repositories.events import EventsRepository
from service.infrastructure.repositories.identity import IdentityRepository
from service.infrastructure.repositories.schedules import SchedulesRepository
from service.infrastructure.repositories.sleeps import SleepsRepository
from service.infrastructure.repositories.store import RepositoryScope
from service.infrastructure.repositories.targets import TargetsRepository
from service.infrastructure.repositories.transaction import Transaction
from service.infrastructure.security import Passwords


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def specification() -> dict[str, Any]:
    with (Path(__file__).resolve().parents[2] / "api/openapi.yaml").open(encoding="utf-8") as stream:
        result: dict[str, Any] = yaml.safe_load(stream)
    return result


def repository_scope(transaction: Transaction, passwords: Passwords) -> RepositoryScope:
    records = Records(transaction)
    identity = IdentityRepository(
        records, passwords, SqlAccountsRepository(transaction), SqlDiariesRepository(transaction),
    )
    schedules = SchedulesRepository(records, identity)
    days = DaysRepository(records, schedules)
    sleeps = SleepsRepository(days, TargetsRepository(days))
    events = EventsRepository(sleeps)
    comments = CommentsRepository(sleeps, events)
    admin = AdminRepository(records, identity)
    return RepositoryScope(records, identity, {
        "updateProfile": schedules.profile, "listSchedules": schedules.list_schedules,
        "adminListSchedules": schedules.list_schedules, "createSchedule": schedules.create,
        "updateSchedule": schedules.update, "setDaySchedule": days.assign_schedule,
        "getDay": days.get_day, "adminGetDay": days.get_day,
        "listDays": days.list_days, "adminListDays": days.list_days,
        "createSleep": sleeps.write, "updateSleep": sleeps.write, "deleteSleep": sleeps.delete,
        "putSleepEvent": events.write, "deleteSleepEvent": events.write,
        "putComment": comments.write, "deleteComment": comments.write,
        "listUsers": admin.users, "adminUpdateStatus": admin.status,
    }, days.finish)
