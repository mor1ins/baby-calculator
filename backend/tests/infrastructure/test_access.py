from typing import Any

import pytest
from dependency_injector import providers
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from service.container import Container
from tests.infrastructure.api_support import register, write

pytestmark = pytest.mark.integration


def sign_out(client: TestClient) -> None:
    assert client.delete("/api/v1/session").status_code == 204


def promote(database_url: str, user: dict[str, Any]) -> None:
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(text("DELETE FROM user_roles WHERE user_id=:id"), {"id": user["id"]})
        connection.execute(text("INSERT INTO user_roles(user_id,role_code) VALUES (:id,'admin')"), {"id": user["id"]})
    engine.dispose()


def test_admin_read_only_block_revoke_and_audit(client: TestClient, database_url: str) -> None:
    mother = register(client)
    mother_cookie = client.cookies.get("session")
    assert mother_cookie is not None
    write(client, "POST", "/schedules", {"name": "Мамин график", "segments": [
        {"kind": "awake", "duration_minutes": 600}, {"kind": "night", "duration_minutes": 600}]})
    sign_out(client)
    admin = register(client, "admin@example.com")
    promote(database_url, admin)
    admin_cookie = client.cookies.get("session")
    assert admin_cookie is not None
    users = client.get("/api/v1/admin/users?limit=1")
    assert users.status_code == 200, users.text
    assert users.json()["next_cursor"]
    assert client.get(f'/api/v1/admin/users/{mother["id"]}/schedules').json()["items"][0]["name"] == "Мамин график"
    assert client.post("/api/v1/sleeps", json={"day": "2026-10-03", "kind": "nap",
                       "start": "2026-10-03T08:00:00Z", "end": None, "ends_night": False}).status_code == 403
    blocked = write(client, "PATCH", f'/admin/users/{mother["id"]}/status',
                    {"blocked": True, "reason": "Тест блокировки"}, mother["version"])
    assert blocked["blocked"]
    client.cookies.clear()
    client.cookies.set("session", mother_cookie)
    response = client.get("/api/v1/session")
    assert response.status_code == 403
    assert response.json()["code"] == "account_blocked"
    client.cookies.clear()
    client.cookies.set("session", admin_cookie)
    write(client, "PATCH", f'/admin/users/{mother["id"]}/status',
          {"blocked": False, "reason": "Проверка разблокировки"}, blocked["version"])
    client.cookies.clear()
    client.cookies.set("session", mother_cookie)
    assert client.get("/api/v1/session").status_code == 401
    engine = create_engine(database_url)
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT count(*) FROM admin_audit_log")) == 2
    engine.dispose()


def test_ownership_csrf_and_unknown_fields(client: TestClient) -> None:
    first = register(client)
    schedule = write(client, "POST", "/schedules", {"name": "Чужой", "segments": [
        {"kind": "awake", "duration_minutes": 600}, {"kind": "night", "duration_minutes": 600}]})
    sign_out(client)
    register(client, "second@example.com")
    assert not client.get(f'/api/v1/schedules?user_id={first["id"]}').json()["items"]
    update = client.patch(f'/api/v1/schedules/{schedule["id"]}', json={"name": "Взлом"}, headers={"If-Match": '"1"'})
    assert update.status_code == 404
    for headers in ({"X-CSRF-Token": "bad"}, {"Origin": "https://other.test"}):
        assert client.patch("/api/v1/me", json={"name": "Новое"},
                            headers={"If-Match": '"1"', **headers}).status_code == 403
    assert client.patch("/api/v1/me", json={"roles": ["admin"]}, headers={"If-Match": '"1"'}).status_code == 422


def test_login_works_when_registration_is_disabled(client: TestClient, sql_container: Container) -> None:
    existing = register(client)
    settings = sql_container.settings().model_copy(update={"registration_enabled": False})
    sql_container.settings.override(providers.Object(settings))
    assert client.get("/api/v1/session").json()["user"]["id"] == existing["id"]
    sign_out(client)
    client.headers["X-CSRF-Token"] = client.get("/api/v1/session").json()["csrf_token"]
    denied = client.post("/api/v1/register", json={
        "email": "closed@example.com", "password": "test-password-123", "name": "Тест", "timezone": "Europe/Moscow",
    })
    assert denied.status_code == 403
    assert denied.json()["code"] == "registration_disabled"
    logged_in = write(client, "POST", "/session", {"email": existing["email"], "password": "test-password-123"})
    assert logged_in["user"]["id"] == existing["id"]
