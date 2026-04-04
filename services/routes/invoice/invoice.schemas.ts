import { z } from 'zod';

export const SubmitInvoiceSchema = z.object({
  invoice_number: z.string().min(1).max(50),
  buyer_id:       z.string().trim(),
  amount_cents:   z.number().int().positive(),
  currency:       z.string().length(3).default('INR'),
  due_date:       z.coerce.date(),   // coerce: "2026-12-31" string → Date object
});

export const ApproveInvoiceSchema = z.object({
  buyer_id:        z.string().trim(),
  buyer_signature: z.string().min(10),
});

export const RequestFinancingSchema = z.object({
  supplier_id: z.string().trim(),
});

// Infer TypeScript types from schemas — single source of truth
export type SubmitInvoiceDto    = z.infer<typeof SubmitInvoiceSchema>;
export type ApproveInvoiceDto   = z.infer<typeof ApproveInvoiceSchema>;
export type RequestFinancingDto = z.infer<typeof RequestFinancingSchema>;