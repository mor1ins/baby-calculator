"""Provision accounts while public registration is disabled; run only on the server."""
import argparse
import getpass
import os
import sys
from typing import Literal
from uuid import uuid4
from zoneinfo import ZoneInfo

import psycopg
from argon2 import PasswordHasher
from email_validator import validate_email


def create_account(email: str, name: str, password: str, timezone: str, role: Literal["user", "admin"]) -> str:
    email = validate_email(email.strip(), check_deliverability=False).normalized.lower()
    name = name.strip()
    if not 1 <= len(name) <= 80:
        raise ValueError("Имя должно содержать 1–80 символов")
    if not 8 <= len(password) <= 128:
        raise ValueError("Пароль должен содержать 8–128 символов")
    ZoneInfo(timezone)
    dsn = os.environ["BABY_DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://", 1)
    with psycopg.connect(dsn) as connection:
        user_id = uuid4()
        connection.execute(
            "INSERT INTO users(id,email,name,password_hash) VALUES (%s,%s,%s,%s)",
            (user_id, email, name, PasswordHasher().hash(password)),
        )
        connection.execute("INSERT INTO user_roles(user_id,role_code) VALUES (%s,%s)", (user_id, role))
        if role == "user":
            connection.execute("INSERT INTO diaries(id,user_id,timezone) VALUES (%s,%s,%s)",
                               (uuid4(), user_id, timezone))
    return email


def main(role: Literal["user", "admin"] = "user") -> None:
    parser = argparse.ArgumentParser(description="Create an account directly in PostgreSQL")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=role == "user", default="Администратор")
    parser.add_argument("--timezone", default="Europe/Moscow")
    parser.add_argument("--password-stdin", action="store_true", help="Read password from stdin instead of prompting")
    args = parser.parse_args()
    password = sys.stdin.readline().rstrip("\n") if args.password_stdin else getpass.getpass("Пароль: ")
    try:
        email = create_account(args.email, args.name, password, args.timezone, role)
    except psycopg.errors.UniqueViolation:
        parser.exit(1, "Пользователь с таким email уже существует. Данные не изменены.\n")
    except (ValueError, KeyError) as error:
        parser.exit(1, f"Некорректные параметры: {error}\n")
    else:
        print(f"Создан {role}: {email}.")


if __name__ == "__main__":
    main()
