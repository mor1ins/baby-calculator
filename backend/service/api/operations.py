from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Request
from fastapi.encoders import jsonable_encoder
from jsonschema import Draft202012Validator, FormatChecker
from starlette.responses import JSONResponse, Response

from service.api.diagnostics import operation_context
from service.contracts.messages import MessageBus
from service.contracts.operations import AppError, Operation, OperationResult


@dataclass(frozen=True)
class CookiePolicy:
    origin: str
    secure: bool


class ApiEndpoints:
    def __init__(self, bus: MessageBus, specification: dict[str, Any], clock: Callable[[], datetime],
                 cookie_policy: CookiePolicy) -> None:
        self._bus = bus
        self._specification = specification
        self._clock = clock
        self._origin = cookie_policy.origin
        self._secure = cookie_policy.secure

    def router(self) -> APIRouter:
        router = APIRouter(prefix="/api/v1")
        for path, methods in self._specification["paths"].items():
            for method, spec in methods.items():
                router.add_api_route(path, self._endpoint(method, spec), methods=[method.upper()],
                                     name=spec["operationId"], response_model=None)
        return router

    def _validate(self, schema: dict[str, Any], value: Any) -> None:
        full = {**schema, "components": self._specification["components"]}
        errors = list(Draft202012Validator(full, format_checker=FormatChecker()).iter_errors(value))
        if errors:
            fields = {".".join(str(item) for item in error.path): "Недопустимое значение" for error in errors}
            raise AppError(422, "validation_error", "Проверьте введённые данные", fields)

    def _parameters(self, request: Request, spec: dict[str, Any]) -> tuple[dict[str, str], int | None]:
        values = {**request.query_params, **request.path_params}
        version = None
        for raw in spec.get("parameters", []):
            parameter = self._specification["components"]["parameters"][raw["$ref"].split("/")[-1]] \
                if "$ref" in raw else raw
            name = parameter["name"]
            value = request.headers.get(name) if parameter["in"] == "header" else values.get(name)
            if value is None and parameter.get("required"):
                raise AppError(428 if name == "If-Match" else 422, "version_required" if name == "If-Match"
                               else "validation_error", f"Не указан {name}")
            if value is not None:
                self._validate(parameter["schema"], int(value) if name == "limit" and value.isdigit() else value)
            if name == "If-Match" and value is not None:
                version = int(value.strip('"'))
        return values, version

    def _endpoint(self, method: str, spec: dict[str, Any]) -> Callable[[Request], Any]:
        async def endpoint(request: Request) -> Response:
            if method != "get" and request.headers.get("origin", self._origin) != self._origin:
                raise AppError(403, "csrf_invalid", "Недопустимый источник запроса")
            params, version = self._parameters(request, spec)
            data: dict[str, Any] = {}
            if "requestBody" in spec:
                try:
                    data = await request.json()
                except ValueError as exc:
                    raise AppError(422, "validation_error", "Ожидается JSON") from exc
                self._validate(spec["requestBody"]["content"]["application/json"]["schema"], data)
            params["_peer"] = request.client.host if request.client else "local"
            operation = Operation(
                spec["operationId"], self._clock(), data, params, request.cookies.get("session", ""),
                request.headers.get("X-CSRF-Token", ""), version,
            )
            request.scope["diagnostics"] = operation_context(operation)
            result = await self._bus.send(operation)
            return self._response(result)
        return endpoint

    def _response(self, result: OperationResult) -> Response:
        response = Response(status_code=204) if result.status == 204 else JSONResponse(
            jsonable_encoder(result.body, custom_encoder={
                datetime: lambda value: value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            }), status_code=result.status,
        )
        response.headers["Cache-Control"] = "no-store"
        if result.cookie == "":
            response.delete_cookie("session", httponly=True, secure=self._secure, samesite="lax")
        elif result.cookie:
            response.set_cookie("session", result.cookie, httponly=True, secure=self._secure,
                                samesite="lax", max_age=30 * 86400)
        return response
