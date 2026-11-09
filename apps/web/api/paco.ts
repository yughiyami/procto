/**
 * POST /api/paco   body: { messages: [{ role, content }], context }
 * GET  /api/paco   health: which provider is active and why the others are not
 *
 * Provider order: Meta Model API (when META_API_KEY is set) -> Vercel AI Gateway -> scripted guide.
 *  - Meta: OpenAI-compatible chat completions at https://api.meta.ai/v1 (see _lib/meta.ts).
 *  - Gateway: AI SDK with a plain "provider/model" string. On Vercel it authenticates with the project's OIDC
 *    token; locally run `vercel env pull` (or set AI_GATEWAY_API_KEY).
 * If every provider fails the answer comes from scripted guidance, so the assistant never shows an error.
 * Keys are read from the environment only and never logged or returned.
 */
import { generateText } from 'ai';
import { META_MODEL, metaGenerate, metaProbe } from './_lib/meta.js';
import { PACO_MODEL, answer, limitCaller, parsePacoRequest, summarizeHealth } from './_lib/paco.js';
import type { GenerateFn, Provider, ProviderHealth } from './_lib/paco.js';
import { errorResponse, json } from './_lib/http.js';

const metaKey = () => process.env.META_API_KEY?.trim() || undefined;
const metaModel = () => process.env.META_MODEL?.trim() || META_MODEL;
const gatewayConfigured = () => Boolean(process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY);

const gatewayGenerate: GenerateFn = async ({ instructions, messages, signal }) => {
  const result = await generateText({ model: PACO_MODEL, instructions, messages, maxOutputTokens: 400, abortSignal: signal });
  return result.text;
};

function providers(): Provider[] {
  const key = metaKey();
  return [
    {
      id: 'meta',
      available: Boolean(key),
      generate: (input) => metaGenerate({ apiKey: key!, model: metaModel(), ...input }),
    },
    { id: 'gateway', available: gatewayConfigured(), generate: gatewayGenerate },
  ];
}

const callerKey = (request: Request) =>
  (request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'local').split(',')[0]!.trim();

export async function POST(request: Request): Promise<Response> {
  try {
    limitCaller(callerKey(request));
    const body = await request.json().catch(() => null);
    return json(await answer(parsePacoRequest(body), { providers: providers() }));
  } catch (error) {
    return errorResponse(error);
  }
}

let cache: { at: number; health: ProviderHealth[] } | null = null;

async function probeAll(): Promise<ProviderHealth[]> {
  const key = metaKey();
  let meta: ProviderHealth;
  if (!key) {
    meta = { id: 'meta', configured: false, ok: false, detail: 'META_API_KEY no está configurada' };
  } else {
    const probe = await metaProbe({ apiKey: key, model: metaModel() });
    meta = probe.ok
      ? { id: 'meta', configured: true, ok: true, detail: probe.modelAvailable ? `modelo ${metaModel()}` : `la clave funciona, pero ${metaModel()} no figura en /v1/models` }
      : { id: 'meta', configured: true, ok: false, detail: probe.reason };
  }

  let gateway: ProviderHealth;
  if (!gatewayConfigured()) {
    gateway = { id: 'gateway', configured: false, ok: false, detail: 'sin credenciales de AI Gateway' };
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const text = await gatewayGenerate({ instructions: 'Responde solo: ok', messages: [{ role: 'user', content: 'ok' }], signal: controller.signal });
      gateway = { id: 'gateway', configured: true, ok: text.trim().length > 0, detail: PACO_MODEL };
    } catch (error) {
      // The class and first line of the message tell a missing credit card from an outage.
      gateway = { id: 'gateway', configured: true, ok: false, detail: (error instanceof Error ? `${error.name}: ${error.message}` : 'error').split(/\r?\n/)[0]!.slice(0, 160) };
    } finally {
      clearTimeout(timer);
    }
  }
  return [meta, gateway];
}

/** Health: cached for five minutes per instance. The Meta probe lists models (free); the gateway probe is one tiny call. */
export async function GET(): Promise<Response> {
  if (!cache || Date.now() - cache.at > 5 * 60_000) cache = { at: Date.now(), health: await probeAll() };
  return json(summarizeHealth(cache.health));
}
