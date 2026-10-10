"""Persist child profile, settling attempts, day context and public snapshots."""
from alembic import op

revision = "0005_design_features"  # pylint: disable=invalid-name
down_revision = "0004_automatic_morning"  # pylint: disable=invalid-name
branch_labels = None  # pylint: disable=invalid-name
depends_on = None  # pylint: disable=invalid-name


def upgrade() -> None:
    op.execute("""
        ALTER TABLE schedule_templates ADD COLUMN description varchar(500) NOT NULL DEFAULT '';
        ALTER TABLE diaries ADD COLUMN child jsonb NOT NULL DEFAULT '{}';
        ALTER TABLE diaries ADD COLUMN child_version integer NOT NULL DEFAULT 0;
        ALTER TABLE diary_days ADD COLUMN context jsonb NOT NULL DEFAULT '{}';
        CREATE TABLE settling_attempts (
            id uuid PRIMARY KEY, diary_id uuid NOT NULL REFERENCES diaries(id),
            day date NOT NULL, start_at timestamptz NOT NULL, end_at timestamptz,
            sleep_id uuid REFERENCES sleep_intervals(id), version integer NOT NULL DEFAULT 1,
            CHECK (end_at IS NULL OR end_at >= start_at)
        );
        CREATE UNIQUE INDEX one_active_settling ON settling_attempts(diary_id) WHERE end_at IS NULL;
        CREATE TABLE routine_changes (
            id uuid PRIMARY KEY, diary_id uuid NOT NULL REFERENCES diaries(id),
            date date NOT NULL, text varchar(500) NOT NULL, version integer NOT NULL DEFAULT 1
        );
        CREATE TABLE report_shares (
            id uuid PRIMARY KEY, diary_id uuid NOT NULL REFERENCES diaries(id),
            token_hash bytea NOT NULL UNIQUE, snapshot jsonb NOT NULL,
            created_at timestamptz NOT NULL, revoked_at timestamptz
        );
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE schedule_templates DROP COLUMN description;
        DROP TABLE report_shares, routine_changes, settling_attempts;
        ALTER TABLE diary_days DROP COLUMN context;
        ALTER TABLE diaries DROP COLUMN child, DROP COLUMN child_version;
    """)
