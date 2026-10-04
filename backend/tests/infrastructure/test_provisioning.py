import os
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

pytestmark = pytest.mark.integration
SCRIPT_DIR = Path(__file__).resolve().parents[3] / "deploy"
PASSWORD = "Provisioning-test-123"


def provision(role: str, *options: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT_DIR / f"create_{role}.py"), "--email", "Parent@example.com",
         "--name", "Екатерина", "--password-stdin", *options],
        input=PASSWORD + "\n", text=True, capture_output=True, check=False, env=os.environ.copy(),
    )


@pytest.mark.parametrize("role", ["user", "admin"])
def test_provisioned_account_login_and_duplicate(client: TestClient, database_url: str, role: str) -> None:
    created = provision(role)
    assert created.returncode == 0, created.stderr
    duplicate = provision(role)
    assert duplicate.returncode == 1
    assert "уже существует" in duplicate.stderr
    assert PASSWORD not in created.stdout + created.stderr + duplicate.stdout + duplicate.stderr
    client.headers["X-CSRF-Token"] = client.get("/api/v1/session").json()["csrf_token"]
    response = client.post("/api/v1/session", json={"email": "parent@example.com", "password": PASSWORD})
    assert response.status_code == 200, response.text
    user = response.json()["user"]
    assert user["roles"] == [role]
    assert user["name"] == "Екатерина"
    engine = create_engine(database_url)
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT count(*) FROM users")) == 1
        assert connection.scalar(text("SELECT count(*) FROM diaries")) == (1 if role == "user" else 0)
    engine.dispose()


def test_invalid_timezone_creates_no_account(client: TestClient, database_url: str) -> None:
    assert client.get("/ready").status_code == 200
    result = provision("user", "--timezone", "Invalid/Timezone")
    assert result.returncode == 1
    engine = create_engine(database_url)
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT count(*) FROM users")) == 0
    engine.dispose()
