/**
 * Meta Model API adapter (OpenAI-compatible Chat Completions at https://api.meta.ai/v1).
 *
 * Contract, from https://dev.meta.ai/docs/api-reference/chat-completions and /protocols/chat-completions:
 *  - POST /v1/chat/completions, `Authorization: Bearer <key>`
 *  - instructions go in a `developer` message (`system` is accepted too); `max_completion_tokens` counts
 *    reasoning plus visible text (`max_output_tokens` is a Responses-API field and is rejected with 400)
 *  - `reasoning_effort` accepts minimal..xhigh (`none` is rejected for Muse Spark)
 *  - the answer is `choices[0].message.content`; errors are `{ error: { message, type, param, code } }`
 *  - GET /v1/models lists the model ids
 * A thin fetch adapter keeps the request/response mapping unit-testable with a mocked fetch and adds no dependency.
 * The key is only ever placed in the Authorization header: it is never logged or put in an error message.
 */

export const META_BASE = 'https://api.meta.ai/v1';
export const META_MODEL = 'muse-spark-1.3';

export type MetaMessage = { role: 'user' | 'assistant'; content: string };

export class MetaError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly type: string | null = null,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = 'MetaError';
  }
}

export function buildMetaRequest(input: { instructions: string; messages: MetaMessage[] }, model: string = META_MODEL) {
  return {
    model,
    messages: [{ role: 'developer' as const, content: input.instructions }, ...input.messages],
    // Reasoning tokens count against this limit, so leave room beyond the short answer PACO writes.
    max_completion_tokens: 900,
    reasoning_effort: 'low' as const,
  };
}

export function parseMetaResponse(body: unknown): string {
  const choice = (body as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }> } | null)?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new MetaError(`Meta answered without text (finish_reason: ${String(choice?.finish_reason ?? 'unknown')}).`);
  }
  return content.trim();
}

async function toMetaError(response: Response, key: string): Promise<MetaError> {
  const body = (await response.json().catch(() => null)) as { error?: { type?: string; code?: string; message?: string } } | null;
  const type = body?.error?.type ?? null;
  const code = body?.error?.code ?? null;
  // Only the machine-readable fields are surfaced; the free-text message could echo request data.
  const text = `Meta API ${response.status}${type ? ` ${type}` : ''}${code ? ` ${code}` : ''}`;
  return new MetaError(text.split(key).join('[redacted]'), response.status, type, code);
}

export type MetaGenerateInput = {
  apiKey: string;
  instructions: string;
  messages: MetaMessage[];
  signal: AbortSignal;
  model?: string;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
};

export async function metaGenerate(input: MetaGenerateInput): Promise<string> {
  const doFetch = input.fetchImpl ?? fetch;
  const response = await doFetch(`${input.baseUrl ?? META_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${input.apiKey}` },
    body: JSON.stringify(buildMetaRequest(input, input.model)),
    signal: input.signal,
  });
  if (!response.ok) throw await toMetaError(response, input.apiKey);
  return parseMetaResponse(await response.json().catch(() => null));
}

export type MetaProbe = { ok: true; models: string[]; modelAvailable: boolean } | { ok: false; reason: string };

/** Free health check: lists models with the key. Tells a bad key from an outage without spending tokens. */
export async function metaProbe(input: { apiKey: string; fetchImpl?: typeof fetch; baseUrl?: string; model?: string; timeoutMs?: number }): Promise<MetaProbe> {
  const doFetch = input.fetchImpl ?? fetch;
  try {
    const response = await doFetch(`${input.baseUrl ?? META_BASE}/models`, {
      headers: { authorization: `Bearer ${input.apiKey}` },
      signal: AbortSignal.timeout(input.timeoutMs ?? 8_000),
    });
    if (!response.ok) {
      const err = await toMetaError(response, input.apiKey);
      return { ok: false, reason: err.message };
    }
    const body: unknown = await response.json().catch(() => null);
    // The list schema is not spelled out in the docs: accept OpenAI-style `data`, a `models` list or a bare array.
    const list = Array.isArray(body) ? body : ((body as { data?: unknown; models?: unknown } | null)?.data ?? (body as { models?: unknown } | null)?.models);
    const models = (Array.isArray(list) ? (list as Array<{ id?: unknown; name?: unknown }>) : [])
      .map((m) => m?.id ?? m?.name)
      .filter((id): id is string => typeof id === 'string');
    return { ok: true, models, modelAvailable: models.includes(input.model ?? META_MODEL) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? `${error.name}: ${error.message}`.split(input.apiKey).join('[redacted]').slice(0, 120) : 'network error' };
  }
}
