from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.infrastructure.api_support import register, write

pytestmark = pytest.mark.integration


def night(client: TestClient) -> dict[str, Any]:
    result: dict[str, Any] = write(client, "POST", "/sleeps", {
        "day": "2026-10-02", "kind": "night", "start": "2026-10-02T18:00:00Z",
        "end": None, "ends_night": False,
    })
    return result


def test_event_retries_tombstones_and_end_boundaries(client: TestClient) -> None:
    register(client)
    sleep = night(client)
    path = f'/sleeps/{sleep["id"]}/events/{uuid4()}'
    payload = {"occurred_at": "2026-10-02T20:00:00Z"}
    first = write(client, "PUT", path, payload)
    day = client.get("/api/v1/days/2026-10-02").json()
    assert write(client, "PUT", path, payload) == first
    assert client.get("/api/v1/days/2026-10-02").json()["version"] == day["version"]
    invalid = client.patch(f'/api/v1/sleeps/{sleep["id"]}', json={"end": "2026-10-02T19:00:00Z"},
                           headers={"If-Match": '"2"'})
    assert invalid.json()["code"] == "events_outside_sleep"
    write(client, "PATCH", f'/sleeps/{sleep["id"]}', {"end": "2026-10-03T03:00:00Z", "ends_night": True}, 2)
    assert write(client, "PUT", path, payload) == first
    write(client, "DELETE", path, {})
    assert client.put(f'/api/v1{path}', json=payload).json()["code"] == "event_deleted"
    snapshot = client.get("/api/v1/days/2026-10-02").json()
    write(client, "DELETE", path, {})
    repeated = client.get("/api/v1/days/2026-10-02").json()
    assert repeated["version"] == snapshot["version"]
    assert repeated["metrics"] == snapshot["metrics"]
    unseen = f'/sleeps/{sleep["id"]}/events/{uuid4()}'
    write(client, "DELETE", unseen, {})
    assert client.put(f'/api/v1{unseen}', json=payload).json()["code"] == "event_deleted"


def test_wake_comment_survives_boundary_edit_and_orphans_on_insertion(client: TestClient) -> None:
    register(client)
    previous = night(client)
    write(client, "PATCH", f'/sleeps/{previous["id"]}', {"end": "2026-10-03T03:00:00Z", "ends_night": True}, 1)
    day = client.get("/api/v1/days/2026-10-03").json()
    target = day["timeline"][0]["id"]
    comment = write(client, "PUT", f'/comments/{uuid4()}', {"target_id": target, "text": "Тихое утро"}, 0)
    later = write(client, "POST", "/sleeps", {"day": "2026-10-03", "kind": "nap", "start": "2026-10-03T08:00:00Z",
                                              "end": "2026-10-03T09:00:00Z", "ends_night": False})
    day = client.get("/api/v1/days/2026-10-03").json()
    assert day["timeline"][0]["id"] == target
    assert day["timeline"][0]["comment"]["id"] == comment["id"]
    write(client, "PATCH", f'/sleeps/{later["id"]}', {"start": "2026-10-03T08:10:00Z"}, 1)
    write(client, "POST", "/sleeps", {"day": "2026-10-03", "kind": "nap", "start": "2026-10-03T05:00:00Z",
                                      "end": "2026-10-03T05:30:00Z", "ends_night": False})
    day = client.get("/api/v1/days/2026-10-03").json()
    orphan = day["orphaned_comments"][0]
    assert orphan["text"] == "Тихое утро"
    write(client, "PUT", f'/comments/{orphan["id"]}', {"text": orphan["text"], "target_id": day["timeline"][0]["id"]},
          orphan["version"])
    assert not client.get("/api/v1/days/2026-10-03").json()["orphaned_comments"]
