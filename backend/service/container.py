import math

from argon2 import PasswordHasher
from dependency_injector import containers, providers
from mediapyr import Mediator
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from service.api.health import HealthEndpoints
from service.api.operations import ApiEndpoints, CookiePolicy
from service.application.health import ReadinessHandler
from service.application.operations import OperationHandler
from service.contracts.health import CheckDatabase, CheckReadiness, RuntimeStatus
from service.contracts.operations import CalculateDays, Operation, PersistOperation
from service.contracts.persistence import CreateAccountDiary
from service.domain.day import CalculateDaysHandler
from service.infrastructure.accounts import CreateAccountDiaryHandler
from service.infrastructure.database import DatabaseReadinessHandler
from service.infrastructure.operations import PersistOperationHandler
from service.infrastructure.repositories.accounts import SqlAccountsRepository
from service.infrastructure.repositories.diaries import SqlDiariesRepository
from service.infrastructure.repositories.store import SqlOperationRepository
from service.infrastructure.repositories.transaction import Transaction
from service.infrastructure.security import Passwords
from service.infrastructure.unit_of_work import SqlUnitOfWork
from service.messaging.bus import MediatorMessageBus
from service.settings import Settings
from service.wiring import repository_scope, specification, utc_now


def create_database_engine(settings: Settings) -> AsyncEngine | None:
    if settings.database_url is None:
        return None
    return create_async_engine(
        settings.database_url.get_secret_value(), pool_pre_ping=True, hide_parameters=True,
        pool_timeout=settings.database_timeout,
        connect_args={"connect_timeout": max(2, math.ceil(settings.database_timeout))},
    )


def create_session_factory(engine: AsyncEngine | None) -> async_sessionmaker[AsyncSession]:
    if engine is None:
        raise RuntimeError("Database is not configured")
    return async_sessionmaker(engine, expire_on_commit=False)


def database_timeout(settings: Settings) -> float:
    return settings.database_timeout


class Container(containers.DeclarativeContainer):
    """Composition root. Register future handler factories here, never inside consumers."""

    mediator = providers.Factory(Mediator)
    message_bus = providers.Singleton(MediatorMessageBus, mediator_factory=mediator.provider, max_transfers=3)

    settings = providers.Singleton(Settings)
    database_engine = providers.Singleton(create_database_engine, settings=settings)
    session_factory = providers.Singleton(create_session_factory, engine=database_engine)
    transaction = providers.Factory(Transaction)
    accounts_repository = providers.Factory(SqlAccountsRepository)
    diaries_repository = providers.Factory(SqlDiariesRepository)
    unit_of_work = providers.Factory(
        SqlUnitOfWork, session_factory=session_factory,
        transaction_factory=transaction.provider, accounts_factory=accounts_repository.provider,
        diaries_factory=diaries_repository.provider,
    )
    create_account_diary_handler = providers.Factory(CreateAccountDiaryHandler, unit_of_work=unit_of_work)
    database_readiness_handler = providers.Factory(
        DatabaseReadinessHandler, engine=database_engine,
        timeout=providers.Callable(database_timeout, settings=settings),
    )
    calculate_days_handler = providers.Factory(CalculateDaysHandler)
    password_hasher = providers.Singleton(PasswordHasher)
    passwords = providers.Singleton(Passwords, hasher=password_hasher)
    repository_scope = providers.Factory(repository_scope, passwords=passwords)
    operation_repository = providers.Factory(
        SqlOperationRepository, session_factory=session_factory, scope_factory=repository_scope.provider,
        transaction_factory=transaction.provider,
    )
    persist_operation_handler = providers.Factory(PersistOperationHandler, repository=operation_repository)
    operation_handler = providers.Factory(OperationHandler, bus=message_bus)
    api_specification = providers.Singleton(specification)
    clock = providers.Object(utc_now)
    cookie_policy = providers.Callable(
        lambda value: CookiePolicy(value.public_origin, value.environment in {"dev", "prod"}), settings,
    )
    api_endpoints = providers.Factory(
        ApiEndpoints, bus=message_bus, specification=api_specification, clock=clock,
        cookie_policy=cookie_policy,
    )
    runtime_status = providers.Singleton(RuntimeStatus)
    readiness_handler = providers.Factory(ReadinessHandler, status=runtime_status, bus=message_bus)
    health_endpoints = providers.Factory(HealthEndpoints, bus=message_bus)


def register_handlers(container: Container) -> None:
    container.message_bus().register(CalculateDays, CalculateDaysHandler, container.calculate_days_handler, "domain")
    container.message_bus().register(Operation, OperationHandler, container.operation_handler, "application")
    container.message_bus().register(
        PersistOperation, PersistOperationHandler, container.persist_operation_handler, "infrastructure",
    )
    container.message_bus().register(
        CheckReadiness, ReadinessHandler, container.readiness_handler, "application",
    )
    container.message_bus().register(
        CheckDatabase, DatabaseReadinessHandler, container.database_readiness_handler, "infrastructure",
    )
    container.message_bus().register(
        CreateAccountDiary, CreateAccountDiaryHandler, container.create_account_diary_handler, "infrastructure",
    )
