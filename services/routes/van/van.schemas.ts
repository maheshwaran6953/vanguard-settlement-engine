import { z } from 'zod';

export const CreateVanSchema = z.object({
  invoice_id:            z.string().uuid().trim(),
  expected_amount_cents: z.number().int().positive(),
});

export const RecordPaymentSchema = z.object({
  account_number:  z.string().min(1).trim(),
  amount_cents:    z.number().int().positive(),
  idempotency_key: z.string().min(1).trim(),
  paid_at:         z.coerce.date(),
});