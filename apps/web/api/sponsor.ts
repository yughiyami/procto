/**
 * POST /api/sponsor   body: { xdr: string }  (a transaction already signed by the user)
 * Wraps it in a fee bump paid by SPONSOR_SECRET and submits it. See _lib/sponsor.ts.
 * Vercel Node.js runtime (default); uses the Web Request/Response signature.
 */
import { errorResponse, json, methodNotAllowed } from './_lib/http.js';
import { sponsorAndSubmit } from './_lib/sponsor.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => null)) as { xdr?: unknown } | null;
    if (!body || typeof body.xdr !== 'string') return json({ error: 'Falta la transacción firmada.' }, 400);
    const result = await sponsorAndSubmit(body.xdr, {
      SPONSOR_SECRET: process.env.SPONSOR_SECRET,
      SOROBAN_RPC_URL: process.env.SOROBAN_RPC_URL,
    });
    return json(result, result.status === 'FAILED' ? 422 : 200);
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = methodNotAllowed;
