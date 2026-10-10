from datetime import datetime
from typing import Any

from service.contracts.operations import CalculateDays
from service.domain.forecast import add_forecast


def seconds(start: datetime, end: datetime) -> int:
    return max(0, int((end - start).total_seconds()))


def interval(kind: str, start: datetime, end: datetime | None, now: datetime,
             target: dict[str, Any]) -> dict[str, Any]:
    return {"id": target["id"], "kind": kind, "status": "actual" if end else "ongoing",
            "start": start, "end": end, "expected_end": None,
            "duration_seconds": seconds(start, end or now), "sleep_id": target["sleep_id"], "comment": None}


def timeline(document: dict[str, Any], now: datetime) -> list[dict[str, Any]]:
    sleeps = {sleep["id"]: sleep for sleep in document["sleeps"]}
    previous = document["previous_night"]
    if previous:
        sleeps[previous["id"]] = previous
    result = []
    for target in document["targets"]:
        if target["kind"] == "sleep":
            sleep = sleeps[target["sleep_id"]]
            entry = interval(sleep["kind"], sleep["start"], sleep["end"], now, target)
        else:
            left = sleeps.get(target["left_sleep_id"])
            if left is None or left["end"] is None or left["end"] > now:
                continue
            right = sleeps.get(target["right_sleep_id"])
            entry = interval("awake", left["end"], right["start"] if right else None, now, target)
        entry["comment"] = next((note for note in document["comments"] if note["target_id"] == target["id"]), None)
        result.append(entry)
    return sorted(result, key=lambda entry: entry["start"])


def metrics(document: dict[str, Any], entries: list[dict[str, Any]], now: datetime) -> dict[str, int | None]:
    morning = document["previous_night"] is not None
    sleeps = document["sleeps"]
    night = next((sleep["start"] for sleep in sleeps if sleep["kind"] == "night"), None)
    totals: dict[str, int | None] = {"day_sleep_seconds": None, "night_sleep_seconds": None, "day_awake_seconds": None}
    if morning or sleeps:
        totals["day_sleep_seconds"] = total(entries, "nap", now)
    if night:
        totals["night_sleep_seconds"] = total(entries, "night", now)
    if morning:
        awake = [entry for entry in entries if night is None or entry["start"] < night]
        totals["day_awake_seconds"] = total(awake, "awake", now)
    return totals


def calculate_day(document: dict[str, Any], now: datetime) -> dict[str, Any]:
    entries = timeline(document, now)
    totals = metrics(document, entries, now)
    final_night = any(sleep["ends_night"] for sleep in document["sleeps"])
    issues = []
    if document["previous_night"] is None:
        issues.append("missing_morning")
    if not final_night:
        issues.append("missing_night_end")
    if not document["schedule"]:
        issues.append("no_schedule")
    orphaned = [note for note in document["comments"] if note["target_id"] is None]
    if orphaned:
        issues.append("unassigned_comments")
    result = {key: document[key] for key in ("date", "version", "timezone", "schedule")}
    complete = bool(document["previous_night"] and final_night and all(
        sleep["end"] is not None for sleep in document["sleeps"]))
    result.update(context=document.get("context", {}), settling=document.get("settling", []),
                  as_of=now, complete=complete, metrics=totals, timeline=entries,
                  orphaned_comments=orphaned, issues=issues)
    add_forecast(document, entries, issues, now)
    result["sleeps"] = [_public(sleep) for sleep in document["sleeps"]]
    result["previous_night"] = _public(document["previous_night"]) if document["previous_night"] else None
    return result


def _public(sleep: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in sleep.items() if key != "day_id"}


class CalculateDaysHandler:
    async def handle(self, message: CalculateDays) -> list[dict[str, Any]]:
        days = [calculate_day(document, message.now) for document in message.documents]
        return [{key: day[key] for key in ("date", "complete", "metrics")} for day in days] if message.summary else days


def total(entries: list[dict[str, Any]], kind: str, now: datetime) -> int:
    return int(sum(max(0, ((entry["end"] or now) - entry["start"]).total_seconds())
                   for entry in entries if entry["kind"] == kind))
