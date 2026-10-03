"""Manual database provisioning; there is deliberately no public admin registration API."""
import argparse
import getpass
import os
import sys
from uuid import uuid4

import psycopg
from argon2 import PasswordHasher
from email_validator import validate_email


def main() -> None:
    parser = argparse.ArgumentParser(description="Create an admin directly in PostgreSQL")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="Администратор")
    parser.add_argument("--password-stdin", action="store_true",
                        help="Read password from stdin for automated local tests")
    args = parser.parse_args()
    email = validate_email(args.email, check_deliverability=False).normalized.lower()
    password = sys.stdin.readline().rstrip("\n") if args.password_stdin else getpass.getpass("Пароль admin: ")
    if not 8 <= len(password) <= 128:
        raise SystemExit("Пароль должен содержать 8–128 символов")
    dsn = os.environ["BABY_DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://", 1)
    with psycopg.connect(dsn) as connection:
        user_id = uuid4()
        connection.execute(
            "INSERT INTO users(id,email,name,password_hash) VALUES (%s,%s,%s,%s)",
            (user_id, email, args.name, PasswordHasher().hash(password)),
        )
        connection.execute("INSERT INTO user_roles(user_id,role_code) VALUES (%s,'admin')", (user_id,))
    print(f"Admin создан: {email}. Роль user не назначена.")


if __name__ == "__main__":
    main()
