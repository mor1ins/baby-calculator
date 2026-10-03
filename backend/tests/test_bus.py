import asyncio
from typing import Any

import pytest
from dependency_injector import providers

from service.container import Container
from service.contracts.messages import Command, Notification
from service.messaging.bus import ArchitectureViolation, MediatorMessageBus


class Run(Command):
    pass


class Read(Command):
    pass


class Changed(Notification):
    pass


class Reader:
    async def handle(self, _message: Any) -> int:
        await asyncio.sleep(0)
        return 42


class Workflow:
    def __init__(self, bus: MediatorMessageBus, calls: int = 1) -> None:
        self._bus = bus
        self._calls = calls

    async def handle(self, _message: Any) -> list[Any]:
        return [await self._bus.send(Read()) for _ in range(self._calls)]


@pytest.fixture(name="bus")
def message_bus() -> MediatorMessageBus:
    container = Container()
    result: MediatorMessageBus = container.message_bus()
    reader = providers.Factory(Reader)
    result.register(Read, Reader, reader, "infrastructure")
    return result


@pytest.mark.asyncio
async def test_real_mediator_resolves_injected_factory(bus: MediatorMessageBus) -> None:
    factory = providers.Factory(Workflow, bus=bus)
    bus.register(Run, Workflow, factory, "application")
    assert await bus.send(Run()) == [42]
    with factory.override(providers.Factory(Workflow, bus=bus, calls=2)):
        assert await bus.send(Run()) == [42, 42]


@pytest.mark.asyncio
async def test_sequential_transfers_share_budget_and_reset_after_failure(bus: MediatorMessageBus) -> None:
    factory = providers.Factory(Workflow, bus=bus, calls=3)
    bus.register(Run, Workflow, factory, "application")
    with pytest.raises(ArchitectureViolation, match="budget"):
        await bus.send(Run())
    with factory.override(providers.Factory(Workflow, bus=bus)):
        assert await bus.send(Run()) == [42]


@pytest.mark.asyncio
async def test_concurrent_root_commands_have_independent_budgets(bus: MediatorMessageBus) -> None:
    bus.register(Run, Workflow, providers.Factory(Workflow, bus=bus, calls=2), "application")
    results = await asyncio.gather(bus.send(Run()), bus.send(Run()))
    assert list(results) == [[42, 42], [42, 42]]


@pytest.mark.asyncio
async def test_api_cannot_skip_application(bus: MediatorMessageBus) -> None:
    with pytest.raises(ArchitectureViolation, match="api -> infrastructure"):
        await bus.send(Read())


@pytest.mark.asyncio
async def test_nested_application_commands_are_forbidden() -> None:
    bus = Container().message_bus()
    bus.register(Run, Workflow, providers.Factory(Workflow, bus=bus), "application")
    bus.register(Read, Reader, providers.Factory(Reader), "application")
    with pytest.raises(ArchitectureViolation, match="application -> application"):
        await bus.send(Run())


@pytest.mark.asyncio
async def test_event_fanout_counts_every_handler() -> None:
    bus = Container().message_bus(max_transfers=1)

    class SecondReader(Reader):
        pass

    bus.register(Changed, Reader, providers.Factory(Reader), "application")
    bus.register(Changed, SecondReader, providers.Factory(SecondReader), "application")
    with pytest.raises(ArchitectureViolation, match="budget"):
        await bus.publish(Changed())


@pytest.mark.asyncio
async def test_unregistered_command_fails_without_implicit_construction() -> None:
    with pytest.raises(KeyError):
        await Container().message_bus().send(Run())


def test_container_scope_and_duplicate_registration(bus: MediatorMessageBus) -> None:
    container = Container()
    assert container.message_bus() is container.message_bus()
    assert container.message_bus() is not Container().message_bus()
    with pytest.raises(ValueError, match="already registered"):
        bus.register(Read, Reader, providers.Factory(Reader), "infrastructure")
