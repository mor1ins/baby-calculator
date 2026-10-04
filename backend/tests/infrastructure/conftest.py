import os
from collections.abc import AsyncIterator, Callable, Iterator
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import psycopg
import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from dependency_injector import providers
from fastapi.testclient import TestClient
from psycopg import sql
from pydantic import SecretStr
from sqlalchemy import Connection, create_engine
from sqlalchemy.engine import make_url

from service.bootstrap import create_app
from service.container import Container
from service.contracts.repositories import UnitOfWork
from service.settings import Settings
from tests.fakes.repositories import FakeUnitOfWork, MemoryStore
from tests.infrastructure.response_contract import validate_response

BACKEND = Path(__file__).resolve().parents[2]


@pytest.fixture(name="migration_config")
def alembic_config() -> Config:
    return Config(str(BACKEND / "alembic.ini"))


@pytest.fixture(name="database_url")
def isolated_database(monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    source = os.environ.get("BABY_TEST_DATABASE_URL")
    if not source:
        pytest.skip("Set BABY_TEST_DATABASE_URL to a PostgreSQL account with CREATEDB")
    url = make_url(source)
    assert url.drivername == "postgresql+psycopg"
    database_name = f"baby_test_{uuid4().hex}"
    admin_dsn = url.set(drivername="postgresql").render_as_string(hide_password=False)
    with psycopg.connect(admin_dsn, autocommit=True) as connection:
        connection.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database_name)))
        try:
            isolated_url = url.set(database=database_name).render_as_string(hide_password=False)
            monkeypatch.setenv("BABY_DATABASE_URL", isolated_url)
            yield isolated_url
        finally:
            connection.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(database_name)))


@pytest.fixture(name="database")
def migrated_connection(database_url: str, migration_config: Config) -> Iterator[Connection]:
    command.upgrade(migration_config, "head")
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            yield connection
    finally:
        engine.dispose()


@pytest.fixture(name="sql_container")
def configured_container(database_url: str, migration_config: Config) -> Container:
    command.upgrade(migration_config, "head")
    result = Container()
    settings = Settings(database_url=SecretStr(database_url), registration_enabled=True)
    result.settings.override(providers.Object(settings))
    return result


@pytest_asyncio.fixture(name="work_factory", params=["fake", pytest.param("postgres", marks=pytest.mark.integration)])
async def repository_factory(request: pytest.FixtureRequest) -> AsyncIterator[Callable[[], UnitOfWork]]:
    if request.param == "fake":
        store = MemoryStore()
        yield lambda: FakeUnitOfWork(store)
    else:
        container: Container = request.getfixturevalue("sql_container")
        try:
            yield container.unit_of_work
        finally:
            engine = container.database_engine()
            assert engine is not None
            await engine.dispose()


@pytest.fixture(name="client")
def api_client(sql_container: Container) -> Iterator[TestClient]:
    sql_container.clock.override(providers.Object(lambda: datetime(2026, 10, 4, 12, tzinfo=timezone.utc)))
    with TestClient(create_app(container=sql_container)) as client:
        client.event_hooks["response"].append(validate_response)
        yield client
