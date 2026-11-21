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

export interface AuthUser {
  token: string;
  role: OrgRole;
  orgId: string;
  legalName: string;
}
