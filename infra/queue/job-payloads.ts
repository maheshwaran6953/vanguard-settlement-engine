// ----------------------------------------------------------------
// Typed payloads for every job type.
// These are what get serialised into Redis and deserialised by
// the worker. TypeScript enforces that producers and consumers
// agree on the shape.
// ----------------------------------------------------------------

export interface InvoiceApprovedPayload {
  invoice_id:     string;
  invoice_number: string;
  supplier_id:    string;
  supplier_email: string;
  buyer_id:       string;
  amount_cents:   number;
  currency:       string;
  due_date:       string;   // ISO string — dates do not serialise through Redis
  approved_at:    string;
}

export interface InvoiceSubmittedPayload {
  invoice_id:     string;
  invoice_number: string;
  supplier_id:    string;
  buyer_id:       string;
  buyer_email:    string;
  amount_cents:   number;
  currency:       string;
}

export interface InvoiceRepaidPayload {
  invoice_id:     string;
  invoice_number: string;
  supplier_id:    string;
  supplier_email: string;
  amount_cents:   number;
  settled_at:     string;
}

export interface SettlementReceiptPdfPayload {
  invoice_id:     string;
  invoice_number: string;
  supplier_id:    string;
  buyer_id:       string;
  amount_cents:   number;
  currency:       string;
  settled_at:     string;
}

export interface CreditBureauCheckPayload {
  org_id:         string;
  gstin:          string;
  requested_by:   string;
}

// Union type for all payloads — used by the worker dispatcher
export type AnyJobPayload =
  | InvoiceApprovedPayload
  | InvoiceSubmittedPayload
  | InvoiceRepaidPayload
  | SettlementReceiptPdfPayload
  | CreditBureauCheckPayload;