-- V004__pdf_storage.sql
-- Adds pdf_receipt_path to invoices so the settlement receipt
-- location can be retrieved by the supplier portal.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS pdf_receipt_path TEXT;

COMMENT ON COLUMN invoices.pdf_receipt_path IS
  'Relative path to the generated settlement receipt PDF.
   Null until the invoice reaches REPAID status and the
   document worker generates the receipt.';