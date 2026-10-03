from datetime import datetime
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from service.infrastructure.repositories.days import DaysRepository


class TargetsRepository:
    def __init__(self, days: DaysRepository) -> None:
        self._days = days

    async def expected(self, diary: dict[str, Any]) -> list[dict[str, Any]]:
        sleeps = await self._days.sleeps(diary["id"])
        targets = []
        for index, sleep in enumerate(sleeps):
            targets.append({"kind": "sleep", "day_id": sleep["day_id"], "sleep_id": sleep["id"],
                            "left_sleep_id": None, "right_sleep_id": None})
            if sleep["end"] is None:
                continue
            right = sleeps[index + 1] if index + 1 < len(sleeps) else None
            if right and right["start"] == sleep["end"]:
                continue
            day_id = sleep["day_id"]
            if sleep["ends_night"]:
                source = await self._days.records.require("SELECT timezone FROM diary_days WHERE id=:id", id=day_id)
                date = sleep["end"].astimezone(ZoneInfo(source["timezone"])).date()
                next_day = await self._days.ensure({**diary, "timezone": source["timezone"]}, date)
                day_id = next_day["id"]
            if right and right["day_id"] != day_id:
                continue
            targets.append({"kind": "awake", "day_id": day_id, "sleep_id": None,
                            "left_sleep_id": sleep["id"], "right_sleep_id": right["id"] if right else None})
        return targets

    async def reconcile(self, diary: dict[str, Any], changed: Any, now: datetime) -> None:
        expected = await self.expected(diary)
        existing = await self._days.records.rows(
            "SELECT * FROM interval_targets WHERE diary_id=:id AND retired_at IS NULL", id=diary["id"],
        )
        for target in existing:
            matching = next((item for item in expected if self._matches(target, item)), None)
            if matching is None:
                await self._retire(target, now)
            else:
                expected.remove(matching)
                await self._refresh(target, matching, changed, now)
        for target in expected:
            await self._days.records.rows(
                """INSERT INTO interval_targets(id,diary_id,day_id,kind,sleep_id,left_sleep_id,right_sleep_id)
                   VALUES (:id,:diary,:day_id,:kind,:sleep_id,:left_sleep_id,:right_sleep_id)""",
                id=uuid4(), diary=diary["id"], **target,
            )
            self._days.dirty.add(target["day_id"])

    @staticmethod
    def _matches(target: dict[str, Any], expected: dict[str, Any]) -> bool:
        keys = ("kind", "day_id", "sleep_id", "left_sleep_id")
        return all(target[key] == expected[key] for key in keys) and (
            target["right_sleep_id"] is None or target["right_sleep_id"] == expected["right_sleep_id"])

    async def _retire(self, target: dict[str, Any], now: datetime) -> None:
        await self._days.records.rows("UPDATE interval_targets SET retired_at=:now WHERE id=:id",
                                      now=now, id=target["id"])
        await self._days.records.rows(
            "UPDATE interval_comments SET target_id=NULL,version=version+1,updated_at=:now WHERE target_id=:id",
            now=now, id=target["id"],
        )
        self._days.dirty.add(target["day_id"])

    async def _refresh(self, target: dict[str, Any], expected: dict[str, Any], changed: Any, now: datetime) -> None:
        related = changed in (target["sleep_id"], target["left_sleep_id"], target["right_sleep_id"])
        if related or target["right_sleep_id"] != expected["right_sleep_id"]:
            await self._days.records.rows("UPDATE interval_targets SET right_sleep_id=:right WHERE id=:id",
                                          right=expected["right_sleep_id"], id=target["id"])
            await self._days.records.rows(
                "UPDATE interval_comments SET version=version+1,updated_at=:now WHERE target_id=:id",
                id=target["id"], now=now,
            )
            self._days.dirty.add(target["day_id"])
