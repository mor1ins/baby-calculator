CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
    id uuid PRIMARY KEY,
    email varchar(254) NOT NULL UNIQUE,
    name varchar(80) NOT NULL CHECK (length(btrim(name)) > 0),
    password_hash text NOT NULL,
    blocked boolean NOT NULL DEFAULT false,
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_users_normalized_email CHECK (email = lower(btrim(email)) AND length(email) > 0)
);
CREATE TABLE roles (
    code text PRIMARY KEY CHECK (length(btrim(code)) > 0)
);
INSERT INTO roles (code) VALUES ('user'), ('admin');
CREATE TABLE user_roles (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    role_code text NOT NULL REFERENCES roles(code) ON DELETE RESTRICT,
    PRIMARY KEY (user_id, role_code)
);
CREATE INDEX ix_user_roles_role ON user_roles(role_code);
CREATE TABLE sessions (
    id uuid PRIMARY KEY,
    user_id uuid REFERENCES users(id) ON DELETE RESTRICT,
    token_hash bytea NOT NULL UNIQUE,
    csrf_nonce bytea NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_sessions_expiry CHECK (expires_at > created_at)
);
CREATE INDEX ix_sessions_user ON sessions(user_id);
CREATE INDEX ix_sessions_expiry ON sessions(expires_at);
CREATE TABLE admin_audit_log (
    id uuid PRIMARY KEY,
    actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action text NOT NULL CHECK (action IN ('block', 'unblock')),
    reason varchar(500) NOT NULL CHECK (length(btrim(reason)) > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_target_time ON admin_audit_log(target_user_id, created_at);
CREATE INDEX ix_audit_actor ON admin_audit_log(actor_user_id);
CREATE TABLE diaries (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
    timezone text NOT NULL CHECK (length(timezone) > 0),
    default_schedule_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE schedule_templates (
    id uuid PRIMARY KEY,
    diary_id uuid NOT NULL REFERENCES diaries(id) ON DELETE RESTRICT,
    name varchar(80) NOT NULL CHECK (length(btrim(name)) > 0),
    archived boolean NOT NULL DEFAULT false,
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (diary_id, id)
);
ALTER TABLE diaries ADD CONSTRAINT fk_diaries_default_schedule
    FOREIGN KEY (id, default_schedule_id) REFERENCES schedule_templates(diary_id, id) ON DELETE RESTRICT;
CREATE INDEX ix_diaries_default_schedule ON diaries(default_schedule_id);
CREATE TABLE schedule_segments (
    schedule_id uuid NOT NULL REFERENCES schedule_templates(id) ON DELETE RESTRICT,
    position integer NOT NULL CHECK (position >= 0),
    kind text NOT NULL CHECK (kind IN ('awake', 'nap', 'night')),
    duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
    PRIMARY KEY (schedule_id, position)
);
CREATE TABLE diary_days (
    id uuid PRIMARY KEY,
    diary_id uuid NOT NULL REFERENCES diaries(id) ON DELETE RESTRICT,
    date date NOT NULL,
    timezone text NOT NULL CHECK (length(timezone) > 0),
    schedule_initialized boolean NOT NULL DEFAULT false,
    schedule_snapshot jsonb,
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (diary_id, date),
    UNIQUE (diary_id, id),
    CONSTRAINT ck_days_snapshot_type CHECK (schedule_snapshot IS NULL OR jsonb_typeof(schedule_snapshot) = 'object'),
    CONSTRAINT ck_days_snapshot_initialized CHECK (schedule_initialized OR schedule_snapshot IS NULL)
);
CREATE TABLE sleep_intervals (
    id uuid PRIMARY KEY,
    diary_id uuid NOT NULL REFERENCES diaries(id) ON DELETE RESTRICT,
    day_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('nap', 'night')),
    start_at timestamptz NOT NULL,
    end_at timestamptz,
    ends_night boolean NOT NULL DEFAULT false,
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    UNIQUE (diary_id, id),
    UNIQUE (diary_id, day_id, id),
    FOREIGN KEY (diary_id, day_id) REFERENCES diary_days(diary_id, id) ON DELETE RESTRICT,
    CONSTRAINT ck_sleep_duration CHECK (end_at IS NULL OR end_at > start_at),
    CONSTRAINT ck_sleep_ends_night CHECK (NOT ends_night OR (kind = 'night' AND end_at IS NOT NULL)),
    CONSTRAINT ex_sleep_overlap EXCLUDE USING gist (
        diary_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&
    ) WHERE (deleted_at IS NULL)
);
CREATE UNIQUE INDEX uq_sleep_open ON sleep_intervals(diary_id) WHERE end_at IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_sleep_night_end ON sleep_intervals(day_id) WHERE ends_night AND deleted_at IS NULL;
CREATE INDEX ix_sleep_start ON sleep_intervals(diary_id, start_at) WHERE deleted_at IS NULL;
CREATE TABLE sleep_events (
    id uuid PRIMARY KEY,
    diary_id uuid NOT NULL,
    sleep_id uuid NOT NULL,
    occurred_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    FOREIGN KEY (diary_id, sleep_id) REFERENCES sleep_intervals(diary_id, id) ON DELETE RESTRICT,
    CONSTRAINT ck_events_timestamp CHECK (occurred_at IS NOT NULL OR deleted_at IS NOT NULL)
);
CREATE INDEX ix_events_sleep ON sleep_events(diary_id, sleep_id);
CREATE INDEX ix_events_active ON sleep_events(sleep_id, occurred_at, id) WHERE deleted_at IS NULL;
CREATE TABLE interval_targets (
    id uuid PRIMARY KEY,
    diary_id uuid NOT NULL,
    day_id uuid NOT NULL,
    kind text NOT NULL CHECK (kind IN ('sleep', 'awake')),
    sleep_id uuid,
    left_sleep_id uuid,
    right_sleep_id uuid,
    retired_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (diary_id, id),
    UNIQUE (diary_id, day_id, id),
    FOREIGN KEY (diary_id, day_id) REFERENCES diary_days(diary_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (diary_id, day_id, sleep_id) REFERENCES sleep_intervals(diary_id, day_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (diary_id, left_sleep_id) REFERENCES sleep_intervals(diary_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (diary_id, right_sleep_id) REFERENCES sleep_intervals(diary_id, id) ON DELETE RESTRICT,
    CONSTRAINT ck_targets_shape CHECK (
        (kind = 'sleep' AND sleep_id IS NOT NULL AND left_sleep_id IS NULL AND right_sleep_id IS NULL)
        OR (kind = 'awake' AND sleep_id IS NULL AND left_sleep_id IS NOT NULL)
    ),
    CONSTRAINT ck_targets_neighbors CHECK (left_sleep_id IS NULL OR right_sleep_id IS NULL
        OR left_sleep_id <> right_sleep_id)
);
CREATE UNIQUE INDEX uq_targets_sleep ON interval_targets(diary_id, sleep_id)
    WHERE kind = 'sleep' AND retired_at IS NULL;
CREATE UNIQUE INDEX uq_targets_awake ON interval_targets(diary_id, left_sleep_id)
    WHERE kind = 'awake' AND retired_at IS NULL;
CREATE INDEX ix_targets_sleep ON interval_targets(diary_id, day_id, sleep_id);
CREATE INDEX ix_targets_left ON interval_targets(diary_id, left_sleep_id);
CREATE INDEX ix_targets_right ON interval_targets(diary_id, right_sleep_id);
CREATE TABLE interval_comments (
    id uuid PRIMARY KEY,
    diary_id uuid NOT NULL,
    day_id uuid NOT NULL,
    target_id uuid UNIQUE,
    text varchar(1000) NOT NULL CHECK (length(btrim(text)) > 0),
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (diary_id, day_id) REFERENCES diary_days(diary_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (diary_id, day_id, target_id) REFERENCES interval_targets(diary_id, day_id, id) ON DELETE RESTRICT
);
CREATE INDEX ix_comments_day ON interval_comments(diary_id, day_id);
