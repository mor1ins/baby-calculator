from datetime import datetime, timezone
from typing import Any

import pytest
from dependency_injector import providers

from service.container import Container, register_handlers
from service.contracts.operations import Operation, OperationResult
from service.messaging.bus import ArchitectureViolation
from service.wiring import specification

DAY_OPERATIONS = {"getDay", "adminGetDay", "setDaySchedule", "listDays", "adminListDays"}
NAMES = [entry["operationId"] for methods in specification()["paths"].values() for entry in methods.values()]


class FakeOperations:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def execute(self, operation: Operation) -> OperationResult:
        self.calls.append(operation.name)
        document: dict[str, Any] = {
            "date": operation.now.date(), "timezone": "Europe/Moscow", "version": 0,
            "schedule": None, "previous_night": None, "sleeps": [], "targets": [], "comments": [],
        }
        if operation.name in {"listDays", "adminListDays"}:
            return OperationResult([document])
        return OperationResult(document if operation.name in DAY_OPERATIONS else {"operation": operation.name})


def operation_container(repository: FakeOperations, budget: int) -> Container:
    container = Container()
    container.operation_repository.override(providers.Object(repository))
    container.message_bus.override(providers.Singleton(
        container.message_bus.provides, mediator_factory=container.mediator.provider, max_transfers=budget,
    ))
    register_handlers(container)
    return container


@pytest.mark.asyncio
@pytest.mark.parametrize("name", NAMES)
async def test_every_operation_obeys_its_exact_budget(name: str) -> None:
    repository = FakeOperations()
    budget = 3 if name in DAY_OPERATIONS else 2
    command = Operation(name, datetime(2026, 10, 3, tzinfo=timezone.utc))
    result = await operation_container(repository, budget).message_bus().send(command)
    assert result.status == 200
    assert repository.calls == [name]
    with pytest.raises(ArchitectureViolation, match="budget"):
        await operation_container(FakeOperations(), budget - 1).message_bus().send(command)
