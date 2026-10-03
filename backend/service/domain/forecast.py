from datetime import datetime, timedelta
from typing import Any


def future(kind: str, start: datetime, minutes: int) -> dict[str, Any]:
    return {"id": None, "kind": kind, "status": "forecast", "start": start,
            "end": start + timedelta(minutes=minutes), "expected_end": None,
            "duration_seconds": minutes * 60, "sleep_id": None, "comment": None}


def add_forecast(document: dict[str, Any], entries: list[dict[str, Any]], issues: list[str], now: datetime) -> None:
    schedule = document["schedule"]
    if not schedule or document["previous_night"] is None:
        return
    naps = [sleep for sleep in document["sleeps"] if sleep["kind"] == "nap"]
    plan = schedule["segments"]
    expected_naps = (len(plan) - 2) // 2
    if len(naps) > expected_naps:
        issues.append("extra_naps")
    current = next((entry for entry in entries if entry["status"] == "ongoing"), None)
    if current is None:
        return
    if any(sleep["kind"] == "night" for sleep in document["sleeps"]):
        _night(document, current, plan[-1]["duration_minutes"], now, issues)
        return
    index = min(len(naps) * 2, len(plan) - 2)
    if current["kind"] == "nap":
        index = max(1, min(len(naps) * 2 - 1, len(plan) - 3)) if expected_naps else 0
    expected = current["start"] + timedelta(minutes=plan[index]["duration_minutes"])
    current["expected_end"] = expected
    if expected < now:
        issues.append("plan_exceeded")
    cursor = max(now, expected)
    for segment in plan[index + 1:]:
        entry = future(segment["kind"], cursor, segment["duration_minutes"])
        entries.append(entry)
        cursor = entry["end"]


def _night(document: dict[str, Any], current: dict[str, Any], minutes: int,
           now: datetime, issues: list[str]) -> None:
    if current["kind"] != "night":
        return
    elapsed = sum((sleep["end"] - sleep["start"]).total_seconds() for sleep in document["sleeps"]
                  if sleep["kind"] == "night" and sleep["end"] is not None)
    expected = current["start"] + timedelta(seconds=max(0, minutes * 60 - elapsed))
    current["expected_end"] = expected
    if expected < now:
        issues.append("plan_exceeded")
