/**
 * API client.
 *
 * The access token lives only in memory (and in the Redux store) — never in `localStorage`,
 * where any script on the page could read it. The refresh token is an HttpOnly cookie the
 * browser sends automatically to `/api/v1/auth/*`, so JavaScript can never read it either.
 *
 * On a 401 the client transparently rotates the session once and replays the request. Parallel
 * 401s share a single in-flight refresh so a dashboard firing six requests does not trigger six
 * rotations (which the backend would treat as token reuse).
 */

export const API_BASE = '/api/v1';

export interface ApiErrorBody {
  code: string;
  message: string;
  requestId?: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || 'Something went wrong');
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code || 'UNKNOWN';
    this.details = body.details;
    this.requestId = body.requestId;
  }

  /** Field-level messages, when the API returned validation details. */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) {
      for (const entry of this.details as { field?: string; message?: string }[]) {
        if (entry?.field) out[entry.field] = entry.message ?? 'Invalid value';
      }
    }
    return out;
  }

  get isAuth(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }
}

// --------------------------------------------------------------------------- token plumbing
let accessToken: string | null = null;
let onUnauthenticated: (() => void) | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setUnauthenticatedHandler(handler: (() => void) | null) {
  onUnauthenticated = handler;
}

async function readBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function toApiError(status: number, body: any): ApiError {
  let message = '';
  let code = status === 0 ? 'NETWORK_ERROR' : `HTTP_${status}`;

  if (body?.error) {
    if (typeof body.error === 'string') {
      message = body.error;
    } else if (typeof body.error === 'object') {
      code = body.error.code || code;
      message = body.error.message || '';
    }
  }

  if (!message && body?.detail) {
    message = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
  }

  if (!message && body?.message) {
    message = typeof body.message === 'string' ? body.message : '';
  }

  if (!message && body?.raw) {
    message = typeof body.raw === 'string' ? body.raw : '';
  }

  if (!message || message.trim() === 'Something went wrong') {
    if (status === 0) {
      message = "We couldn't reach the server. Please check your network connection and try again.";
    } else if (status === 400) {
      message = 'The request could not be processed due to invalid parameters (400 Bad Request).';
    } else if (status === 401) {
      message = 'Your session has expired or requires authentication (401 Unauthorized).';
    } else if (status === 403) {
      message = 'You do not have permission to perform this action (403 Forbidden).';
    } else if (status === 404) {
      message = 'The requested resource was not found (404 Not Found).';
    } else if (status === 409) {
      message = 'A conflicting resource already exists (409 Conflict).';
    } else if (status === 422) {
      message = 'The submitted data could not be processed (422 Unprocessable Entity).';
    } else if (status === 429) {
      message = 'Too many requests. Please wait a moment and try again (429 Rate Limited).';
    } else if (status >= 500) {
      message = `Server error [${code}]. The system encountered an issue processing your request. Please try again or contact support.`;
    } else {
      message = `Operation failed with status ${status} [${code}].`;
    }
  }

  const error: ApiErrorBody = {
    code,
    message,
    details: body?.error?.details || body?.details,
    requestId: body?.error?.requestId || body?.requestId,
  };
  return new ApiError(status, error);
}

/** Rotate the session. Concurrent callers await the same request. */
async function refreshSession(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) return null;
        const body = await readBody(response);
        const token: string | null = body?.data?.accessToken ?? null;
        if (token) accessToken = token;
        return token;
      } catch {
        return null;
      } finally {
        // Release the lock as soon as this rotation settles. Callers that joined while it was
        // in flight already hold the promise, so they still see its result — but a request that
        // 401s *later* must trigger a real rotation instead of being handed this stale one.
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** Query parameters; `undefined`, `null` and `''` entries are dropped. */
  params?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /** Set for FormData/file uploads so the browser sets the multipart boundary. */
  raw?: boolean;
  /** Internal: prevents an infinite refresh loop. */
  _retried?: boolean;
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  if (!params) return url;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${url}${url.includes('?') ? '&' : '?'}${query}` : url;
}

export async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const { params, body, raw, _retried, headers, ...rest } = options;

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const isRaw = raw || isFormData;

  const requestHeaders = new Headers(headers as HeadersInit);
  if (accessToken) requestHeaders.set('Authorization', `Bearer ${accessToken}`);
  if (!isRaw && body !== undefined && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  const method = (rest.method || 'GET').toUpperCase();
  const isGet = method === 'GET';

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      ...rest,
      method,
      credentials: 'include',
      headers: requestHeaders,
      body: isRaw ? (body as BodyInit) : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (caught) {
    // If this is a GET request and network is down, attempt fallback to Dexie query cache
    if (isGet) {
      try {
        const { getCachedQuery } = await import('@/lib/offline/db');
        const cached = await getCachedQuery(null, path, params);
        if (cached) {
          return cached.data as T;
        }
      } catch {
        // Fall through to throw ApiError
      }
    }
    throw toApiError(0, null);
  }

  if (response.status === 401 && !_retried && !path.startsWith('/auth/refresh')) {
    const token = await refreshSession();
    if (token) {
      return request<T>(path, { ...options, _retried: true });
    }
    const isDeviceOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (!isDeviceOffline) {
      accessToken = null;
      onUnauthenticated?.();
    }
  }

  if (response.status === 204) return undefined as T;

  const payload = await readBody(response);
  if (!response.ok) throw toApiError(response.status, payload);

  // When a GET request succeeds, persist it to Dexie query cache for offline availability
  if (isGet && payload !== null && payload !== undefined && !path.startsWith('/auth/')) {
    try {
      const { setCachedQuery } = await import('@/lib/offline/db');
      setCachedQuery(null, path, params, payload).catch(() => {});
    } catch {
      // Ignore background caching errors
    }
  }

  return payload as T;
}

// --------------------------------------------------------------------------- verbs
export const api = {
  get: <T = any>(path: string, params?: RequestOptions['params'], options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET', params }),
  post: <T = any>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T = any>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T = any>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T = any>(path: string, params?: RequestOptions['params'], options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE', params }),
  upload: <T = any>(path: string, form: FormData, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body: form, raw: true }),
  download: async (path: string, defaultFilename: string) => {
    const token = getAccessToken();
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(buildUrl(path), {
      method: 'GET',
      headers,
      credentials: 'include',
    });
    if (!res.ok) throw toApiError(res.status, await readBody(res));
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
  refresh: refreshSession,
};

// --------------------------------------------------------------------------- shared shapes
export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface Paged<T> {
  items: T[];
  pagination: Pagination;
  meta?: any;
  data?: any;
}

export interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
  meta?: any;
}
