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
