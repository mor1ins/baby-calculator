"""Initial diary schema. SQL is frozen with this revision, independent of runtime models."""
from pathlib import Path

from alembic import op

revision = "0001_initial"  # pylint: disable=invalid-name  # Alembic revision metadata
down_revision = None  # pylint: disable=invalid-name  # Alembic revision metadata
branch_labels = None  # pylint: disable=invalid-name  # Alembic revision metadata
depends_on = None  # pylint: disable=invalid-name  # Alembic revision metadata


def upgrade() -> None:
    op.execute(Path(__file__).with_suffix(".sql").read_text(encoding="utf-8"))


def downgrade() -> None:
    op.drop_constraint("fk_diaries_default_schedule", "diaries", type_="foreignkey")
    for table in (
        "interval_comments", "interval_targets", "sleep_events", "sleep_intervals", "diary_days",
        "schedule_segments", "schedule_templates", "diaries", "admin_audit_log", "sessions", "user_roles",
        "roles", "users",
    ):
        op.drop_table(table)
    # btree_gist can be shared with other schemas; never drop it during rollback.
