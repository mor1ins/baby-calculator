import re
from typing import Any

from httpx2 import Response
from jsonschema import Draft202012Validator, FormatChecker

from service.wiring import specification

SPEC = specification()


def validate_response(response: Response) -> None:
    if not response.request.url.path.startswith("/api/v1/"):
        return
    response.read()
    path = response.request.url.path.removeprefix("/api/v1")
    matching = next(methods for route, methods in SPEC["paths"].items()
                    if re.fullmatch(re.sub(r"\{[^}]+\}", "[^/]+", route), path))
    operation = matching[response.request.method.lower()]
    result = operation["responses"].get(str(response.status_code), operation["responses"]["default"])
    if "$ref" in result:
        result = SPEC["components"]["responses"][result["$ref"].split("/")[-1]]
    if response.status_code == 204:
        assert not response.content
        return
    schema: dict[str, Any] = {**result["content"]["application/json"]["schema"], "components": SPEC["components"]}
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(response.json())
