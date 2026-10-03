from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="BABY_", frozen=True, hide_input_in_errors=True)

    environment: Literal["local", "dev", "prod", "test"] = "local"

    public_origin: str = "http://localhost:8080"

    database_url: SecretStr | None = None
    database_timeout: float = Field(default=2.0, ge=0.1, le=30)

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None:
            try:
                url = make_url(value.get_secret_value())
            except ArgumentError as exc:
                raise ValueError("Invalid database URL") from exc
            if url.drivername != "postgresql+psycopg" or not url.database:
                raise ValueError("Expected postgresql+psycopg URL with database name")
        return value
