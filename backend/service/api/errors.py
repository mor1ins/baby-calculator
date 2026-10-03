import logging
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse

from service.contracts.operations import AppError

LOGGER = logging.getLogger(__name__)
HTTP_CODES = {
    401: "unauthenticated", 403: "forbidden", 404: "not_found", 405: "method_not_allowed",
    409: "conflict", 412: "version_conflict", 422: "validation_error", 428: "version_required",
    429: "rate_limited", 500: "internal_error", 503: "unavailable",
}


def error_response(status: int, code: str, message: str, fields: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status, content={"code": code, "message": message, "fields": fields or {}},
        headers={"Cache-Control": "no-store"},
    )


async def http_error(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, HTTPException)
    response = error_response(
        exc.status_code, HTTP_CODES.get(exc.status_code, "http_error"), HTTPStatus(exc.status_code).phrase,
    )
    for name, value in (exc.headers or {}).items():
        if name.lower() in {"allow", "retry-after", "www-authenticate"}:
            response.headers[name] = value
    return response


async def validation_error(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    fields = {".".join(str(part) for part in error["loc"]): "Invalid value" for error in exc.errors()}
    return error_response(422, "validation_error", "Request validation failed", fields)


async def unexpected_error(_request: Request, _exc: Exception) -> JSONResponse:
    # Never serialize exception text, request body or validation input: they may contain credentials.
    LOGGER.error("Unhandled request error")
    return error_response(500, "internal_error", "Internal server error")


async def app_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    response = error_response(exc.status, exc.code, exc.message, exc.fields)
    if request.method == "GET" and request.url.path == "/api/v1/session" and exc.status in {401, 403}:
        response.delete_cookie("session", httponly=True, samesite="lax")
    if exc.status == 429:
        response.headers["Retry-After"] = "60"
    return response


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error)
    app.add_exception_handler(HTTPException, http_error)
    app.add_exception_handler(RequestValidationError, validation_error)
    app.add_exception_handler(Exception, unexpected_error)
