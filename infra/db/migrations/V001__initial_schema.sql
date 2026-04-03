-- V001__initial_schema.sql
-- Vanguard Settlement Engine — Initial Domain Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE org_type       AS ENUM ('buyer', 'supplier', 'platform');
CREATE TYPE kyc_status     AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE invoice_status AS ENUM ('DRAFT', 'SUBMITTED', 'BUYER_APPROVED', 'FINANCING_REQUESTED', 'FUNDED', 'REPAID', 'DEFAULTED', 'CANCELLED');
CREATE TYPE van_status     AS ENUM ('active', 'settled', 'expired');
CREATE TYPE entry_type     AS ENUM ('debit', 'credit');

CREATE TABLE organisations (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name   TEXT        NOT NULL,
  gstin        VARCHAR(15) UNIQUE,
  org_type     org_type    NOT NULL,
  kyc_status   kyc_status  NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number   TEXT           NOT NULL UNIQUE,
  supplier_id      UUID           NOT NULL REFERENCES organisations(id),
  buyer_id         UUID           NOT NULL REFERENCES organisations(id),
  amount_cents     BIGINT         NOT NULL CHECK (amount_cents > 0),
  currency         CHAR(3)        NOT NULL DEFAULT 'INR',
  due_date         DATE           NOT NULL,
  status           invoice_status NOT NULL DEFAULT 'DRAFT',
  buyer_signature  TEXT,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT chk_buyer_ne_supplier CHECK (buyer_id != supplier_id)
);

CREATE TABLE virtual_accounts (
  id                     UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id             UUID       NOT NULL UNIQUE REFERENCES invoices(id),
  account_number         VARCHAR(20) NOT NULL UNIQUE,
  ifsc_code              VARCHAR(11) NOT NULL,
  expected_amount_cents  BIGINT     NOT NULL CHECK (expected_amount_cents > 0),
  received_amount_cents  BIGINT     NOT NULL DEFAULT 0 CHECK (received_amount_cents >= 0),
  status                 van_status NOT NULL DEFAULT 'active',
  expires_at             TIMESTAMPTZ NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ledger_entries (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  virtual_account_id  UUID        NOT NULL REFERENCES virtual_accounts(id),
  entry_type          entry_type  NOT NULL,
  amount_cents        BIGINT      NOT NULL CHECK (amount_cents > 0),
  description         TEXT        NOT NULL,
  idempotency_key     TEXT        NOT NULL UNIQUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoice_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID        NOT NULL REFERENCES invoices(id),
  event_type  TEXT        NOT NULL,
  payload     JSONB       NOT NULL,
  actor_id    UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

REVOKE UPDATE, DELETE ON invoice_events FROM PUBLIC;