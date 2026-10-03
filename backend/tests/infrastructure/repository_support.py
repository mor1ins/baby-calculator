from collections.abc import Callable
from datetime import datetime, timezone
from uuid import UUID, uuid4

from dependency_injector import providers

from service.container import Container, register_handlers
from service.contracts.messages import Command, MessageBus
from service.contracts.persistence import AccountDiary, CreateAccountDiary
from service.contracts.repositories import NewAccount, UnitOfWork
from service.messaging.bus import MediatorMessageBus

NOW = datetime(2026, 10, 3, 12, tzinfo=timezone.utc)


def new_account() -> NewAccount:
    return NewAccount(uuid4(), f"{uuid4()}@example.com", "Anna", "already-hashed-password")


class CreateAccount(Command):
    def __init__(self, persistence: CreateAccountDiary) -> None:
        self.persistence = persistence


class AccountWorkflow:
    def __init__(self, bus: MessageBus) -> None:
        self._bus = bus

    async def handle(self, message: CreateAccount) -> AccountDiary:
        result: AccountDiary = await self._bus.send(message.persistence)
        return result


def persistence_bus(work_factory: Callable[[], UnitOfWork]) -> MediatorMessageBus:
    container = Container()
    container.unit_of_work.override(providers.Callable(work_factory))
    container.message_bus.override(providers.Singleton(
        container.message_bus.provides, mediator_factory=container.mediator.provider, max_transfers=2,
    ))
    register_handlers(container)
    bus: MediatorMessageBus = container.message_bus()
    bus.register(CreateAccount, AccountWorkflow, providers.Factory(AccountWorkflow, bus=bus), "application")
    return bus


async def assert_account_missing(work_factory: Callable[[], UnitOfWork], account_id: UUID) -> None:
    async with work_factory() as work:
        assert await work.accounts.find(account_id) is None
