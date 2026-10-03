import asyncio
from collections.abc import Callable
from dataclasses import replace
from uuid import uuid4

import pytest

from service.container import Container
from service.contracts.persistence import CreateAccountDiary
from service.contracts.repositories import Diary, PersistenceConflict, UnitOfWork, VersionConflict
from service.messaging.bus import ArchitectureViolation
from tests.infrastructure.repository_support import (NOW, CreateAccount, assert_account_missing, new_account,
                                                     persistence_bus)


@pytest.mark.asyncio
async def test_commit_read_and_owner_scope(work_factory: Callable[[], UnitOfWork]) -> None:
    account = new_account()
    diary = Diary(uuid4(), account.id, "Europe/Moscow")
    async with work_factory() as work:
        saved = await work.accounts.add(account, NOW)
        assert saved.roles == frozenset({"user"})
        await work.diaries.add(diary, NOW)
        await work.commit()
    async with work_factory() as work:
        assert await work.accounts.find(account.id) == saved
        assert await work.diaries.find_by_owner(account.id) == diary
        assert await work.diaries.find_by_owner(uuid4()) is None
        assert await work.accounts.find(uuid4()) is None


@pytest.mark.asyncio
@pytest.mark.parametrize("exit_mode", ["normal", "error", "cancel"])
async def test_rollback_without_commit(work_factory: Callable[[], UnitOfWork], exit_mode: str) -> None:
    account = new_account()
    try:
        async with work_factory() as work:
            await work.accounts.add(account, NOW)
            await work.diaries.add(Diary(uuid4(), account.id, "Europe/Moscow"), NOW)
            if exit_mode == "error":
                raise ValueError("operation failed")
            if exit_mode == "cancel":
                raise asyncio.CancelledError()
    except (ValueError, asyncio.CancelledError):
        pass
    async with work_factory() as work:
        assert await work.accounts.find(account.id) is None
        assert await work.diaries.find_by_owner(account.id) is None


@pytest.mark.asyncio
async def test_second_repository_failure_rolls_back_account(work_factory: Callable[[], UnitOfWork]) -> None:
    account = new_account()
    with pytest.raises(PersistenceConflict):
        async with work_factory() as work:
            await work.accounts.add(account, NOW)
            await work.diaries.add(Diary(uuid4(), uuid4(), "Europe/Moscow"), NOW)
            await work.commit()
    await assert_account_missing(work_factory, account.id)


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid_name", [None, "", "   ", "x" * 81])
async def test_failed_write_cannot_commit(
    work_factory: Callable[[], UnitOfWork], invalid_name: str | None,
) -> None:
    account = new_account()
    async with work_factory() as work:
        await work.accounts.add(account, NOW)
        with pytest.raises(PersistenceConflict):
            if invalid_name is None:
                await work.accounts.add(replace(account, id=uuid4()), NOW)
            else:
                await work.accounts.rename(account.id, invalid_name, 1, NOW)
        with pytest.raises(RuntimeError, match="rollback"):
            await work.commit()
    await assert_account_missing(work_factory, account.id)


@pytest.mark.asyncio
async def test_versions_and_transaction_lifetime(work_factory: Callable[[], UnitOfWork]) -> None:
    account = new_account()
    instance = work_factory()
    async with instance as work:
        accounts = work.accounts
        await accounts.add(account, NOW)
        updated = await accounts.rename(account.id, "New name", 1, NOW)
        assert updated.version == 2
        await work.commit()
        with pytest.raises(RuntimeError):
            await accounts.find(account.id)
    with pytest.raises(RuntimeError):
        async with instance:
            pass
    with pytest.raises(VersionConflict):
        async with work_factory() as work:
            await work.accounts.rename(account.id, "Lost update", 1, NOW)
    async with work_factory() as work:
        assert await work.accounts.find(account.id) == updated


@pytest.mark.asyncio
async def test_persistence_handler_uses_injected_work_and_real_bus(work_factory: Callable[[], UnitOfWork]) -> None:
    bus = persistence_bus(work_factory)
    message = CreateAccountDiary(new_account(), uuid4(), "Europe/Moscow", NOW)
    with pytest.raises(ArchitectureViolation, match="api -> infrastructure"):
        await bus.send(message)
    result = await bus.send(CreateAccount(message))
    assert result.account.id == message.account.id
    assert result.diary.id == message.diary_id
    with pytest.raises(PersistenceConflict):
        await bus.send(CreateAccount(message))
    # An independent root command succeeds after rollback; no leaked context or transaction.
    other = replace(message, account=new_account(), diary_id=uuid4())
    assert (await bus.send(CreateAccount(other))).diary.id == other.diary_id


@pytest.mark.integration
@pytest.mark.asyncio
async def test_concurrent_commands_and_optimistic_updates(sql_container: Container) -> None:
    bus = persistence_bus(sql_container.unit_of_work)
    messages = [CreateAccountDiary(new_account(), uuid4(), "Europe/Moscow", NOW) for _ in range(4)]
    try:
        results = await asyncio.gather(*(bus.send(CreateAccount(message)) for message in messages))
        assert {result.account.id for result in results} == {message.account.id for message in messages}

        async def rename(name: str) -> str:
            try:
                async with sql_container.unit_of_work() as work:
                    await work.accounts.rename(messages[0].account.id, name, 1, NOW)
                    await work.commit()
                    return "saved"
            except VersionConflict:
                return "conflict"

        assert sorted(await asyncio.gather(rename("First"), rename("Second"))) == ["conflict", "saved"]
        async with sql_container.unit_of_work() as work:
            updated = await work.accounts.find(messages[0].account.id)
            assert updated is not None and updated.version == 2
            for message in messages:
                assert await work.diaries.find_by_owner(message.account.id) is not None
    finally:
        engine = sql_container.database_engine()
        assert engine is not None
        await engine.dispose()
