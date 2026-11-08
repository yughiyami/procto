import { SponsorError } from './sponsor.js';

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

/** Maps thrown errors to a JSON error response without leaking internals. */
export function errorResponse(error: unknown): Response {
  if (error instanceof SponsorError) return json({ error: error.message }, error.status);
  console.error('[api] unexpected error', error instanceof Error ? error.message : error);
  return json({ error: 'Ocurrió un error inesperado. Inténtalo de nuevo.' }, 500);
}

export const methodNotAllowed = () => json({ error: 'Método no permitido.' }, 405);
