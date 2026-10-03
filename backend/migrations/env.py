from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

from service.settings import Settings


def run_migrations() -> None:
    settings = Settings()
    if settings.database_url is None:
        raise RuntimeError("BABY_DATABASE_URL is required for migrations")
    url = settings.database_url.get_secret_value()
    if context.is_offline_mode():
        context.configure(url=url, literal_binds=True)
        with context.begin_transaction():
            context.run_migrations()
        return
    engine = create_engine(url, poolclass=NullPool, hide_parameters=True, connect_args={"connect_timeout": 5})
    try:
        with engine.connect() as connection:
            context.configure(connection=connection)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


run_migrations()
