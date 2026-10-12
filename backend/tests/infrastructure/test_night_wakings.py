from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.infrastructure.api_support import register, write

pytestmark = pytest.mark.integration


def night(client: TestClient, end: str | None = "2026-10-04T04:00:00Z") -> dict[str, Any]:
    register(client)
    write(client, "POST", "/sleeps", {"day": "2026-10-02", "kind": "night",
                                      "start": "2026-10-02T18:00:00Z", "end": "2026-10-03T04:00:00Z"})
    result: dict[str, Any] = write(client, "POST", "/sleeps", {"day": "2026-10-03", "kind": "night",
                                                               "start": "2026-10-03T18:00:00Z", "end": end})

    return result


def waking_values(start: str = "23:00", end: str | None = "23:30") -> dict[str, Any]:
    return {"day": "2026-10-03", "start": f"2026-10-03T{start}:00Z",
            "end": f"2026-10-03T{end}:00Z" if end else None}


def test_night_waking_metrics_export_and_edit(client: TestClient) -> None:
    parent = night(client)
    waking = write(client, "POST", "/night-wakings", waking_values())
    day = client.get("/api/v1/days/2026-10-03").json()
    assert day["metrics"] == {"day_sleep_seconds": 0, "night_sleep_seconds": 34200, "day_awake_seconds": 50400}
    assert [entry["kind"] for entry in day["timeline"]] == ["awake", "night", "night_awake", "night"]
    assert day["sleeps"][0]["duration_seconds"] == 34200
    period = {"from": "2026-10-03", "to": "2026-10-04"}
    report = client.get("/api/v1/statistics", params=period).json()
    assert report["rows"][0]["night"] == 570
    assert report["rows"][0]["nightWakings"] == [[1560, 1590]]
    exported = next(row for row in report["export_days"] if row["date"] == "2026-10-04")
    assert sum(item["duration_seconds"] for item in exported["timeline"] if item["kind"] == "night_awake") == 1800
    assert client.patch(f'/api/v1/sleeps/{parent["id"]}', json={"start": "2026-10-04T00:00:00Z"},
                        headers={"If-Match": '"1"'}).status_code == 409
    bounds = {key: value for key, value in waking_values(end="23:45").items() if key != "day"}
    updated = write(client, "PATCH", f'/night-wakings/{waking["id"]}', bounds, waking["version"])
    assert client.patch(f'/api/v1/night-wakings/{waking["id"]}', json=bounds,
                        headers={"If-Match": '"1"'}).status_code == 412
    share = write(client, "POST", "/shares", period)
    assert client.get(f'/api/v1/public/reports/{share["token"]}').json()["rows"][0]["night"] == 555
    write(client, "DELETE", f'/night-wakings/{waking["id"]}', {}, updated["version"])
    assert client.get("/api/v1/days/2026-10-03").json()["metrics"]["night_sleep_seconds"] == 36000


@pytest.mark.parametrize("start,end,status", [("17:00", "17:30", 422), ("23:45", "23:00", 422),
                                              ("23:15", "23:45", 409), ("23:30", "23:45", 201)])
def test_waking_boundaries(client: TestClient, start: str, end: str, status: int) -> None:
    night(client)
    write(client, "POST", "/night-wakings", waking_values())
    assert client.post("/api/v1/night-wakings", json=waking_values(start, end)).status_code == status


@pytest.mark.parametrize("finish_night", [False, True])
def test_live_waking_survives_midnight(client: TestClient, finish_night: bool) -> None:
    parent = night(client, None)
    waking = write(client, "POST", "/night-wakings", waking_values(end=None))
    day = client.get("/api/v1/days/2026-10-03").json()
    assert day["sleeps"][0]["end"] is None
    assert day["metrics"]["night_sleep_seconds"] == 18000
    assert day["timeline"][-1]["kind"] == "night_awake"
    if finish_night:
        write(client, "PATCH", f'/sleeps/{parent["id"]}', {"end": "2026-10-04T03:00:00Z"}, parent["version"])
        morning = client.get("/api/v1/days/2026-10-04").json()
        assert morning["previous_night"]["wakings"][0]["end"] == "2026-10-04T03:00:00Z"
    else:
        write(client, "PATCH", f'/night-wakings/{waking["id"]}',
              {"start": waking["start"], "end": "2026-10-04T02:00:00Z"}, waking["version"])
        assert client.get("/api/v1/days/2026-10-03").json()["metrics"]["night_sleep_seconds"] == 54000


def test_waking_owner_isolation(client: TestClient) -> None:
    night(client)
    waking = write(client, "POST", "/night-wakings", waking_values())
    with TestClient(client.app) as other:
        register(other, "other-waking@example.com")
        assert other.delete(f'/api/v1/night-wakings/{waking["id"]}',
                            headers={"If-Match": '"1"'}).status_code == 404
        assert other.post("/api/v1/night-wakings", json=waking_values()).status_code == 422


def test_settling_boundaries_remain_independent(client: TestClient) -> None:
    register(client)
    attempt = write(client, "POST", "/settling", {"day": "2026-10-04"})
    path = f'/settling/{attempt["id"]}'
    write(client, "PUT", path, {"start": "2026-10-04T11:30:00Z", "end": None}, 1)
    parent = write(client, "POST", "/sleeps", {"day": "2026-10-04", "kind": "nap",
                                               "start": "2026-10-04T11:50:00Z", "end": None})
    day = client.get("/api/v1/days/2026-10-04").json()
    attempt = day["settling"][0]
    assert next(item for item in day["timeline"] if item["kind"] == "settling")["duration_seconds"] == 1200
    bounds = {"start": "2026-10-04T11:35:00Z", "end": "2026-10-04T11:45:00Z"}
    write(client, "PUT", path, bounds, attempt["version"])
    write(client, "PATCH", f'/sleeps/{parent["id"]}', {"end": "2026-10-04T12:00:00Z"}, parent["version"])
    edited = client.get("/api/v1/days/2026-10-04").json()["settling"][0]
    assert edited["start_at"] == bounds["start"]
    assert edited["end_at"] == bounds["end"]
    assert client.put('/api/v1' + path, json={**bounds, "end": "2026-10-04T11:55:00Z"},
                      headers={"If-Match": f'"{edited["version"]}"'}).status_code == 422


@pytest.mark.parametrize("waking_state", ["none", "resumed", "awake"])
@pytest.mark.parametrize("end,starts_day", [("2026-10-03T20:30:00Z", False), ("2026-10-03T21:00:00Z", True)])
def test_finish_night_uses_local_cycle_date(client: TestClient, waking_state: str,
                                            end: str, starts_day: bool) -> None:
    parent = night(client, None)
    waking = None
    if waking_state != "none":
        waking = write(client, "POST", "/night-wakings",
                       waking_values("19:00", "19:20" if waking_state == "resumed" else None))
    closed = write(client, "PATCH", f'/sleeps/{parent["id"]}', {"end": end}, parent["version"])
    assert closed["start"] == parent["start"]
    assert closed["ends_night"] is starts_day
    if waking:
        saved = closed["wakings"][0]
        assert saved["start"] == waking["start"]
        assert saved["end"] == (waking["end"] or end)
    day = client.get("/api/v1/days/2026-10-03").json()
    assert day["complete"] is starts_day
    assert day["metrics"]["day_awake_seconds"] == 50400
    morning = client.get("/api/v1/days/2026-10-04").json()
    assert bool(morning["previous_night"]) is starts_day
    if not starts_day:
        continued = write(client, "POST", "/sleeps", {"day": parent["day"], "kind": "night",
                                                      "start": end, "end": "2026-10-04T04:00:00Z"})
        assert continued["ends_night"] is True
