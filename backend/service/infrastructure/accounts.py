from service.contracts.persistence import AccountDiary, CreateAccountDiary
from service.contracts.repositories import Diary, UnitOfWork


class CreateAccountDiaryHandler:
    def __init__(self, unit_of_work: UnitOfWork) -> None:
        self._unit_of_work = unit_of_work

    async def handle(self, message: CreateAccountDiary) -> AccountDiary:
        async with self._unit_of_work as work:
            account = await work.accounts.add(message.account, message.now)
            diary = await work.diaries.add(Diary(message.diary_id, account.id, message.timezone), message.now)
            result = AccountDiary(account, diary)
            await work.commit()
            return result
