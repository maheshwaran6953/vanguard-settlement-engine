-- V002__auth_schema.sql
-- Authentication credentials for organisations.
-- Separate from the organisations table to preserve
-- the domain model's separation of concerns.

CREATE TABLE organisation_credentials (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL UNIQUE REFERENCES organisations(id),
  email           TEXT        NOT NULL UNIQUE,
  password_hash   TEXT        NOT NULL,       -- bcrypt hash, never plaintext
  role            TEXT        NOT NULL,       -- matches OrgRole union type
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_credentials_email ON organisation_credentials(email);
CREATE INDEX idx_credentials_org   ON organisation_credentials(org_id);