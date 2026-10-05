from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.infrastructure.api_support import register, write

pytestmark = pytest.mark.integration


def test_session_schedule_and_diary(client: TestClient) -> None:
    user = register(client)
    plan = write(client, "POST", "/schedules", {"name": "Обычный", "segments": [
        {"kind": kind, "duration_minutes": duration} for kind, duration in
        [("awake", 260), ("nap", 80), ("awake", 280), ("nap", 20), ("awake", 180), ("night", 600)]
    ]})
    write(client, "PATCH", "/me", {"default_schedule_id": plan["id"]}, user["version"])
    night = write(client, "POST", "/sleeps", {"day": "2026-10-01", "kind": "night",
                                              "start": "2026-10-01T18:00:00Z", "end": "2026-10-02T03:30:00Z",
                                              "ends_night": True})
    day = client.get("/api/v1/days/2026-10-02").json()
    assert day["previous_night"]["id"] == night["id"]
    assert day["schedule"]["source_id"] == plan["id"]
    day = write(client, "PUT", "/days/2026-10-02/schedule", {"schedule_id": plan["id"]}, day["version"])
    assert day["schedule"]["name"] == "Обычный"
    nap = write(client, "POST", "/sleeps", {"day": "2026-10-02", "kind": "nap",
                                            "start": "2026-10-02T07:50:00Z", "end": "2026-10-02T09:10:00Z",
                                            "ends_night": False})
    day = client.get("/api/v1/days/2026-10-02").json()
    assert day["metrics"]["day_sleep_seconds"] == 4800
    interval = next(entry for entry in day["timeline"] if entry["sleep_id"] == nap["id"])
    note = write(client, "PUT", f"/comments/{uuid4()}", {"target_id": interval["id"], "text": "Спал спокойно"}, 0)
    assert note["version"] == 1
    conflict = client.patch(f'/api/v1/sleeps/{nap["id"]}', json={"end": "2026-10-02T09:20:00Z"},
                            headers={"If-Match": '"1"'})
    assert conflict.status_code == 412
    assert client.get("/api/v1/days?from=2026-10-01&to=2026-10-02").status_code == 200


def test_auth_validation_and_session_rotation(client: TestClient) -> None:
    user = register(client)
    assert user["roles"] == ["user"]
    denied = client.post("/api/v1/schedules", json={"name": "x", "segments": []})
    assert denied.status_code == 422
    assert client.get("/api/v1/admin/users").status_code == 403
    previous = client.cookies.get("session")
    assert client.delete("/api/v1/session").status_code == 204
    assert client.get("/api/v1/schedules").status_code == 401
    anonymous = client.get("/api/v1/session").json()
    client.headers["X-CSRF-Token"] = anonymous["csrf_token"]
    login = client.post("/api/v1/session", json={"email": user["email"], "password": "test-password-123"})
    assert login.status_code == 200, login.text
    assert client.cookies.get("session") != previous
