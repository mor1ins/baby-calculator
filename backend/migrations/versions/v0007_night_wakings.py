"""Track bounded night wakings separately from sleep."""
from alembic import op

revision = "0007_night_wakings"  # pylint: disable=invalid-name
down_revision = "0006_diary_integrity"  # pylint: disable=invalid-name
branch_labels = None  # pylint: disable=invalid-name
depends_on = None  # pylint: disable=invalid-name


def upgrade() -> None:
    op.execute("""
        CREATE TABLE night_wakings (
            id uuid PRIMARY KEY,
            diary_id uuid NOT NULL REFERENCES diaries(id),
            sleep_id uuid NOT NULL,
            start_at timestamptz NOT NULL,
            end_at timestamptz,
            version integer NOT NULL DEFAULT 1 CHECK (version > 0),
            CONSTRAINT fk_waking_diary_sleep FOREIGN KEY (diary_id, sleep_id)
                REFERENCES sleep_intervals(diary_id, id),
            CONSTRAINT ck_waking_bounds CHECK (end_at IS NULL OR end_at > start_at),
            CONSTRAINT ex_waking_overlap EXCLUDE USING gist
                (diary_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
        );
        CREATE INDEX ix_waking_sleep ON night_wakings(sleep_id, start_at);
    """)


def downgrade() -> None:
    op.drop_table("night_wakings")
