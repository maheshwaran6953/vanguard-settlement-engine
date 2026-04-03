// core/domain/entities.ts
// These types are the single source of truth for domain objects.
// They mirror V001__initial_schema.sql exactly.

export type OrgType   = 'buyer' | 'supplier' | 'platform';
export type KycStatus = 'pending' | 'verified' | 'rejected';

export type InvoiceStatus =
| 'DRAFT'
| 'SUBMITTED'
| 'BUYER_APPROVED'
| 'FINANCING_REQUESTED'
| 'FUNDED'
| 'REPAID'
| 'DEFAULTED'
| 'CANCELLED';

export type VanStatus  = 'active' | 'settled' | 'expired';
export type EntryType  = 'debit' | 'credit';

// ----------------------------------------------------------
// Entities (direct DB row representations)
// ----------------------------------------------------------

export interface Organisation {
id:         string;       // UUID
legal_name: string;
gstin:      string | null;
org_type:   OrgType;
kyc_status: KycStatus;
created_at: Date;
updated_at: Date;
}

export interface Invoice {
id:               string;
invoice_number:   string;
supplier_id:      string;
buyer_id:         string;
amount_cents:     number;   // stored in paise
currency:         string;
due_date:         Date;
status:           InvoiceStatus;
buyer_signature:  string | null;
created_at:       Date;
updated_at:       Date;
}

export interface VirtualAccount {
id:                    string;
invoice_id:            string;
account_number:        string;
ifsc_code:             string;
expected_amount_cents: number;
received_amount_cents: number;
status:                VanStatus;
expires_at:            Date;
created_at:            Date;
}

export interface LedgerEntry {
id:                 string;
virtual_account_id: string;
entry_type:         EntryType;
amount_cents:       number;
description:        string;
idempotency_key:    string;
created_at:         Date;
}

export interface InvoiceEvent {
id:          string;
invoice_id:  string;
event_type:  string;
payload:     Record<string, unknown>;   // JSONB → typed object
actor_id:    string | null;
occurred_at: Date;
}

// ----------------------------------------------------------
// Value Objects (inputs that don't yet have a DB identity)
// These are what your service layer receives before INSERT.
// ----------------------------------------------------------

export type CreateInvoiceInput = Omit<Invoice,
'id' | 'status' | 'buyer_signature' | 'created_at' | 'updated_at'
>;

export type CreateOrganisationInput = Omit<Organisation,
'id' | 'kyc_status' | 'created_at' | 'updated_at'
>;