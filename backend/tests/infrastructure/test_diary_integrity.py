from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import Connection, create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from tests.infrastructure.test_migrations import diary, execute, sleep

pytestmark = pytest.mark.integration


def test_settling_cannot_reference_another_diary(database: Connection) -> None:
    owner, other = diary(database), diary(database)
    sleep_id = sleep(database, owner, "10:00", "11:00")
    statement = """INSERT INTO settling_attempts(id,diary_id,day,start_at,end_at,sleep_id)
        VALUES (:id,:diary,'2026-10-03','2026-10-03 09:50+03','2026-10-03 10:00+03',:sleep)"""
    execute(database, statement, id=uuid4(), diary=owner[0], sleep=sleep_id)
    with pytest.raises(IntegrityError), database.begin_nested():
        execute(database, statement, id=uuid4(), diary=other[0], sleep=sleep_id)
    execute(database, statement, id=uuid4(), diary=other[0], sleep=None)


def test_feature_migration_preserves_existing_data(database_url: str, migration_config: Config) -> None:
    command.upgrade(migration_config, "0005_design_features")
    engine = create_engine(database_url)
    attempt_id = uuid4()
    try:
        with engine.begin() as connection:
            owner = diary(connection)
            sleep_id = sleep(connection, owner, "10:00", "11:00")
            execute(connection, """INSERT INTO settling_attempts(id,diary_id,day,start_at,end_at,sleep_id)
                VALUES (:id,:diary,'2026-10-03','2026-10-03 09:50+03','2026-10-03 10:00+03',:sleep)""",
                    id=attempt_id, diary=owner[0], sleep=sleep_id)
        for revision in ("head", "0005_design_features", "head"):
            if revision == "head":
                command.upgrade(migration_config, revision)
            else:
                command.downgrade(migration_config, revision)
            with engine.connect() as connection:
                assert connection.scalar(text("SELECT sleep_id FROM settling_attempts WHERE id=:id"),
                                         {"id": attempt_id}) == sleep_id
            constraints = inspect(engine).get_foreign_keys("settling_attempts")
            sleep_key = next(key for key in constraints if key["referred_table"] == "sleep_intervals")
            assert sleep_key["constrained_columns"] == (
                ["diary_id", "sleep_id"] if revision == "head" else ["sleep_id"])
    finally:
        engine.dispose()
