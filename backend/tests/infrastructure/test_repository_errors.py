from collections.abc import Callable
from dataclasses import replace
from uuid import uuid4

import pytest

from service.contracts.repositories import Diary, PersistenceConflict, UnitOfWork, VersionConflict
from tests.infrastructure.repository_support import NOW, assert_account_missing, new_account


@pytest.mark.asyncio
@pytest.mark.parametrize("field,value", [
    ("name", ""), ("name", "   "), ("name", "x" * 81),
    ("email", ""), ("email", "UPPER@example.com"), ("email", " padded@example.com "),
    ("email", "x" * 255),
])
async def test_invalid_account_rolls_back(
    work_factory: Callable[[], UnitOfWork], field: str, value: str,
) -> None:
    original = new_account()
    account = replace(original, name=value) if field == "name" else replace(original, email=value)
    with pytest.raises(PersistenceConflict):
        async with work_factory() as work:
            await work.accounts.add(account, NOW)
            await work.commit()
    await assert_account_missing(work_factory, account.id)


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid", ["timezone", "default", "owner_duplicate", "id_duplicate"])
async def test_invalid_diary_does_not_leave_user(work_factory: Callable[[], UnitOfWork], invalid: str) -> None:
    existing, account = new_account(), new_account()
    existing_diary = Diary(uuid4(), existing.id, "Europe/Moscow")
    async with work_factory() as work:
        await work.accounts.add(existing, NOW)
        await work.diaries.add(existing_diary, NOW)
        await work.commit()
    variants = {
        "timezone": Diary(uuid4(), account.id, ""),
        "default": Diary(uuid4(), account.id, "Europe/Moscow", uuid4()),
        "owner_duplicate": Diary(uuid4(), existing.id, "Europe/Moscow"),
        "id_duplicate": Diary(existing_diary.id, account.id, "Europe/Moscow"),
    }
    with pytest.raises(PersistenceConflict):
        async with work_factory() as work:
            await work.accounts.add(account, NOW)
            await work.diaries.add(variants[invalid], NOW)
            await work.commit()
    async with work_factory() as work:
        assert await work.accounts.find(account.id) is None
        assert await work.diaries.find_by_owner(existing.id) == existing_diary


@pytest.mark.asyncio
async def test_missing_account_version_conflict_poisoned_scope(work_factory: Callable[[], UnitOfWork]) -> None:
    account = new_account()
    async with work_factory() as work:
        await work.accounts.add(account, NOW)
        with pytest.raises(VersionConflict):
            await work.accounts.rename(uuid4(), "Not found", 1, NOW)
        with pytest.raises(RuntimeError):
            await work.commit()
    await assert_account_missing(work_factory, account.id)


@pytest.mark.asyncio
async def test_scope_lifecycle_is_explicit(work_factory: Callable[[], UnitOfWork]) -> None:
    instance = work_factory()
    with pytest.raises(RuntimeError):
        _ = instance.accounts
    with pytest.raises(RuntimeError):
        await instance.commit()
    async with instance as work:
        accounts = work.accounts
    with pytest.raises(RuntimeError):
        await accounts.find(uuid4())
    with pytest.raises(RuntimeError):
        await instance.commit()
