/**
 * POST /api/paco   body: { messages: [{ role, content }], context }
 * GET  /api/paco   health: { available }
 *
 * PACO answers through the Vercel AI Gateway with a plain "provider/model" string. On Vercel the
 * gateway authenticates with the project's OIDC token (VERCEL_OIDC_TOKEN); locally run
 * `vercel env pull` to get one. If the gateway is unavailable the answer comes from scripted
 * guidance, so the assistant never shows an error to the person.
 */
import { generateText } from 'ai';
import { PACO_MODEL, answer, limitCaller, parsePacoRequest } from './_lib/paco.js';
import type { GenerateFn } from './_lib/paco.js';
import { errorResponse, json } from './_lib/http.js';

// On Vercel the gateway authenticates with the OIDC token the platform injects into each request; locally it needs
// `vercel env pull` (VERCEL_OIDC_TOKEN) or AI_GATEWAY_API_KEY.
const gatewayAvailable = () => Boolean(process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY);

const generate: GenerateFn = async ({ instructions, messages, signal }) => {
  const result = await generateText({
    model: PACO_MODEL,
    instructions,
    messages,
    maxOutputTokens: 400,
    abortSignal: signal,
  });
  return result.text;
};

const callerKey = (request: Request) =>
  (request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'local').split(',')[0]!.trim();

export async function POST(request: Request): Promise<Response> {
  try {
    limitCaller(callerKey(request));
    const body = await request.json().catch(() => null);
    const parsed = parsePacoRequest(body);
    return json(await answer(parsed, { gatewayAvailable: gatewayAvailable(), generate }));
  } catch (error) {
    return errorResponse(error);
  }
}

let probe: { at: number; ok: boolean } | null = null;

/** Health: a tiny real call, cached for five minutes per instance, so "available" means the gateway answered. */
export async function GET(): Promise<Response> {
  if (!gatewayAvailable()) return json({ available: false, model: PACO_MODEL });
  if (!probe || Date.now() - probe.at > 5 * 60_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const text = await generate({ instructions: 'Responde solo: ok', messages: [{ role: 'user', content: 'ok' }], signal: controller.signal });
      probe = { at: Date.now(), ok: text.trim().length > 0 };
    } catch {
      probe = { at: Date.now(), ok: false };
    } finally {
      clearTimeout(timer);
    }
  }
  return json({ available: probe.ok, model: PACO_MODEL });
}
