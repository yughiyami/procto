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

const gatewayAvailable = () => Boolean(process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY);

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

export async function GET(): Promise<Response> {
  return json({ available: gatewayAvailable(), model: PACO_MODEL });
}
