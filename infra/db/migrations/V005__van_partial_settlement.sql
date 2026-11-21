-- V005__van_partial_settlement.sql
-- Add partially_settled and over_paid states to the van_status enum.
-- Strictly enum additions only — no data updates in this migration.

ALTER TYPE van_status ADD VALUE IF NOT EXISTS 'partially_settled';
ALTER TYPE van_status ADD VALUE IF NOT EXISTS 'over_paid';
