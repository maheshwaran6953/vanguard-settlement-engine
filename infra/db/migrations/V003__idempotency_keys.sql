-- V003__idempotency_keys.sql
-- HTTP-level idempotency key store.
-- Caches request outcomes so retried POST requests return
-- the original response without re-executing business logic.

CREATE TABLE idempotency_keys (
id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

-- The key the client sent in the Idempotency-Key header.
-- Scoped to a specific org so two orgs can use the same key
-- independently without collision.
idempotency_key TEXT        NOT NULL,
org_id          UUID        NOT NULL REFERENCES organisations(id),

-- Which endpoint this key was used against.
-- A key is only valid for one route. Reusing INV-001 on both
-- POST /invoices and POST /vans is an error, not idempotency.
request_path    TEXT        NOT NULL,
request_method  TEXT        NOT NULL DEFAULT 'POST',

-- Three-state lifecycle
status          TEXT        NOT NULL DEFAULT 'PROCESSING'
                            CHECK (status IN ('PROCESSING','COMPLETED','FAILED')),

-- Cached response — stored so second request gets identical reply
response_status INTEGER,
response_body   JSONB,

-- Automatic expiry — keys are valid for 24 hours.
-- After this, the same key can be reused for a new request.
expires_at      TIMESTAMPTZ NOT NULL
                DEFAULT (now() + INTERVAL '24 hours'),

created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

-- The combination of key + org + path must be unique.
-- This UNIQUE constraint is the atomic lock mechanism.
CONSTRAINT uq_idempotency_key_org_path
    UNIQUE (idempotency_key, org_id, request_path)
);

CREATE INDEX idx_idem_key_org
ON idempotency_keys (idempotency_key, org_id, request_path);

CREATE INDEX idx_idem_expires
ON idempotency_keys (expires_at)
WHERE status = 'COMPLETED';