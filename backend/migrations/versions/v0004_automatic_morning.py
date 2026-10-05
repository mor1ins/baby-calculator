"""Recover morning boundaries of previously closed nights without changing accounts."""
from alembic import op

revision = "0004_automatic_morning"  # pylint: disable=invalid-name
down_revision = "0003_target_move"  # pylint: disable=invalid-name
branch_labels = None  # pylint: disable=invalid-name
depends_on = None  # pylint: disable=invalid-name


def upgrade() -> None:
    # Historical split nights keep their earlier fragments: only the last sleep
    # of a cycle can establish its morning boundary.
    op.execute("""
        CREATE TEMP TABLE recovered_nights ON COMMIT DROP AS
        SELECT s.id,s.diary_id,s.day_id AS old_day,d.timezone,
               (s.end_at AT TIME ZONE d.timezone)::date AS morning
        FROM sleep_intervals s JOIN diary_days d ON d.id=s.day_id
        WHERE s.kind='night' AND s.end_at IS NOT NULL AND NOT s.ends_night AND s.deleted_at IS NULL
          AND (s.end_at AT TIME ZONE d.timezone)::date > d.date
          AND NOT EXISTS (SELECT 1 FROM sleep_intervals later WHERE later.day_id=s.day_id
              AND later.deleted_at IS NULL AND (later.start_at>s.start_at OR later.ends_night));
        UPDATE sleep_intervals s SET ends_night=true,version=version+1,updated_at=now()
            FROM recovered_nights n WHERE s.id=n.id;
        INSERT INTO diary_days(id,diary_id,date,timezone)
            SELECT gen_random_uuid(),diary_id,morning,timezone FROM recovered_nights
            ON CONFLICT (diary_id,date) DO NOTHING;
        CREATE TEMP TABLE morning_targets ON COMMIT DROP AS
            SELECT n.*,d.id AS new_day,t.id AS target_id
            FROM recovered_nights n JOIN diary_days d ON d.diary_id=n.diary_id AND d.date=n.morning
            LEFT JOIN interval_targets t ON t.left_sleep_id=n.id AND t.kind='awake' AND t.retired_at IS NULL;
        CREATE TEMP TABLE morning_comments ON COMMIT DROP AS
            SELECT c.id,c.target_id,m.new_day FROM interval_comments c
            JOIN morning_targets m ON m.target_id=c.target_id;
        UPDATE interval_comments c SET target_id=NULL,day_id=m.new_day,version=version+1,updated_at=now()
            FROM morning_comments m WHERE c.id=m.id;
        UPDATE interval_targets t SET day_id=m.new_day FROM morning_targets m WHERE t.id=m.target_id;
        UPDATE interval_comments c SET target_id=m.target_id FROM morning_comments m WHERE c.id=m.id;
        INSERT INTO interval_targets(id,diary_id,day_id,kind,left_sleep_id,right_sleep_id)
            SELECT gen_random_uuid(),m.diary_id,m.new_day,'awake',m.id,r.id
            FROM morning_targets m JOIN sleep_intervals s ON s.id=m.id
            LEFT JOIN LATERAL (SELECT id,day_id,start_at FROM sleep_intervals other
                WHERE other.diary_id=m.diary_id AND other.deleted_at IS NULL AND other.start_at>=s.end_at
                ORDER BY other.start_at,other.id LIMIT 1) r ON true
            WHERE m.target_id IS NULL AND (r.id IS NULL OR (r.day_id=m.new_day AND r.start_at>s.end_at));
        UPDATE diary_days SET version=version+1,updated_at=now()
            WHERE id IN (SELECT old_day FROM morning_targets UNION SELECT new_day FROM morning_targets);
    """)


def downgrade() -> None:
    # A confirmed morning is valid in the old schema too; never undo user data.
    pass
