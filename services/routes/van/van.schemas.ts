import { z } from 'zod';

// invoice_id comes from the request body — the supplier specifies which
// invoice they want a VAN created for. This is correct and intentional.
// expected_amount_cents must match the invoice amount — validated in service layer.
export const CreateVanSchema = z.object({
  invoice_id:            z.string().uuid().trim(),
  expected_amount_cents: z.number().int().positive(),
});

// Webhook payload — not JWT-authenticated, authenticated via HMAC signature.
// All fields come from the bank's notification, not from a user session.
export const RecordPaymentSchema = z.object({
  account_number:  z.string().min(1).trim(),
  amount_cents:    z.number().int().positive(),
  idempotency_key: z.string().min(1).trim(),
  paid_at:         z.coerce.date(),
});