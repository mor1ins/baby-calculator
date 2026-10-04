from unittest.mock import AsyncMock

import pytest
from dependency_injector import providers
from fastapi.testclient import TestClient

from service.bootstrap import create_app
from service.contracts.operations import OperationResult
from service.settings import Settings
from tests.api.test_app import build_test_container


@pytest.mark.parametrize("enabled", [False, True])
def test_registration_configuration(enabled: bool) -> None:
    container = build_test_container()
    container.settings.override(providers.Object(Settings(registration_enabled=enabled, database_url=None)))
    repository = AsyncMock()
    repository.execute.return_value = OperationResult({"registered": True}, 201)
    container.operation_repository.override(providers.Object(repository))
    with TestClient(create_app(container=container)) as client:
        response = client.post("/api/v1/register", json={
            "email": "test@example.com", "password": "test-password-123", "name": "Тест", "timezone": "Europe/Moscow",
        })
    if enabled:
        assert response.status_code == 201
        repository.execute.assert_awaited_once()
    else:
        assert response.status_code == 403
        assert response.json()["code"] == "registration_disabled"
        repository.execute.assert_not_awaited()


def test_registration_disabled_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BABY_REGISTRATION_ENABLED", raising=False)
    assert not Settings().registration_enabled
    monkeypatch.setenv("BABY_REGISTRATION_ENABLED", "true")
    assert Settings().registration_enabled
