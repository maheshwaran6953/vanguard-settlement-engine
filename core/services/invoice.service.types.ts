// These types define what the service ACCEPTS and RETURNS.
// They are deliberately separate from DB entities — the service
// layer speaks in business language, not database language.

export interface SubmitInvoiceCommand {
  invoice_number: string;
  supplier_id:    string;
  buyer_id:       string;
  amount_cents:   number;
  currency:       string;
  due_date:       Date;
}

export interface ApproveInvoiceCommand {
  invoice_id:      string;
  buyer_id:        string;       // must match invoice.buyer_id
  buyer_signature: string;       // SHA-256 hash of approval payload
}

export interface RequestFinancingCommand {
  invoice_id:  string;
  supplier_id: string;           // must match invoice.supplier_id
}

// What the service returns — a richer object than the raw DB row.
// The event history travels with the invoice for the caller to use.
export interface InvoiceWithHistory {
  invoice:  import('../domain/entities').Invoice;
  events:   import('../domain/entities').InvoiceEvent[];
}