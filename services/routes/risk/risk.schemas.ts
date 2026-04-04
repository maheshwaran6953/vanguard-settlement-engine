import { z } from 'zod';

export const AssessRiskSchema = z.object({
  invoice_id: z.string().uuid().trim(),
  three_way_match_input: z.object({
    invoice_id:             z.string().uuid().trim(),
    invoice_amount_cents:   z.number().int().positive(),
    po_amount_cents:        z.number().int().positive(),
    delivery_amount_cents:  z.number().int().positive(),
    po_number:              z.string().min(1),
    delivery_receipt_id:    z.string().min(1),
  }),
  anomaly_signals: z.object({
    invoice_id:               z.string().uuid().trim(),
    buyer_id:                 z.string().uuid().trim(),
    supplier_id:              z.string().uuid().trim(),
    amount_cents:             z.number().int().positive(),
    due_date:                 z.coerce.date(),
    submitted_at:             z.coerce.date(),
    avg_invoice_amount_cents: z.number().int().min(0),
    days_until_due:           z.number().int().min(0),
    prior_default_count:      z.number().int().min(0),
  }),
});