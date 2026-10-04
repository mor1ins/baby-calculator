"""Structured error diagnostics with an explicit allowlist of request values."""
import json
import logging
import traceback
from typing import Any
from uuid import uuid4

from fastapi import Request
from starlette.responses import JSONResponse

from service.contracts.operations import AppError, Operation

LOGGER = logging.getLogger(__name__)
SLEEP_OPERATIONS = {"createSleep", "updateSleep"}


def operation_context(operation: Operation) -> dict[str, Any]:
    context: dict[str, Any] = {
        "operation": operation.name,
        "server_now": operation.now.isoformat(),
        "version": operation.version,
    }
    if operation.name in SLEEP_OPERATIONS:
        context["sleep"] = {key: operation.data[key] for key in (
            "day", "kind", "start", "end", "ends_night",
        ) if key in operation.data}
        context["sleep_id"] = operation.params.get("sleep_id")
    return context


def log_error(request: Request, response: JSONResponse, code: str, exc: Exception) -> JSONResponse:
    request_id = uuid4().hex
    route = request.scope.get("route")
    record = {
        "event": "api_error",
        "request_id": request_id,
        "method": request.method,
        "route": route.path if route is not None else "unmatched",
        "status": response.status_code,
        "code": code,
        "context": request.scope.get("diagnostics", {}),
        "exception_type": type(exc).__name__,
    }
    if isinstance(exc, AppError):
        record["reason"] = exc.message
        record["time_errors"] = {
            key: value for key, value in exc.fields.items()
            if key in {"start", "end"} and value in {"future", "not_after_start"}
        }
    if response.status_code >= 500:
        # Frame locations are useful; exception messages and locals can contain credentials.
        record["traceback"] = [
            {"file": frame.filename, "line": frame.lineno, "function": frame.name}
            for frame in traceback.extract_tb(exc.__traceback__)
        ]
    LOGGER.log(logging.ERROR if response.status_code >= 500 else logging.WARNING,
               "%s", json.dumps(record, ensure_ascii=False))
    response.headers["X-Request-ID"] = request_id
    return response
