from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import Connection, create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from service.bootstrap import create_app
from service.infrastructure.database import SCHEMA_REVISION

pytestmark = pytest.mark.integration


def execute(connection: Connection, statement: str, **values: object) -> None:
    connection.execute(text(statement), values)


def diary(connection: Connection) -> tuple[UUID, UUID]:
    owner, diary_id, day_id = uuid4(), uuid4(), uuid4()
    execute(connection, "INSERT INTO users(id,email,name,password_hash) VALUES (:id,:email,'Test','hash')",
            id=owner, email=f"{owner}@example.com")
    execute(connection, "INSERT INTO diaries(id,user_id,timezone) VALUES (:id,:owner,'Europe/Moscow')",
            id=diary_id, owner=owner)
    execute(connection, """INSERT INTO diary_days(id,diary_id,date,timezone)
        VALUES (:id,:diary,'2026-10-03','Europe/Moscow')""",
            id=day_id, diary=diary_id)
    return diary_id, day_id


def sleep(connection: Connection, owner: tuple[UUID, UUID], start: str, end: str | None) -> UUID:
    sleep_id = uuid4()
    execute(connection, """INSERT INTO sleep_intervals(id,diary_id,day_id,kind,start_at,end_at)
        VALUES (:id,:diary,:day,'night',:start,:end)""",
            id=sleep_id, diary=owner[0], day=owner[1], start=f"2026-10-03 {start}+03",
            end=f"2026-10-03 {end}+03" if end else None)
    return sleep_id


def test_migration_roundtrip_and_readiness(database_url: str, migration_config: Config) -> None:
    engine = create_engine(database_url)
    try:
        with TestClient(create_app()) as client:
            assert client.get("/health").status_code == 200
            assert client.get("/ready").status_code == 503
            command.upgrade(migration_config, "head")
            command.upgrade(migration_config, "head")
            assert client.get("/ready").status_code == 200
            assert ScriptDirectory.from_config(migration_config).get_current_head() == SCHEMA_REVISION
            with engine.connect() as connection:
                assert connection.scalars(text("SELECT code FROM roles ORDER BY code")).all() == ["admin", "user"]
                assert connection.scalar(text("SELECT count(*) FROM users")) == 0
                assert len(inspect(connection).get_table_names()) == 15
            with engine.begin() as connection:
                execute(connection, "UPDATE alembic_version SET version_num='unknown_revision'")
            assert client.get("/ready").status_code == 503
            with engine.begin() as connection:
                execute(connection, "UPDATE alembic_version SET version_num=:revision", revision=SCHEMA_REVISION)
            command.downgrade(migration_config, "base")
            assert client.get("/ready").status_code == 503
            assert inspect(engine).get_table_names() == ["alembic_version"]
            command.upgrade(migration_config, "head")
            assert client.get("/ready").status_code == 200
    finally:
        engine.dispose()


@pytest.mark.parametrize("start,end", [("10:30", "11:30"), ("10:00", "10:00"), ("10:00", "09:00")])
def test_sleep_constraints(database: Connection, start: str, end: str) -> None:
    owner = diary(database)
    sleep(database, owner, "10:00", "11:00")
    with pytest.raises(IntegrityError), database.begin_nested():
        sleep(database, owner, start, end)
    sleep(database, owner, "11:00", "12:00")  # touching boundaries are allowed
    sleep(database, diary(database), "10:00", "11:00")  # different diary is independent


def test_open_sleep_and_soft_deletion(database: Connection) -> None:
    owner = diary(database)
    original = sleep(database, owner, "10:00", None)
    with pytest.raises(IntegrityError), database.begin_nested():
        sleep(database, owner, "12:00", None)
    execute(database, "UPDATE sleep_intervals SET deleted_at=now() WHERE id=:id", id=original)
    sleep(database, owner, "10:00", None)


def test_foreign_diary_references_and_default(database: Connection) -> None:
    owner, other = diary(database), diary(database)
    template = uuid4()
    execute(database, "INSERT INTO schedule_templates(id,diary_id,name) VALUES (:id,:diary,'Normal')",
            id=template, diary=owner[0])
    execute(database, "UPDATE diaries SET default_schedule_id=:template WHERE id=:id", template=template, id=owner[0])
    with pytest.raises(IntegrityError), database.begin_nested():
        execute(database, "UPDATE diaries SET default_schedule_id=:template WHERE id=:id",
                template=template, id=other[0])
    with pytest.raises(IntegrityError), database.begin_nested():
        sleep(database, (owner[0], other[1]), "10:00", "11:00")


def test_comments_orphans_and_event_tombstones(database: Connection) -> None:
    owner = diary(database)
    sleep_id = sleep(database, owner, "10:00", "11:00")
    target, comment, event = uuid4(), uuid4(), uuid4()
    execute(database, """INSERT INTO interval_targets(id,diary_id,day_id,kind,sleep_id)
        VALUES (:id,:diary,:day,'sleep',:sleep)""", id=target, diary=owner[0], day=owner[1], sleep=sleep_id)
    insert_comment = ("INSERT INTO interval_comments(id,diary_id,day_id,target_id,text) "
                      "VALUES (:id,:diary,:day,:target,'Note')")
    execute(database, insert_comment, id=comment, diary=owner[0], day=owner[1], target=target)
    with pytest.raises(IntegrityError), database.begin_nested():
        execute(database, insert_comment, id=uuid4(), diary=owner[0], day=owner[1], target=target)
    execute(database, "UPDATE interval_comments SET target_id=NULL WHERE id=:id", id=comment)
    execute(database, insert_comment, id=uuid4(), diary=owner[0], day=owner[1], target=None)
    insert_event = "INSERT INTO sleep_events(id,diary_id,sleep_id,deleted_at) VALUES (:id,:diary,:sleep,now())"
    execute(database, insert_event, id=event, diary=owner[0], sleep=sleep_id)
    with pytest.raises(IntegrityError), database.begin_nested():
        execute(database, insert_event, id=event, diary=owner[0], sleep=sleep_id)
    with pytest.raises(IntegrityError), database.begin_nested():
        execute(database, "DELETE FROM sleep_intervals WHERE id=:id", id=sleep_id)


def test_snapshot_and_night_end_constraints(database: Connection) -> None:
    owner = diary(database)
    first = sleep(database, owner, "01:00", "02:00")
    second = sleep(database, owner, "03:00", "04:00")
    execute(database, "UPDATE sleep_intervals SET ends_night=true WHERE id=:id", id=second)
    with pytest.raises(IntegrityError), database.begin_nested():
        execute(database, "UPDATE sleep_intervals SET ends_night=true WHERE id=:id", id=first)
    with pytest.raises(IntegrityError), database.begin_nested():
        execute(database, "UPDATE sleep_intervals SET kind='nap' WHERE id=:id", id=second)
    with pytest.raises(IntegrityError), database.begin_nested():
        execute(database, "UPDATE diary_days SET schedule_snapshot='{}'::jsonb WHERE id=:id", id=owner[1])
    execute(database, "UPDATE diary_days SET schedule_initialized=true, schedule_snapshot='{}'::jsonb WHERE id=:id",
            id=owner[1])
    with pytest.raises(IntegrityError), database.begin_nested():
        execute(database, "UPDATE diary_days SET schedule_snapshot='[]'::jsonb WHERE id=:id", id=owner[1])


def test_readiness_database_unreachable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BABY_DATABASE_URL", "postgresql+psycopg://unused:private-value@127.0.0.1:1/unused")
    with TestClient(create_app()) as client:
        response = client.get("/ready")
        assert response.status_code == 503
        assert response.json()["code"] == "unavailable"
        assert "private-value" not in response.text
        assert client.get("/health").status_code == 200
