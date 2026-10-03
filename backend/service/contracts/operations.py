from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol

from service.contracts.messages import Command


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str = "", fields: dict[str, str] | None = None) -> None:
        super().__init__(code)
        self.status = status
        self.code = code
        self.message = message or code
        self.fields = fields or {}


@dataclass(frozen=True)
class Operation(Command):
    name: str
    now: datetime
    data: dict[str, Any] = field(default_factory=dict)
    params: dict[str, str] = field(default_factory=dict)
    token: str = field(default="", repr=False)
    csrf: str = field(default="", repr=False)
    version: int | None = None


@dataclass(frozen=True)
class PersistOperation(Command):
    operation: Operation


@dataclass
class OperationResult:
    body: Any = None
    status: int = 200
    cookie: str | None = field(default=None, repr=False)
    error: AppError | None = None


class OperationRepository(Protocol):
    async def execute(self, operation: Operation) -> OperationResult:
        ...


@dataclass(frozen=True)
class CalculateDays(Command):
    documents: list[dict[str, Any]]
    now: datetime
    summary: bool = False
