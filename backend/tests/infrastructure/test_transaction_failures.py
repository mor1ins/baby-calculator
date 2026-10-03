import asyncio
from collections.abc import AsyncIterator
from dataclasses import replace
from uuid import uuid4

import pytest
import pytest_asyncio
from sqlalchemy import text

from service.container import Container
from service.contracts.persistence import AccountDiary, CreateAccountDiary
from service.contracts.repositories import PersistenceConflict
from tests.infrastructure.repository_support import NOW, CreateAccount, new_account, persistence_bus

pytestmark = [pytest.mark.integration, pytest.mark.asyncio]


@pytest_asyncio.fixture(name="transaction_container")
async def transaction_container_fixture(sql_container: Container) -> AsyncIterator[Container]:
    try:
        yield sql_container
    finally:
        engine = sql_container.database_engine()
        assert engine is not None
        await engine.dispose()


async def test_commit_rejection_rolls_back_every_repository(transaction_container: Container) -> None:
    engine = transaction_container.database_engine()
    assert engine is not None
    # This constraint exists only in this disposable test database, never in production migrations.
    async with engine.begin() as connection:
        await connection.execute(text("""
            CREATE FUNCTION reject_test_commit() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF NEW.name = 'reject-at-commit' THEN
                    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'test deferred rejection';
                END IF;
                RETURN NEW;
            END $$;
            CREATE CONSTRAINT TRIGGER reject_test_commit AFTER INSERT ON users
            DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_test_commit();
        """))
    bus = persistence_bus(transaction_container.unit_of_work)
    rejected = CreateAccountDiary(replace(new_account(), name="reject-at-commit"), uuid4(), "Europe/Moscow", NOW)
    with pytest.raises(PersistenceConflict):
        await bus.send(CreateAccount(rejected))
    async with transaction_container.unit_of_work() as work:
        assert await work.accounts.find(rejected.account.id) is None
        assert await work.diaries.find_by_owner(rejected.account.id) is None
    accepted = replace(rejected, account=new_account(), diary_id=uuid4())
    assert (await bus.send(CreateAccount(accepted))).account.id == accepted.account.id


@pytest.mark.parametrize("conflict", ["email", "diary_id"])
async def test_concurrent_constraint_conflict_has_one_atomic_winner(
    transaction_container: Container, conflict: str,
) -> None:
    bus = persistence_bus(transaction_container.unit_of_work)
    first = CreateAccountDiary(new_account(), uuid4(), "Europe/Moscow", NOW)
    second = replace(first, account=new_account(), diary_id=uuid4())
    if conflict == "email":
        second = replace(second, account=replace(second.account, email=first.account.email))
    else:
        second = replace(second, diary_id=first.diary_id)

    async def create(message: CreateAccountDiary) -> AccountDiary | None:
        try:
            result: AccountDiary = await bus.send(CreateAccount(message))
            return result
        except PersistenceConflict:
            return None

    results = await asyncio.wait_for(asyncio.gather(create(first), create(second)), timeout=10)
    assert sum(result is not None for result in results) == 1
    async with transaction_container.unit_of_work() as work:
        for message, result in zip((first, second), results):
            account = await work.accounts.find(message.account.id)
            diary = await work.diaries.find_by_owner(message.account.id)
            if result is None:
                assert account is None and diary is None
            else:
                assert account == result.account and diary == result.diary


async def test_uncommitted_data_is_invisible_to_another_unit(transaction_container: Container) -> None:
    account = new_account()
    async with transaction_container.unit_of_work() as writer:
        await writer.accounts.add(account, NOW)
        async with transaction_container.unit_of_work() as reader:
            assert await reader.accounts.find(account.id) is None
        await writer.commit()
    async with transaction_container.unit_of_work() as reader:
        assert await reader.accounts.find(account.id) is not None
