"""Allow atomic moves of sleep and target composite references between diary days."""
from alembic import op

revision = "0003_target_move"  # pylint: disable=invalid-name
down_revision = "0002_auth_limits"  # pylint: disable=invalid-name
branch_labels = None  # pylint: disable=invalid-name
depends_on = None  # pylint: disable=invalid-name


def upgrade() -> None:
    op.execute("""ALTER TABLE interval_targets ALTER CONSTRAINT
        interval_targets_diary_id_day_id_sleep_id_fkey DEFERRABLE INITIALLY DEFERRED""")


def downgrade() -> None:
    op.execute("""ALTER TABLE interval_targets ALTER CONSTRAINT
        interval_targets_diary_id_day_id_sleep_id_fkey NOT DEFERRABLE""")
