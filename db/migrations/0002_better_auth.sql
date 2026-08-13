-- Better Auth core schema in the ecms schema.
-- Maps the authenticated subject (auth user id) to app_users.auth_subject.
-- UUID identities match the ECMS convention; Better Auth lets PostgreSQL
-- generate UUIDs automatically for the PostgreSQL/Prisma adapter.

SET search_path TO ecms, public;

CREATE TABLE "user" (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name             text NOT NULL,
    email            text NOT NULL,
    email_verified   boolean NOT NULL DEFAULT false,
    image            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_email_ci ON "user" (lower(email));

CREATE TABLE "session" (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    token         text NOT NULL UNIQUE,
    expires_at    timestamptz NOT NULL,
    ip_address    text,
    user_agent    text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_session_user ON "session" (user_id);
CREATE INDEX IF NOT EXISTS ix_session_expiry ON "session" (expires_at);

CREATE TABLE "account" (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    account_id               text NOT NULL,
    provider_id              text NOT NULL,
    access_token             text,
    refresh_token            text,
    access_token_expires_at  timestamptz,
    refresh_token_expires_at timestamptz,
    scope                    text,
    id_token                 text,
    password                 text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_account_user ON "account" (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_provider_uid ON "account" (provider_id, account_id);

CREATE TABLE "verification" (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier   text NOT NULL,
    value        text NOT NULL,
    expires_at   timestamptz NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_verification_identifier ON "verification" (identifier);
