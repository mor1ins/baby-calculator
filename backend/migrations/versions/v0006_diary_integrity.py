"""Enforce settling ownership and index diary-scoped feature queries."""
from alembic import op

revision = "0006_diary_integrity"  # pylint: disable=invalid-name
down_revision = "0005_design_features"  # pylint: disable=invalid-name
branch_labels = None  # pylint: disable=invalid-name
depends_on = None  # pylint: disable=invalid-name


def upgrade() -> None:
    op.execute("""
        ALTER TABLE settling_attempts DROP CONSTRAINT settling_attempts_sleep_id_fkey;
        ALTER TABLE settling_attempts ADD CONSTRAINT fk_settling_diary_sleep
            FOREIGN KEY (diary_id, sleep_id) REFERENCES sleep_intervals(diary_id, id);
        CREATE INDEX ix_settling_diary_day ON settling_attempts(diary_id, day, start_at);
        CREATE INDEX ix_settling_sleep ON settling_attempts(sleep_id);
        CREATE INDEX ix_changes_diary_date ON routine_changes(diary_id, date, id);
        CREATE INDEX ix_shares_diary_created ON report_shares(diary_id, created_at DESC);
    """)


def downgrade() -> None:
    op.execute("""
        DROP INDEX ix_shares_diary_created, ix_changes_diary_date, ix_settling_sleep, ix_settling_diary_day;
        ALTER TABLE settling_attempts DROP CONSTRAINT fk_settling_diary_sleep;
        ALTER TABLE settling_attempts ADD CONSTRAINT settling_attempts_sleep_id_fkey
            FOREIGN KEY (sleep_id) REFERENCES sleep_intervals(id);
    """)
