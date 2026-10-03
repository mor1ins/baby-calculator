from concurrent.futures import ThreadPoolExecutor
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.infrastructure.api_support import register, write

pytestmark = pytest.mark.integration


def test_concurrent_sleep_creations_and_version_updates(client: TestClient) -> None:
    register(client)
    payload = {"day": "2026-10-03", "kind": "nap", "start": "2026-10-03T07:00:00Z",
               "end": "2026-10-03T08:00:00Z", "ends_night": False}

    def create(_index: int) -> Any:
        return client.post("/api/v1/sleeps", json=payload)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(create, range(2)))
    assert sorted(response.status_code for response in results) == [201, 409]
    sleep = next(response.json() for response in results if response.status_code == 201)

    def update(_index: int) -> Any:
        return client.patch(f'/api/v1/sleeps/{sleep["id"]}', json={"end": "2026-10-03T08:10:00Z"},
                            headers={"If-Match": '"1"'})

    with ThreadPoolExecutor(max_workers=2) as pool:
        updated = list(pool.map(update, range(2)))
    assert sorted(response.status_code for response in updated) == [200, 412]


def test_schedule_snapshots_and_archiving_do_not_rewrite_history(client: TestClient) -> None:
    user = register(client)
    plan = write(client, "POST", "/schedules", {"name": "Первая версия", "segments": [
        {"kind": "awake", "duration_minutes": 820}, {"kind": "night", "duration_minutes": 600}]})
    write(client, "PATCH", "/me", {"default_schedule_id": plan["id"]}, user["version"])
    for day in ("2026-10-02", "2026-10-03", "2026-10-10"):
        write(client, "PUT", f'/days/{day}/schedule', {"schedule_id": plan["id"]}, 0)
    updated = write(client, "PATCH", f'/schedules/{plan["id"]}', {"name": "Больше сна"}, 1)
    current = client.get("/api/v1/days/2026-10-03").json()
    assert current["schedule"]["name"] == "Первая версия"
    write(client, "PUT", "/days/2026-10-03/schedule", {"schedule_id": plan["id"]}, current["version"])
    for day in ("2026-10-02", "2026-10-10"):
        assert client.get(f'/api/v1/days/{day}').json()["schedule"]["name"] == "Первая версия"
    write(client, "PATCH", f'/schedules/{plan["id"]}', {"archived": True}, updated["version"])
    assert client.get("/api/v1/session").json()["user"]["default_schedule_id"] is None
    assert client.get("/api/v1/days/2026-10-03").json()["schedule"]["name"] == "Больше сна"


def test_sleep_day_move_and_comment_preservation(client: TestClient) -> None:
    register(client)
    sleep = write(client, "POST", "/sleeps", {"day": "2026-10-02", "kind": "night",
                  "start": "2026-10-03T00:10:00Z", "end": "2026-10-03T02:00:00Z", "ends_night": False})
    moved = write(client, "PATCH", f'/sleeps/{sleep["id"]}', {"day": "2026-10-03"}, 1)
    assert moved["day"] == "2026-10-03"
    assert not client.get("/api/v1/days/2026-10-02").json()["sleeps"]


def test_dst_durations_and_saved_timezone(client: TestClient) -> None:
    user = register(client)
    user = write(client, "PATCH", "/me", {"timezone": "Europe/Berlin"}, user["version"])
    write(client, "POST", "/sleeps", {"day": "2025-10-25", "kind": "night",
          "start": "2025-10-25T22:00:00+02:00", "end": "2025-10-26T06:00:00+01:00", "ends_night": True})
    write(client, "PATCH", "/me", {"timezone": "America/Los_Angeles"}, user["version"])
    day = client.get("/api/v1/days/2025-10-25").json()
    assert day["timezone"] == "Europe/Berlin"
    assert day["metrics"]["night_sleep_seconds"] == 9 * 3600
    assert client.get("/api/v1/days/2025-10-26").json()["previous_night"] is not None


def test_cycle_date_cannot_precede_its_morning(client: TestClient) -> None:
    register(client)
    write(client, "POST", "/sleeps", {"day": "2026-10-01", "kind": "night",
          "start": "2026-10-01T19:00:00Z", "end": "2026-10-03T03:00:00Z", "ends_night": True})
    response = client.post("/api/v1/sleeps", json={"day": "2026-10-02", "kind": "nap",
                           "start": "2026-10-03T04:00:00Z", "end": "2026-10-03T05:00:00Z", "ends_night": False})
    assert response.status_code == 422
    assert client.get("/api/v1/days/2026-10-02").json()["version"] == 0
