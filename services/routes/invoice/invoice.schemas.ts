import { z } from 'zod';

// supplier_id is intentionally absent — extracted from JWT in the route handler.
// Accepting it from the request body would allow a supplier to submit invoices
// on behalf of another org, which is a privilege escalation vulnerability.
export const SubmitInvoiceSchema = z.object({
  invoice_number: z.string().trim().min(1).max(50),
  buyer_id:       z.string().uuid().trim(),
  amount_cents:   z.number().int().positive(),
  currency:       z.string().length(3).default('INR'),
  due_date:       z.coerce.date(),
});

// buyer_id is intentionally absent — extracted from JWT.
// buyer_signature is the only field the buyer provides.
export const ApproveInvoiceSchema = z.object({
  buyer_signature: z.string().trim().min(10).max(500),
});

// supplier_id is intentionally absent — extracted from JWT.
// This endpoint has no required body fields.
export const RequestFinancingSchema = z.object({}).strict();

export const ListInvoicesQuerySchema = z.object({
  status: z.enum([
    'DRAFT',
    'SUBMITTED',
    'BUYER_APPROVED',
    'FINANCING_REQUESTED',
    'FUNDED',
    'REPAID',
    'DEFAULTED',
    'CANCELLED',
  ]).optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export type SubmitInvoiceDto    = z.infer<typeof SubmitInvoiceSchema>;
export type ApproveInvoiceDto   = z.infer<typeof ApproveInvoiceSchema>;
export type RequestFinancingDto = z.infer<typeof RequestFinancingSchema>;
export type ListInvoicesQueryDto = z.infer<typeof ListInvoicesQuerySchema>;