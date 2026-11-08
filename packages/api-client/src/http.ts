import type { ZodType } from 'zod';
import { ApiError } from './errors.js';

export interface HttpClientConfig {
  baseUrl: string;
  getToken: () => string | null | undefined;
  onUnauthorized: () => void;
  /** Default request timeout in ms, combined with any caller-supplied AbortSignal. Defaults to 20000. */
  timeoutMs?: number;
}

export interface RequestOptions<T> {
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
  schema?: ZodType<T>;
  timeoutMs?: number;
}

export interface HttpClient {
  request<T = unknown>(method: string, path: string, options?: RequestOptions<T>): Promise<T>;
}

// The org Bearer token must never be attached to public/anonymous routes.
const PUBLIC_PREFIXES = ['/public/', '/health'];

function isPublicPath(path: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

/** Reads the response body as JSON without throwing on an empty or non-JSON payload. */
async function safeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function createHttpClient(config: HttpClientConfig): HttpClient {
  const defaultTimeoutMs = config.timeoutMs ?? 20_000;

  async function request<T>(method: string, path: string, options: RequestOptions<T> = {}): Promise<T> {
    const headers: Record<string, string> = {};
    const token = config.getToken();
    if (token && !isPublicPath(path)) headers.Authorization = `Bearer ${token}`;
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

    let payload: string | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(options.body);
    }

    const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? defaultTimeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;

    let response: Response;
    try {
      response = await fetch(`${config.baseUrl}${path}`, { method, headers, body: payload, signal });
    } catch (cause) {
      throw ApiError.network(cause);
    }

    const data = await safeJson(response);

    if (!response.ok) {
      if (response.status === 401) config.onUnauthorized();
      throw new ApiError(response.status, data);
    }

    if (options.schema) return options.schema.parse(data);
    return data as T;
  }

  return { request };
}
