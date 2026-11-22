-- V006__idempotency_fingerprint.sql
-- Add request_fingerprint column to idempotency_keys to prevent
-- replaying cached responses when the request body has changed (QA-002).

ALTER TABLE idempotency_keys
ADD COLUMN request_fingerprint TEXT;
