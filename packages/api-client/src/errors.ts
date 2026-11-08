import type { ZodError } from 'zod';

/** Derived from ZodError itself so this stays correct across zod's exact type-export naming. */
export type ZodIssue = ZodError['issues'][number];

export type ApiErrorKind = 'invalid_input' | 'unauthorized' | 'domain' | 'unavailable' | 'server' | 'network';

function kindForStatus(status: number): ApiErrorKind {
  if (status === 400) return 'invalid_input';
  if (status === 401) return 'unauthorized';
  if (status === 409) return 'domain';
  if (status === 502 || status === 503) return 'unavailable';
  return 'server';
}

function errorMessageFrom(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string') {
    return (body as { error: string }).error;
  }
  return `Request failed with status ${status}`;
}

function issuesFrom(body: unknown): ZodIssue[] | undefined {
  if (!body || typeof body !== 'object' || !('issues' in body)) return undefined;
  const issues = (body as { issues: unknown }).issues;
  return Array.isArray(issues) ? (issues as ZodIssue[]) : undefined;
}

/**
 * See docs/frontend-contract.md "Error envelopes": 400 carries field-level `issues`, 409 is a
 * domain rule rejection whose `error` string IS the business explanation (never replace it),
 * 401 means the token is gone, 502/503 mean an integration is down but the manual path stays
 * open, and anything else is a generic 5xx or a network/transport failure.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly issues?: ZodIssue[];
  readonly kind: ApiErrorKind;

  constructor(status: number, body: unknown, kind?: ApiErrorKind) {
    super(errorMessageFrom(body, status));
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.kind = kind ?? kindForStatus(status);
    this.issues = this.kind === 'invalid_input' ? issuesFrom(body) : undefined;
  }

  static network(cause: unknown): ApiError {
    const error = new ApiError(0, null, 'network');
    if (cause instanceof Error) error.cause = cause;
    return error;
  }

  /** Maps each 400 issue's `path` to its message, keyed like a form's field names ("supplierId", "quote.validUntil"). */
  fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    if (!this.issues) return result;
    for (const issue of this.issues) {
      const key = issue.path.map(String).join('.');
      if (key) result[key] = issue.message;
    }
    return result;
  }

  /** True when the response body carried an `error` string, rather than our synthesized fallback. */
  hasServerMessage(): boolean {
    return (
      typeof this.body === 'object' &&
      this.body !== null &&
      'error' in this.body &&
      typeof (this.body as { error: unknown }).error === 'string' &&
      (this.body as { error: string }).error.trim().length > 0
    );
  }

  /** Spanish text safe to render directly in the UI. */
  userMessage(): string {
    switch (this.kind) {
      case 'invalid_input':
        return 'Revisa los datos ingresados: algunos campos no son válidos.';
      case 'unauthorized':
        return 'Tu sesión expiró o el token no es válido. Vuelve a iniciar sesión.';
      case 'domain':
        // CRITICAL: the server's `error` string is the business reason, not a crash — show it verbatim.
        return this.message;
      case 'unavailable':
        // The server names WHICH integration is down and what to do about it
        // ("DeepSeek no está configurado; la operación manual sigue disponible").
        // That is strictly more useful than a generic line, so prefer it and fall
        // back only when the body carried no `error` string at all.
        return this.hasServerMessage()
          ? this.message
          : 'El servicio externo no está disponible en este momento. Puedes continuar de forma manual.';
      case 'network':
        return 'No se pudo conectar con el servidor. Verifica tu conexión e inténtalo de nuevo.';
      case 'server':
      default:
        return 'Ocurrió un error inesperado en el servidor. Inténtalo de nuevo.';
    }
  }
}
