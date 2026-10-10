from datetime import date, datetime
from statistics import mean
from typing import Any
from zoneinfo import ZoneInfo

from service.contracts.operations import CalculateReport
from service.domain.day import calculate_day


def timestamp(value: Any) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if isinstance(value, str) else value


def restore(document: dict[str, Any]) -> dict[str, Any]:
    result = {**document, "date": date.fromisoformat(str(document["date"]))}
    sleeps = [dict(sleep) for sleep in document["sleeps"]]
    previous = dict(document["previous_night"]) if document["previous_night"] else None
    for sleep in sleeps + ([previous] if previous else []):
        sleep.update(start=timestamp(sleep["start"]), end=timestamp(sleep["end"]))
    result.update(sleeps=sleeps, previous_night=previous)
    return result


def minutes(value: datetime | None, cycle: date, zone: str) -> int | None:
    if value is None:
        return None
    local = value.astimezone(ZoneInfo(zone))
    return (local.date() - cycle).days * 1440 + local.hour * 60 + local.minute


def report_row(document: dict[str, Any], now: datetime) -> dict[str, Any]:
    day = calculate_day(document, now)

    def local(value: datetime | None) -> int | None:
        return minutes(value, day["date"], day["timezone"])
    naps = [sleep for sleep in day["sleeps"] if sleep["kind"] == "nap"]
    nights = [sleep for sleep in day["sleeps"] if sleep["kind"] == "night"]
    night_start = nights[0]["start"] if nights else None
    previous_end = naps[-1]["end"] if naps else day["previous_night"]["end"] if day["previous_night"] else None
    attempt = next((item for item in day["settling"]
                    if nights and str(item["sleep_id"]) == str(nights[0]["id"])), None)
    settle_start = timestamp(attempt["start_at"]) if attempt else None
    totals = {name: value / 60 if value is not None else None for name, value in day["metrics"].items()}
    context = day["context"]
    return {"date": day["date"], "timezone": day["timezone"], "complete": day["complete"],
            "nap": totals["day_sleep_seconds"],
            "night": totals["night_sleep_seconds"] if day["complete"] else None,
            "awake": totals["day_awake_seconds"], "count": len(naps),
            "morning": local(day["previous_night"]["end"]) if day["previous_night"] else None,
            "nightStart": local(night_start), "nightEnd": local(nights[-1]["end"]) if nights else None,
            "settleStart": local(settle_start),
            "settling": (night_start - settle_start).total_seconds() / 60 if settle_start and night_start else None,
            "lastWake": (night_start - previous_end).total_seconds() / 60 if night_start and previous_end else None,
            "naps": [[local(sleep["start"]), local(sleep["end"])] for sleep in naps],
            "settlingHelp": context.get("help", ""), "mood": context.get("mood", ""),
            "context": context.get("note", ""), "sleeps": day["sleeps"],
            "comments": document["comments"], "timeline": [entry for entry in day["timeline"]
                                                           if entry["status"] != "forecast"]}


def highlights(rows: list[dict[str, Any]]) -> dict[str, Any]:
    result = {}
    for key in ("lastWake", "settling"):
        values = [row[key] for row in rows if row[key] is not None]
        result[key] = {"mean": mean(values), "min": min(values), "max": max(values)} if values else None
    return result


def changes_summary(changes: list[dict[str, Any]], rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for change in changes:
        before = [row for row in rows if str(row["date"]) < str(change["date"])][-3:]
        after = [row for row in rows if str(row["date"]) >= str(change["date"])][:3]
        result.append({**change, "before": highlights(before), "after": highlights(after),
                       "before_count": len(before), "after_count": len(after)})
    return result


class CalculateReportHandler:
    async def handle(self, message: CalculateReport) -> dict[str, Any]:
        data = message.document
        now = timestamp(data["as_of"])
        assert now is not None
        rows = [report_row(restore(document), now) for document in data["documents"] if document["sleeps"]]
        complete = [row for row in rows if row["complete"]]
        averages = {key: mean(row[key] for row in complete) if complete else None
                    for key in ("nap", "night", "awake", "count")}
        averages["total"] = mean(row["nap"] + row["night"] for row in complete) if complete else None
        return {key: value for key, value in data.items() if key != "documents"} | {
            "rows": rows, "highlights": highlights(rows), "changes": changes_summary(data["changes"], rows),
            "averages": averages, "complete_count": len(complete),
            "calendar_days": (date.fromisoformat(str(data["to"])) - date.fromisoformat(str(data["from"]))).days + 1,
        }
