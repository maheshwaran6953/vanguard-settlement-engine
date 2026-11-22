export type OrgRole = 'supplier' | 'buyer' | 'platform_admin';

export interface Organisation {
  id: string;
  legal_name: string;
  role: OrgRole;
  gstin?: string;
  kyc_status?: string;
}

export interface AuthResult {
  token: string;
  expires_in: string;
  organisation: Organisation;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: Record<string, string[]>;
  retry_after_seconds?: number;
}

export interface ApiResponseSuccess<T> {
  success: true;
  data: T;
}

export interface ApiResponseError {
  success: false;
  error: ApiErrorDetail;
}

export type ApiResponse<T> = ApiResponseSuccess<T> | ApiResponseError;

export interface RegisterInput {
  legal_name: string;
  gstin?: string;
  role: 'supplier' | 'buyer';
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export type InvoiceStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'BUYER_APPROVED'
  | 'FINANCING_REQUESTED'
  | 'FUNDED'
  | 'REPAID'
  | 'DEFAULTED'
  | 'CANCELLED';

export interface Invoice {
  id: string;
  invoice_number: string;
  supplier_id: string;
  buyer_id: string;
  amount_cents: string | number;
  currency: string;
  due_date: string;
  status: InvoiceStatus;
  buyer_signature?: string | null;
  pdf_receipt_path?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmitInvoiceInput {
  invoice_number: string;
  buyer_id: string;
  amount_cents: number;
  currency: string;
  due_date: string;
}

export interface BuyerOrgSummary {
  id: string;
  legal_name: string;
}

export interface AuthUser {
  token: string;
  role: OrgRole;
  orgId: string;
  legalName: string;
}

export interface InvoiceEvent {
  id: string;
  invoice_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  actor_id: string | null;
  occurred_at: string;
}

export interface InvoiceWithHistory {
  invoice: Invoice;
  events: InvoiceEvent[];
}

export type VanStatus = 'active' | 'partially_settled' | 'settled' | 'over_paid' | 'expired';

export interface VirtualAccount {
  id: string;
  invoice_id: string;
  account_number: string;
  ifsc_code: string;
  expected_amount_cents: string;
  received_amount_cents: string;
  status: VanStatus;
  expires_at: string;
  created_at?: string;
}

export interface LedgerEntry {
  id: string;
  virtual_account_id: string;
  entry_type: 'debit' | 'credit';
  amount_cents: string;
  description: string;
  idempotency_key: string;
  created_at: string;
}

export interface VanWithLedger {
  virtual_account: VirtualAccount;
  ledger_entries: LedgerEntry[];
  is_fully_settled: boolean;
}

export interface ApproveInvoiceInput {
  buyer_signature: string;
}

export interface FailedJobSummary {
  id: string | undefined;
  queue: string;
  job_name: string;
  failed_reason: string;
  attempts_made: number;
  failed_at: number | undefined;
  payload: unknown;
}

export interface FailedJobsData {
  count: number;
  jobs: FailedJobSummary[];
}

export interface FailedJobsResponse {
  success: boolean;
  data: FailedJobsData;
}

export interface AdminActionResponse {
  success: boolean;
  message: string;
}


