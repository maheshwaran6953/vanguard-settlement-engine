import { ApiErrorDetail } from './types';

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly readableMessage: string,
    public readonly status: number,
    public readonly details?: Record<string, string[]>,
    public readonly retryAfterSeconds?: number,
  ) {
    super(readableMessage);
    this.name = 'ApiClientError';
  }
}

export function mapErrorCodeToMessage(error: ApiErrorDetail, status: number): string {
  if (status === 429 || error.code === 'TOO_MANY_LOGIN_ATTEMPTS' || error.code === 'TOO_MANY_REQUESTS') {
    if (error.retry_after_seconds && error.retry_after_seconds > 0) {
      return `Too many attempts. Please wait ${error.retry_after_seconds} seconds before trying again.`;
    }
    return 'Too many login attempts. Please wait before retrying.';
  }

  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return 'Invalid email or password. Please try again.';
    case 'ORGANISATION_ALREADY_EXISTS':
      return 'An organisation with this email or GSTIN is already registered.';
    case 'VALIDATION_ERROR':
      if (error.details && Object.keys(error.details).length > 0) {
        const fieldErrors = Object.entries(error.details)
          .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
          .join('; ');
        return `Validation failed (${fieldErrors})`;
      }
      return 'Please check the entered fields and try again.';
    case 'UNAUTHORIZED':
    case 'INVALID_TOKEN':
      return 'Your session has expired. Please log in again.';
    case 'FORBIDDEN':
      return 'You do not have permission to perform this action.';
    case 'INVALID_TRANSITION':
      return 'This action cannot be completed because the invoice is not in a valid state.';
    default:
      return error.message || 'An unexpected error occurred. Please try again.';
  }
}
