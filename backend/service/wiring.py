from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

from service.infrastructure.repositories.accounts import SqlAccountsRepository
from service.infrastructure.repositories.admin import AdminRepository
from service.infrastructure.repositories.comments import CommentsRepository
from service.infrastructure.repositories.common import Records
from service.infrastructure.repositories.days import DaysRepository
from service.infrastructure.repositories.details import DetailsRepository
from service.infrastructure.repositories.diaries import SqlDiariesRepository
from service.infrastructure.repositories.events import EventsRepository
from service.infrastructure.repositories.identity import IdentityRepository
from service.infrastructure.repositories.reports import ReportsRepository
from service.infrastructure.repositories.schedules import SchedulesRepository
from service.infrastructure.repositories.settling import SettlingRepository
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


def repository_scope(transaction: Transaction, passwords: Passwords,
                     clock_skew_tolerance_minutes: int) -> RepositoryScope:
    records = Records(transaction)
    identity = IdentityRepository(
        records, passwords, SqlAccountsRepository(transaction), SqlDiariesRepository(transaction),
    )
    schedules = SchedulesRepository(records, identity)
    days = DaysRepository(records, schedules)
    settling = SettlingRepository(days)
    details = DetailsRepository(days)
    reports = ReportsRepository(days)
    sleeps = SleepsRepository(days, TargetsRepository(days), clock_skew_tolerance_minutes, settling)
    events = EventsRepository(sleeps, clock_skew_tolerance_minutes)
    comments = CommentsRepository(sleeps, events)
    admin = AdminRepository(records, identity)
    return RepositoryScope(records, identity, {
        "getChild": details.child, "updateChild": details.child, "updateDayContext": details.context,
        "createChange": details.change, "deleteChange": details.change,
        "startSettling": settling.write, "finishSettling": settling.write, "cancelSettling": settling.write,
        "getReport": reports.report, "createShare": reports.create_share, "listShares": reports.shares,
        "revokeShare": reports.shares, "getPublicReport": reports.public,
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
