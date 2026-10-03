"""Atomic login/registration rate limits shared between application workers."""
from alembic import op

revision = "0002_auth_limits"  # pylint: disable=invalid-name
down_revision = "0001_initial"  # pylint: disable=invalid-name
branch_labels = None  # pylint: disable=invalid-name
depends_on = None  # pylint: disable=invalid-name


def upgrade() -> None:
    op.execute("""CREATE TABLE auth_limits (
        key text PRIMARY KEY, window_start timestamptz NOT NULL, attempts integer NOT NULL CHECK (attempts > 0)
    )""")


def downgrade() -> None:
    op.drop_table("auth_limits")
