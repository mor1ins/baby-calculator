import base64
import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.infrastructure.api_support import register
from tests.infrastructure.test_access import promote

pytestmark = pytest.mark.integration


@pytest.mark.parametrize("key", [123, None, [], {}, True, "invalid-uuid"])
def test_invalid_cursor_key_is_validation_error(client: TestClient, database_url: str, key: Any) -> None:
    promote(database_url, register(client))
    cursor = base64.urlsafe_b64encode(json.dumps([key, "", 30]).encode()).decode()
    response = client.get("/api/v1/admin/users", params={"cursor": cursor})
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
