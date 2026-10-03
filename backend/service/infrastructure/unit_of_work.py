from collections.abc import Callable
from types import TracebackType

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from service.contracts.repositories import AccountsRepository, DiariesRepository, PersistenceConflict
from service.infrastructure.repositories.transaction import Transaction


class SqlUnitOfWork:
    def __init__(
        self, session_factory: Callable[[], AsyncSession],
        transaction_factory: Callable[[AsyncSession], Transaction],
        accounts_factory: Callable[[Transaction], AccountsRepository],
        diaries_factory: Callable[[Transaction], DiariesRepository],
    ) -> None:
        self._session_factory = session_factory
        self._transaction_factory = transaction_factory
        self._accounts_factory = accounts_factory
        self._diaries_factory = diaries_factory
        self._transaction: Transaction | None = None
        self._accounts: AccountsRepository | None = None
        self._diaries: DiariesRepository | None = None

    def _scope(self) -> Transaction:
        if self._transaction is None:
            raise RuntimeError("Unit of Work has not started")
        self._transaction.require_active()
        return self._transaction

    @property
    def accounts(self) -> AccountsRepository:
        self._scope()
        assert self._accounts is not None
        return self._accounts

    @property
    def diaries(self) -> DiariesRepository:
        self._scope()
        assert self._diaries is not None
        return self._diaries

    async def __aenter__(self) -> "SqlUnitOfWork":
        if self._transaction is not None:
            raise RuntimeError("Unit of Work instances are single-use")
        session = self._session_factory()
        self._transaction = self._transaction_factory(session)
        try:
            await session.begin()
            self._transaction.active = True
            self._accounts = self._accounts_factory(self._transaction)
            self._diaries = self._diaries_factory(self._transaction)
        except BaseException:
            self._transaction.active = False
            await session.close()
            raise
        return self

    async def commit(self) -> None:
        transaction = self._scope()
        try:
            await transaction.session.commit()
        except IntegrityError as exc:
            raise PersistenceConflict("Database constraint conflict") from exc
        finally:
            transaction.active = False

    async def __aexit__(
        self, exc_type: type[BaseException] | None, exc: BaseException | None, traceback: TracebackType | None,
    ) -> None:
        assert self._transaction is not None
        self._transaction.active = False
        try:
            await self._transaction.session.rollback()
        finally:
            await self._transaction.session.close()
