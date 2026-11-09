import { describe, expect, it, vi } from 'vitest';
import { META_BASE, META_MODEL, MetaError, buildMetaRequest, metaGenerate, metaProbe, parseMetaResponse } from './meta.js';

const KEY = 'sk-meta-test-key-123456';
const input = {
  instructions: 'Eres PACO.',
  messages: [
    { role: 'user' as const, content: 'hola' },
    { role: 'assistant' as const, content: 'Hola, ¿en qué te ayudo?' },
    { role: 'user' as const, content: '¿Qué me toca?' },
  ],
};

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('buildMetaRequest', () => {
  it('puts the instructions first as a developer message and keeps the conversation', () => {
    const req = buildMetaRequest(input);
    expect(req.model).toBe(META_MODEL);
    expect(req.messages[0]).toEqual({ role: 'developer', content: 'Eres PACO.' });
    expect(req.messages.slice(1)).toEqual(input.messages);
  });
  it('uses max_completion_tokens (max_output_tokens is rejected) and light reasoning', () => {
    const req = buildMetaRequest(input) as Record<string, unknown>;
    expect(req.max_completion_tokens).toBeGreaterThanOrEqual(600);
    expect(req).not.toHaveProperty('max_output_tokens');
    expect(req).not.toHaveProperty('n');
    expect(req.reasoning_effort).toBe('low');
  });
  it('honors a model override', () => {
    expect(buildMetaRequest(input, 'muse-spark-1.2').model).toBe('muse-spark-1.2');
  });
});

describe('parseMetaResponse', () => {
  it('reads the assistant text from choices[0].message.content', () => {
    expect(parseMetaResponse({ choices: [{ message: { role: 'assistant', content: ' Deposita el pago. ' }, finish_reason: 'stop' }] })).toBe('Deposita el pago.');
  });
  it('rejects empty, null or malformed answers', () => {
    expect(() => parseMetaResponse({ choices: [{ message: { content: null }, finish_reason: 'length' }] })).toThrow(MetaError);
    expect(() => parseMetaResponse({})).toThrow(MetaError);
    expect(() => parseMetaResponse(null)).toThrow(MetaError);
  });
});

describe('metaGenerate', () => {
  it('posts to /chat/completions with a bearer key and returns the text', async () => {
    const fetchImpl = vi.fn(async () => ok({ choices: [{ message: { content: 'Listo.' }, finish_reason: 'stop' }] }));
    const text = await metaGenerate({ apiKey: KEY, fetchImpl: fetchImpl as unknown as typeof fetch, signal: new AbortController().signal, ...input });
    expect(text).toBe('Listo.');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${META_BASE}/chat/completions`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(String(init.body)).messages[0].role).toBe('developer');
  });

  it('maps API errors to a MetaError with type and code but never the key', async () => {
    const fetchImpl = vi.fn(async () => ok({ error: { message: `Unauthorized for ${KEY}`, type: 'authentication_error', code: 'invalid_api_key', param: null } }, 401));
    const err = await metaGenerate({ apiKey: KEY, fetchImpl: fetchImpl as unknown as typeof fetch, signal: new AbortController().signal, ...input }).then(() => { throw new Error('expected failure'); }, (e: unknown) => e as MetaError);
    expect(err).toBeInstanceOf(MetaError);
    expect(err.status).toBe(401);
    expect(err.type).toBe('authentication_error');
    expect(err.code).toBe('invalid_api_key');
    expect(`${err.message} ${err.stack}`).not.toContain(KEY);
  });

  it('survives non-JSON error bodies (404 has an empty body)', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    const err = await metaGenerate({ apiKey: KEY, fetchImpl: fetchImpl as unknown as typeof fetch, signal: new AbortController().signal, ...input }).then(() => { throw new Error('expected failure'); }, (e: unknown) => e as MetaError);
    expect(err).toBeInstanceOf(MetaError);
    expect(err.status).toBe(404);
  });

  it('propagates aborts', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_res, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted')))));
    const p = metaGenerate({ apiKey: KEY, fetchImpl: fetchImpl as unknown as typeof fetch, signal: controller.signal, ...input });
    controller.abort();
    await expect(p).rejects.toThrow('aborted');
  });
});

describe('metaProbe', () => {
  it('reports ok and the model list from GET /models', async () => {
    const fetchImpl = vi.fn(async () => ok({ object: 'list', data: [{ id: 'muse-spark-1.3' }, { id: 'muse-spark-1.2' }] }));
    const r = await metaProbe({ apiKey: KEY, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toEqual({ ok: true, models: ['muse-spark-1.3', 'muse-spark-1.2'], modelAvailable: true });
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe(`${META_BASE}/models`);
  });
  it('explains a rejected key without leaking it', async () => {
    const fetchImpl = vi.fn(async () => ok({ error: { type: 'authentication_error', code: 'invalid_api_key', message: 'nope' } }, 401));
    const r = await metaProbe({ apiKey: KEY, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toContain('invalid_api_key');
    expect(JSON.stringify(r)).not.toContain(KEY);
  });
  it('reports a network failure', async () => {
    const r = await metaProbe({ apiKey: KEY, fetchImpl: (async () => { throw new Error('boom'); }) as unknown as typeof fetch });
    expect(r.ok).toBe(false);
  });
});
