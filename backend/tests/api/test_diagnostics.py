import json
from datetime import datetime, timezone
from typing import Any

import pytest
from dependency_injector import providers
from fastapi.testclient import TestClient

from service.bootstrap import create_app
from service.contracts.operations import Operation, OperationResult
from service.infrastructure.repositories.sleep_rules import sleep_times
from tests.api.test_app import build_test_container, fail

NOW = datetime(2026, 10, 4, 12, 45, 30, tzinfo=timezone.utc)


class RejectSleep:
    async def execute(self, operation: Operation) -> OperationResult:
        sleep = {**operation.data, "events": []}
        for key in ("start", "end"):
            if sleep[key] is not None:
                sleep[key] = datetime.fromisoformat(sleep[key].replace("Z", "+00:00"))
        sleep_times(sleep, operation.now, 0)
        return OperationResult()


@pytest.mark.parametrize("start,end,field,reason", [
    ("2026-10-04T12:45:30.001Z", None, "start", "future"),
    ("2026-10-04T12:40:00Z", "2026-10-04T12:45:31Z", "end", "future"),
    ("2026-10-04T12:40:00Z", "2026-10-04T12:39:00Z", "end", "not_after_start"),
])
def test_sleep_failure_diagnostics(caplog: pytest.LogCaptureFixture, start: str,
                                   end: str | None, field: str, reason: str) -> None:
    container = build_test_container()
    container.clock.override(providers.Object(lambda: NOW))
    container.operation_repository.override(providers.Object(RejectSleep()))
    payload = {"day": "2026-10-04", "kind": "nap", "start": start, "end": end, "ends_night": False}
    with TestClient(create_app(container=container)) as client:
        response = client.post("/api/v1/sleeps", json=payload, headers={
            "Cookie": "session=secret-cookie", "X-CSRF-Token": "secret-csrf",
        })
    assert response.status_code == 422
    record = diagnostic_records(caplog)[0]
    assert record["request_id"] == response.headers["x-request-id"]
    assert record["context"]["server_now"] == NOW.isoformat()
    assert record["context"]["sleep"] == payload
    assert record["context"]["operation"] == "createSleep"
    assert record["time_errors"] == {field: reason}
    assert record["reason"] == response.json()["message"]
    assert "secret" not in caplog.text


def diagnostic_records(caplog: pytest.LogCaptureFixture) -> list[dict[str, Any]]:
    return [json.loads(record.message) for record in caplog.records if record.name == "service.api.diagnostics"]


def test_unexpected_error_has_safe_stack(caplog: pytest.LogCaptureFixture) -> None:
    app = create_app(container=build_test_container())
    app.get("/failure")(fail)
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/failure?password=secret-query")
    record = diagnostic_records(caplog)[0]
    assert response.status_code == record["status"] == 500
    assert record["exception_type"] == "RuntimeError"
    assert record["traceback"][-1]["function"] == "fail"
    assert "secret" not in caplog.text


def test_invalid_body_is_not_logged(caplog: pytest.LogCaptureFixture) -> None:
    with TestClient(create_app(container=build_test_container())) as client:
        response = client.post("/api/v1/sleeps", json={"start": "secret-value", "password": "secret-password"})
    assert response.status_code == 422
    assert diagnostic_records(caplog)[0]["context"] == {}
    assert "secret" not in caplog.text
