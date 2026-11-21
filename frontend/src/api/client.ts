import { ApiErrorDetail, ApiResponse } from './types';
import { ApiClientError, mapErrorCodeToMessage } from './errors';

export const VSE_STORAGE_KEYS = {
  TOKEN: 'vse_auth_token',
  ROLE: 'vse_user_role',
  ORG_ID: 'vse_org_id',
  LEGAL_NAME: 'vse_legal_name',
} as const;

export function clearAuthStorage(): void {
  localStorage.removeItem(VSE_STORAGE_KEYS.TOKEN);
  localStorage.removeItem(VSE_STORAGE_KEYS.ROLE);
  localStorage.removeItem(VSE_STORAGE_KEYS.ORG_ID);
  localStorage.removeItem(VSE_STORAGE_KEYS.LEGAL_NAME);
}

const getBaseUrl = (): string => {
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
};

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const token = localStorage.getItem(VSE_STORAGE_KEYS.TOKEN);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch (err) {
    throw new ApiClientError(
      'NETWORK_ERROR',
      'Unable to connect to the Vanguard API server. Please ensure the backend is running.',
      0,
    );
  }

  if (response.status === 401) {
    clearAuthStorage();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login' && window.location.pathname !== '/register') {
      window.location.href = '/login';
    }
  }

  let json: ApiResponse<T>;
  try {
    json = await response.json();
  } catch {
    if (!response.ok) {
      throw new ApiClientError(
        'HTTP_ERROR',
        `Request failed with status ${response.status}`,
        response.status,
      );
    }
    return {} as T;
  }

  if (!json.success) {
    const errorDetail: ApiErrorDetail = json.error || {
      code: 'UNKNOWN_ERROR',
      message: 'Unknown error returned by server',
    };

    let retryAfterSeconds = errorDetail.retry_after_seconds;
    if (!retryAfterSeconds && response.headers.has('Retry-After')) {
      const parsed = parseInt(response.headers.get('Retry-After') || '', 10);
      if (!isNaN(parsed)) retryAfterSeconds = parsed;
    }

    const readableMessage = mapErrorCodeToMessage(
      { ...errorDetail, retry_after_seconds: retryAfterSeconds },
      response.status,
    );

    throw new ApiClientError(
      errorDetail.code,
      readableMessage,
      response.status,
      errorDetail.details,
      retryAfterSeconds,
    );
  }

  return json.data;
}

export const apiClient = {
  get<T>(endpoint: string, options?: RequestInit): Promise<T> {
    return apiRequest<T>(endpoint, { ...options, method: 'GET' });
  },
  post<T>(endpoint: string, body?: unknown, options?: RequestInit): Promise<T> {
    return apiRequest<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },
};
