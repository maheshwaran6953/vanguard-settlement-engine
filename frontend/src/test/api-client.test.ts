import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, VSE_STORAGE_KEYS } from '../api/client';
import { ApiClientError, mapErrorCodeToMessage } from '../api/errors';

describe('API Client & Error Mapping', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('attaches Authorization header when token is present in localStorage', async () => {
    localStorage.setItem(VSE_STORAGE_KEYS.TOKEN, 'mock-jwt-token-123');

    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ success: true, data: { status: 'ok' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const data = await apiClient.get('/test-endpoint');
    expect(data).toEqual({ status: 'ok' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, options] = mockFetch.mock.calls[0];
    const headers = options.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer mock-jwt-token-123');
  });

  it('clears localStorage and handles 401 responses', async () => {
    localStorage.setItem(VSE_STORAGE_KEYS.TOKEN, 'expired-token');
    localStorage.setItem(VSE_STORAGE_KEYS.ROLE, 'supplier');
    localStorage.setItem(VSE_STORAGE_KEYS.ORG_ID, 'org-123');
    localStorage.setItem(VSE_STORAGE_KEYS.LEGAL_NAME, 'Test Corp');

    const mockFetch = vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Token expired' },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(apiClient.get('/invoices')).rejects.toThrow(ApiClientError);

    expect(localStorage.getItem(VSE_STORAGE_KEYS.TOKEN)).toBeNull();
    expect(localStorage.getItem(VSE_STORAGE_KEYS.ROLE)).toBeNull();
    expect(localStorage.getItem(VSE_STORAGE_KEYS.ORG_ID)).toBeNull();
    expect(localStorage.getItem(VSE_STORAGE_KEYS.LEGAL_NAME)).toBeNull();
  });

  it('correctly maps backend error codes to human-readable strings', () => {
    expect(
      mapErrorCodeToMessage({ code: 'INVALID_CREDENTIALS', message: 'Invalid' }, 401),
    ).toBe('Invalid email or password. Please try again.');

    expect(
      mapErrorCodeToMessage({ code: 'ORGANISATION_ALREADY_EXISTS', message: 'Exists' }, 409),
    ).toBe('An organisation with this email or GSTIN is already registered.');

    expect(
      mapErrorCodeToMessage(
        {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: { email: ['Invalid email format'] },
        },
        400,
      ),
    ).toContain('Validation failed (email: Invalid email format)');

    expect(
      mapErrorCodeToMessage(
        {
          code: 'TOO_MANY_LOGIN_ATTEMPTS',
          message: 'Too many requests',
          retry_after_seconds: 45,
        },
        429,
      ),
    ).toBe('Too many attempts. Please wait 45 seconds before trying again.');
  });
});
