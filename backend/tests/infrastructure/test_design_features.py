from datetime import datetime, timezone

import pytest
from dependency_injector import providers
from fastapi.testclient import TestClient

from service.container import Container
from tests.infrastructure.api_support import register, write

pytestmark = pytest.mark.integration


def set_clock(container: Container, value: str) -> None:
    instant = datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
    container.clock.override(providers.Object(lambda: instant))


@pytest.mark.parametrize("with_nap", [True, False])
def test_private_snapshot_and_versions(client: TestClient, sql_container: Container, with_nap: bool) -> None:
    register(client)
    profile = {"name": "Саша", "born": "2026-02-03", "sex": "boy", "health": "private health"}
    write(client, "PUT", "/child", profile, 0)
    assert client.get("/api/v1/child").json()["profile"] == profile
    assert client.put("/api/v1/child", json=profile, headers={"If-Match": '"0"'}).status_code == 412
    intervals = [
        ("2026-10-02", "night", "2026-10-02T18:00:00Z", "2026-10-03T03:00:00Z"),
        ("2026-10-03", "nap", "2026-10-03T08:00:00Z", "2026-10-03T09:00:00Z"),
        ("2026-10-03", "night", "2026-10-03T18:00:00Z", "2026-10-04T03:00:00Z"),
    ]
    for cycle, kind, start, end in intervals:
        if kind == "nap" and not with_nap:
            continue
        write(client, "POST", "/sleeps", {"day": cycle, "kind": kind, "start": start, "end": end})
    day = client.get("/api/v1/days/2026-10-03").json()
    write(client, "PUT", "/days/2026-10-03/context", {"note": "private note", "help": "На руках"}, day["version"])
    period = {"from": "2026-10-03", "to": "2026-10-03"}
    report = client.get("/api/v1/statistics", params=period).json()
    assert report["complete_count"] == 1
    assert report["averages"]["nap"] == (60 if with_nap else 0)
    assert report["rows"][0]["lastWake"] == (540 if with_nap else 900)
    assert report["rows"][0]["context"] == "private note"
    share = write(client, "POST", "/shares", period)
    write(client, "PUT", "/child", {**profile, "name": "Новое имя"}, 1)
    with TestClient(client.app) as anonymous:
        public = anonymous.get(f'/api/v1/public/reports/{share["token"]}')
        assert public.status_code == 200
        assert public.json()["child"]["name"] == "Саша"
        assert "private" not in public.text
        assert "2026-02-03" not in public.text
        assert public.json()["averages"] == report["averages"]
        assert anonymous.get("/api/v1/statistics", params=period).status_code == 401
    set_clock(sql_container, "2026-10-05T12:00:00")
    assert client.get(f'/api/v1/public/reports/{share["token"]}').json() == public.json()
    write(client, "DELETE", f'/shares/{share["id"]}', {})
    assert client.get(f'/api/v1/public/reports/{share["token"]}').status_code == 404


def test_settling_is_atomic(client: TestClient, sql_container: Container) -> None:
    register(client)
    attempt = write(client, "POST", "/settling", {"day": "2026-10-04"})
    assert client.post("/api/v1/settling", json={"day": "2026-10-04"}).status_code == 409
    set_clock(sql_container, "2026-10-04T12:10:00")
    sleep = {"day": "2026-10-04", "kind": "nap", "start": "2026-10-04T11:59:00Z", "end": None}
    assert client.post("/api/v1/sleeps", json=sleep).status_code == 422
    day = client.get("/api/v1/days/2026-10-04").json()
    assert not day["sleeps"]
    assert day["settling"][0]["end_at"] is None
    write(client, "PATCH", f'/settling/{attempt["id"]}', {}, attempt["version"])
    next_attempt = write(client, "POST", "/settling", {"day": "2026-10-04"})
    set_clock(sql_container, "2026-10-04T12:20:00")
    saved = write(client, "POST", "/sleeps", {**sleep, "start": "2026-10-04T12:15:00Z"})
    attempts = client.get("/api/v1/days/2026-10-04").json()["settling"]
    assert attempts[0]["sleep_id"] is None
    assert attempts[1]["id"] == next_attempt["id"]
    assert attempts[1]["sleep_id"] == saved["id"]
    assert attempts[1]["end_at"] == saved["start"]
    edit = {"start": "2026-10-04T12:16:00Z"}
    updated = write(client, "PATCH", f'/sleeps/{saved["id"]}', edit, saved["version"])
    assert client.get("/api/v1/days/2026-10-04").json()["settling"][1]["end_at"] == edit["start"]
    write(client, "DELETE", f'/sleeps/{saved["id"]}', {}, updated["version"])
    assert client.get("/api/v1/days/2026-10-04").json()["settling"][1]["sleep_id"] is None


def test_attempt_owner_isolation(client: TestClient) -> None:
    register(client)
    attempt = write(client, "POST", "/settling", {"day": "2026-10-04"})
    with TestClient(client.app) as other:
        register(other, "other@example.com")
        response = other.delete(f'/api/v1/settling/{attempt["id"]}', headers={"If-Match": '"1"'})
        assert response.status_code == 404
    assert client.get("/api/v1/days/2026-10-04").json()["settling"][0]["end_at"] is None
