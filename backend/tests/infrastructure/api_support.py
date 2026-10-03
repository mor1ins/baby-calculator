from typing import Any

from fastapi.testclient import TestClient


def register(client: TestClient, email: str = "mother@example.com") -> dict[str, Any]:
    anonymous = client.get("/api/v1/session")
    assert anonymous.status_code == 200, anonymous.text
    client.headers["X-CSRF-Token"] = anonymous.json()["csrf_token"]
    response = client.post("/api/v1/register", json={"email": email, "password": "test-password-123",
                                                     "name": "Анна", "timezone": "Europe/Moscow"})
    assert response.status_code == 201, response.text
    client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
    user: dict[str, Any] = response.json()["user"]
    return user


def write(client: TestClient, method: str, path: str, data: dict[str, Any], version: int | None = None) -> Any:
    response = client.request(method, f"/api/v1{path}", json=data,
                              headers={"If-Match": f'"{version}"'} if version is not None else {})
    assert response.status_code < 300, response.text
    return response.json() if response.status_code != 204 else None
