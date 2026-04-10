import { z } from 'zod';

// supplier_id is intentionally absent — extracted from JWT in the route handler.
// Accepting it from the request body would allow a supplier to submit invoices
// on behalf of another org, which is a privilege escalation vulnerability.
export const SubmitInvoiceSchema = z.object({
  invoice_number: z.string().min(1).max(50).trim(),
  buyer_id:       z.string().uuid().trim(),
  amount_cents:   z.number().int().positive(),
  currency:       z.string().length(3).default('INR'),
  due_date:       z.coerce.date(),
});

// buyer_id is intentionally absent — extracted from JWT.
// buyer_signature is the only field the buyer provides.
export const ApproveInvoiceSchema = z.object({
  buyer_signature: z.string().min(10).trim(),
});

// supplier_id is intentionally absent — extracted from JWT.
// This endpoint has no required body fields.
export const RequestFinancingSchema = z.object({}).strict();

export type SubmitInvoiceDto    = z.infer<typeof SubmitInvoiceSchema>;
export type ApproveInvoiceDto   = z.infer<typeof ApproveInvoiceSchema>;
export type RequestFinancingDto = z.infer<typeof RequestFinancingSchema>;