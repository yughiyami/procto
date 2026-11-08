import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError } from '@izumi/api-client';

type QueryBoundaryProps<T> = {
  query: UseQueryResult<T, unknown>;
  /** Render prop: called with the resolved data once loaded (and non-empty, if isEmpty is given). */
  children: (data: T) => ReactNode;
  loadingFallback?: ReactNode;
  emptyFallback?: ReactNode;
  /** Predicate deciding whether resolved data should render the empty state instead of children. */
  isEmpty?: (data: T) => boolean;
};

/**
 * Canonical async-state wrapper: every page renders loading / error / empty /
 * success through this component so behaviour stays consistent app-wide.
 * Errors prefer `ApiError.userMessage()` — the 400/409 body text is the
 * business explanation and must reach the user verbatim (see contract).
 */
export function QueryBoundary<T>({
  query,
  children,
  loadingFallback,
  emptyFallback,
  isEmpty,
}: QueryBoundaryProps<T>) {
  if (query.isPending) {
    return (
      <>
        {loadingFallback ?? (
          <div className="query-state query-state--loading" role="status" aria-live="polite">
            Cargando…
          </div>
        )}
      </>
    );
  }

  if (query.isError) {
    const message =
      query.error instanceof ApiError ? query.error.userMessage() : 'No pudimos completar la solicitud.';
    return (
      <div className="query-state query-state--error" role="alert">
        <p>{message}</p>
        <button type="button" onClick={() => void query.refetch()}>
          Reintentar
        </button>
      </div>
    );
  }

  const data = query.data as T;

  if (isEmpty?.(data)) {
    return (
      <>{emptyFallback ?? <div className="query-state query-state--empty">No hay elementos para mostrar.</div>}</>
    );
  }

  return <>{children(data)}</>;
}
