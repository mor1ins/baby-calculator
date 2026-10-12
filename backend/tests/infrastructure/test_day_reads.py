from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event

from service.container import Container
from tests.infrastructure.api_support import register, write

pytestmark = pytest.mark.integration


def test_day_read_fetches_only_its_sleep_and_morning(client: TestClient, sql_container: Container) -> None:
    register(client)
    saved = []
    for cycle, kind, start, end in [
        ("2026-10-01", "night", "2026-10-01T18:00:00Z", "2026-10-02T03:00:00Z"),
        ("2026-10-02", "night", "2026-10-02T18:00:00Z", "2026-10-03T03:00:00Z"),
        ("2026-10-03", "nap", "2026-10-03T08:00:00Z", "2026-10-03T09:00:00Z"),
    ]:
        saved.append(write(client, "POST", "/sleeps", {"day": cycle, "kind": kind, "start": start, "end": end}))
    engine = sql_container.database_engine()
    assert engine is not None
    fetched: list[int] = []

    def record(_connection: Any, cursor: Any, statement: str, *_args: Any) -> None:
        if "FROM sleep_intervals s JOIN diary_days" in statement:
            fetched.append(cursor.rowcount)

    event.listen(engine.sync_engine, "after_cursor_execute", record)
    try:
        day = client.get("/api/v1/days/2026-10-03").json()
        assert [entry["id"] for entry in day["sleeps"]] == [saved[2]["id"]]
        assert day["previous_night"]["id"] == saved[1]["id"]
        assert fetched and sum(fetched) == 2
        fetched.clear()
        empty = client.get("/api/v1/days/2026-09-01").json()
        assert empty["sleeps"] == []
        assert empty["previous_night"] is None
        assert fetched and sum(fetched) == 0
    finally:
        event.remove(engine.sync_engine, "after_cursor_execute", record)
