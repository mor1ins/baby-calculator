from datetime import date, datetime, timedelta, timezone
from typing import Any

import pytest

from service.domain.day import calculate_day

BASE = datetime(2026, 10, 3, 3, 30, tzinfo=timezone.utc)


def moment(minutes: int) -> datetime:
    return BASE + timedelta(minutes=minutes)


def document(facts: list[tuple[str, int, int | None]]) -> dict[str, Any]:
    previous: dict[str, Any] = {
        "id": "previous", "day": date(2026, 10, 2), "kind": "night", "start": moment(-600),
        "end": BASE, "ends_night": True, "version": 1, "events": []}
    sleeps: list[dict[str, Any]] = [
        {"id": str(index), "day": date(2026, 10, 3), "kind": kind, "start": moment(start),
         "end": moment(end) if end else None, "ends_night": False, "version": 1, "events": []}
        for index, (kind, start, end) in enumerate(facts)]
    targets: list[dict[str, Any]] = [
        {"id": f"sleep-{sleep['id']}", "kind": "sleep", "sleep_id": sleep["id"]} for sleep in sleeps]
    for index, left in enumerate([previous, *sleeps]):
        if left["end"] is not None:
            targets.append({"id": f"awake-{index}", "kind": "awake", "sleep_id": None,
                            "left_sleep_id": left["id"], "right_sleep_id": str(index) if index < len(sleeps) else None})
    return {"date": date(2026, 10, 3), "timezone": "Europe/Moscow", "version": 1,
            "previous_night": previous, "sleeps": sleeps, "targets": targets, "comments": [],
            "schedule": {"source_id": "plan", "name": "Обычный", "segments": [
                {"kind": kind, "duration_minutes": duration} for kind, duration in
                [("awake", 260), ("nap", 80), ("awake", 280), ("nap", 20), ("awake", 180), ("night", 600)]
            ]}}


@pytest.mark.parametrize("facts,now,night_start,night_end,issue", [
    ([], 0, 820, 1420, None),
    ([("nap", 260, 360)], 360, 840, 1440, None),
    ([("nap", 260, None)], 360, 840, 1440, "plan_exceeded"),
    ([("nap", 260, 340), ("night", 690, None)], 690, 690, 1290, None),
    ([("nap", 260, 340), ("nap", 620, 640), ("nap", 690, 710)], 710, 890, 1490, "extra_naps"),
])
def test_approved_forecasts(facts: list[tuple[str, int, int | None]], now: int,
                            night_start: int, night_end: int, issue: str | None) -> None:
    result = calculate_day(document(facts), moment(now))
    night = next(entry for entry in result["timeline"] if entry["kind"] == "night")
    assert night["start"] == moment(night_start)
    assert (night["end"] or night["expected_end"]) == moment(night_end)
    if issue:
        assert issue in result["issues"]
    assert result["metrics"]["day_sleep_seconds"] == sum(
        ((end if end is not None else now) - start) * 60 for kind, start, end in facts if kind == "nap")


def test_overdue_sleep_keeps_unknown_end_and_original_expected_end() -> None:
    result = calculate_day(document([("nap", 260, None)]), moment(360))
    sleep = next(entry for entry in result["timeline"] if entry["status"] == "ongoing")
    assert sleep["end"] is None
    assert sleep["expected_end"] == moment(340)
    assert result["sleeps"][0]["end"] is None
