/**
 * POST /api/faucet   body: { address: string }
 * Testnet demo money (PUSD). Disabled unless ISSUER_SECRET is set. See _lib/faucet.ts.
 */
import { mintDemoTokens } from './_lib/faucet.js';
import { errorResponse, json, methodNotAllowed } from './_lib/http.js';

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => null)) as { address?: unknown } | null;
    if (!body || typeof body.address !== 'string') return json({ error: 'Falta la dirección de la cuenta.' }, 400);
    const result = await mintDemoTokens(body.address, {
      ISSUER_SECRET: process.env.ISSUER_SECRET,
      SOROBAN_RPC_URL: process.env.SOROBAN_RPC_URL,
      HORIZON_URL: process.env.HORIZON_URL,
    });
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = methodNotAllowed;
