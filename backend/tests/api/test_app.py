from typing import Any

import pytest
from dependency_injector import providers
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict, ValidationError

from service.bootstrap import create_app
from service.container import Container
from service.contracts.health import CheckDatabase
from service.settings import Settings


class AvailableDatabase:
    async def handle(self, _message: CheckDatabase) -> bool:
        return True


def build_test_container() -> Container:
    result = Container()
    result.settings.override(providers.Object(Settings(environment="test", database_url=None)))
    result.message_bus.override(providers.Singleton(
        result.message_bus.provides, mediator_factory=result.mediator.provider, max_transfers=2,
    ))
    result.database_readiness_handler.override(providers.Factory(AvailableDatabase))
    return result


@pytest.fixture(name="container")
def app_container() -> Container:
    return build_test_container()


def test_lifecycle_readiness_and_isolation(container: Container) -> None:
    app = create_app(container=container)
    other = build_test_container()
    second_app = create_app(container=other)
    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok"}
        assert client.get("/ready").json() == {"status": "ready"}
        with TestClient(second_app) as second:
            assert second.get("/ready").status_code == 200
        assert client.get("/ready").status_code == 200
        assert not other.runtime_status().started
    assert not container.runtime_status().started
    response = TestClient(app).get("/ready")
    assert response.status_code == 503
    assert response.json() == {"code": "unavailable", "message": "Service Unavailable", "fields": {}}


@pytest.mark.parametrize("path,method,status,code", [
    ("/missing", "GET", 404, "not_found"),
    ("/health", "POST", 405, "method_not_allowed"),
])
def test_framework_errors(container: Container, path: str, method: str, status: int, code: str) -> None:
    with TestClient(create_app(container=container)) as client:
        response = client.request(method, path)
    assert response.status_code == status
    assert response.json()["code"] == code
    assert response.json()["fields"] == {}
    assert response.headers["cache-control"] == "no-store"
    if status == 405:
        assert "GET" in response.headers["allow"]


class InputPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    count: int


async def validate_payload(payload: InputPayload) -> dict[str, int]:
    return {"count": payload.count}


async def fail() -> None:
    raise RuntimeError("secret-database-password")


async def limited() -> None:
    raise HTTPException(429, detail="secret-internal-detail", headers={"Retry-After": "60"})


@pytest.mark.parametrize("payload", [{"count": "private-input"}, {"count": 1, "password": "private-input"}])
def test_validation_does_not_echo_input(container: Container, payload: dict[str, Any]) -> None:
    app = create_app(container=container)
    app.post("/test-validation")(validate_payload)
    with TestClient(app) as client:
        response = client.post("/test-validation", json=payload)
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert response.json()["fields"]
    assert "private-input" not in response.text


def test_unexpected_error_and_retry_header(container: Container) -> None:
    app = create_app(container=container)
    app.get("/test-failure")(fail)
    app.get("/test-limit")(limited)
    with TestClient(app, raise_server_exceptions=False) as client:
        failure = client.get("/test-failure")
        limit = client.get("/test-limit")
        assert client.get("/ready").status_code == 200
    assert failure.status_code == 500
    assert failure.json() == {"code": "internal_error", "message": "Internal server error", "fields": {}}
    assert limit.status_code == 429
    assert limit.json()["code"] == "rate_limited"
    assert limit.headers["retry-after"] == "60"
    assert "secret" not in failure.text + limit.text


def test_environment_settings_and_production_docs(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BABY_DATABASE_URL", raising=False)
    monkeypatch.setenv("BABY_ENVIRONMENT", "prod")
    with TestClient(create_app()) as client:
        assert client.get("/docs").status_code == 404
        assert client.get("/openapi.json").status_code == 404
        assert client.get("/ready").status_code == 503
    monkeypatch.setenv("BABY_ENVIRONMENT", "invalid")
    with pytest.raises(ValidationError):
        create_app()


def test_local_schema_contains_contract_routes(container: Container) -> None:
    with TestClient(create_app(container=container)) as client:
        response = client.get("/openapi.json")
    assert response.status_code == 200
    paths = set(response.json()["paths"])
    assert {"/health", "/ready", "/api/v1/session", "/api/v1/sleeps"} <= paths
    assert len(paths) == 29
