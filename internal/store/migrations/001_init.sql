-- Contact form submissions and the admin login.

CREATE TABLE contact_messages (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name        TEXT        NOT NULL,
    email       TEXT        NOT NULL,
    message     TEXT        NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'new'
                CHECK (status IN ('new', 'read', 'replied', 'archived')),
    note        TEXT        NOT NULL DEFAULT '',
    client_ip   TEXT        NOT NULL DEFAULT '',
    user_agent  TEXT        NOT NULL DEFAULT '',
    request_id  TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The inbox lists by status, newest first.
CREATE INDEX contact_messages_status_created_idx ON contact_messages (status, created_at DESC);
CREATE INDEX contact_messages_created_idx ON contact_messages (created_at DESC);

CREATE TABLE admin_users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username      TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only a SHA-256 of each session token is stored; the token itself lives in
-- the browser cookie, so a database leak does not expose live sessions.
CREATE TABLE admin_sessions (
    token_hash  BYTEA       PRIMARY KEY,
    admin_id    BIGINT      NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
    csrf_token  TEXT        NOT NULL,
    client_ip   TEXT        NOT NULL DEFAULT '',
    user_agent  TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX admin_sessions_expires_idx ON admin_sessions (expires_at);
