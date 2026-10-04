from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from pydantic import ValidationError

from service.contracts.operations import AppError
from service.infrastructure.repositories.sleep_rules import sleep_times
from service.settings import Settings

NOW = datetime(2026, 10, 4, 12, tzinfo=timezone.utc)


@pytest.mark.parametrize("minutes,seconds,accepted", [
    (20, -1, True), (20, 0, True), (20, 0.002138, True),
    (20, 1199.999999, True), (20, 1200, False), (20, 1201, False),
    (2, 119, True), (2, 120, False), (0, 0, True), (0, 0.000001, False),
])
@pytest.mark.parametrize("field", ["start", "end"])
def test_clock_tolerance_boundaries(minutes: int, seconds: float, accepted: bool, field: str) -> None:
    sleep: dict[str, Any] = {
        "start": NOW - timedelta(hours=1), "end": None, "kind": "nap", "ends_night": False, "events": [],
    }
    sleep[field] = NOW + timedelta(seconds=seconds)
    original = sleep.copy()
    if accepted:
        sleep_times(sleep, NOW, minutes)
        assert sleep == original
    else:
        with pytest.raises(AppError) as error:
            sleep_times(sleep, NOW, minutes)
        assert error.value.fields == {field: "future"}


@pytest.mark.parametrize("end_offset", [0, -1])
def test_tolerance_does_not_relax_interval_order(end_offset: int) -> None:
    start = NOW + timedelta(minutes=10)
    with pytest.raises(AppError) as error:
        sleep_times({"start": start, "end": start + timedelta(seconds=end_offset)}, NOW, 20)
    assert error.value.fields == {"end": "not_after_start"}


def test_tolerance_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BABY_CLOCK_SKEW_TOLERANCE_MINUTES", raising=False)
    assert Settings().clock_skew_tolerance_minutes == 20
    monkeypatch.setenv("BABY_CLOCK_SKEW_TOLERANCE_MINUTES", "3")
    assert Settings().clock_skew_tolerance_minutes == 3
    monkeypatch.setenv("BABY_CLOCK_SKEW_TOLERANCE_MINUTES", "-1")
    with pytest.raises(ValidationError):
        Settings()
