from datetime import date, datetime, timezone
from typing import Any

from service.domain.report import export_days


def night_row(finished: bool = True) -> dict[str, Any]:
    start = datetime(2026, 10, 1, 20, tzinfo=timezone.utc)
    end = datetime(2026, 10, 2, 5, tzinfo=timezone.utc) if finished else None
    sleep = {"kind": "night", "start": start, "end": end, "ends_night": finished}
    return {"date": date(2026, 10, 1), "timezone": "Europe/Moscow", "sleeps": [sleep],
            "timeline": [{**sleep, "comment": {"text": "Просыпался"}}], "comments": [], "context": ""}


def test_export_carries_incoming_night_and_notes_into_the_waking_day() -> None:
    row = night_row()
    result = export_days([row], "2026-10-02", "2026-10-02")
    assert result[0]["date"] == "2026-10-02"
    assert result[0]["timeline"][0]["comment"]["text"] == "Просыпался"
    assert export_days([row], "2026-10-01", "2026-10-01")[0]["timeline"] == []


def test_unfinished_night_stays_on_its_start_day_without_an_invented_end() -> None:
    row = night_row(False)
    row.update(context="День в дороге", comments=[{"target_id": None, "text": "Заметка без интервала"}])
    result = export_days([row], "2026-10-01", "2026-10-01")[0]
    assert result["timeline"][0]["end"] is None
    assert result["notes"] == ["День в дороге", "Заметка без интервала"]


def test_waking_date_uses_the_diary_timezone() -> None:
    row = night_row()
    row["sleeps"][0]["end"] = datetime(2026, 10, 1, 23, tzinfo=timezone.utc)
    assert export_days([row], "2026-10-02", "2026-10-02")[0]["date"] == "2026-10-02"
