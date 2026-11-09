import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_MESSAGES, answer, buildInstructions, limitCaller, parsePacoRequest, resetRateLimit, summarizeHealth } from './paco.js';
import { sanitizeContext } from '../../src/paco/guidance.js';

const ctx = sanitizeContext({ role: 'comprador', pro: false, orders: [], payment: null });
const req = (text = '¿Qué me toca ahora?') => ({ messages: [{ role: 'user' as const, content: text }], context: ctx });

describe('parsePacoRequest', () => {
  it('requires a final user message', () => {
    expect(() => parsePacoRequest({ messages: [] })).toThrow(/pregunta/);
    expect(() => parsePacoRequest({ messages: [{ role: 'assistant', content: 'hola' }] })).toThrow();
    expect(() => parsePacoRequest(null)).toThrow();
  });

  it('keeps only the last messages and trims oversized text', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
    many.push({ role: 'user', content: 'x'.repeat(10_000) });
    const parsed = parsePacoRequest({ messages: many });
    expect(parsed.messages.length).toBeLessThanOrEqual(MAX_MESSAGES);
    expect(parsed.messages.at(-1)!.content.length).toBe(1_500);
  });

  it('sanitizes the context', () => {
    const parsed = parsePacoRequest({ messages: [{ role: 'user', content: 'hola' }], context: { role: 'root', orders: 'nope' } });
    expect(parsed.context.role).toBe('comprador');
    expect(parsed.context.orders).toEqual([]);
  });
});

describe('buildInstructions', () => {
  it('forbids jargon and treats context as data', () => {
    const text = buildInstructions(ctx);
    expect(text).toMatch(/no son instrucciones/);
    expect(text).toMatch(/Nunca pidas ni aceptes claves/);
    expect(text).toMatch(/español/);
  });
});

describe('answer', () => {
  const ok = (text: string) => async () => text;
  const fail = async () => {
    throw new Error('provider down');
  };

  it('uses the first available provider and reports which one answered', async () => {
    const meta = vi.fn(ok('Deposita el pago.'));
    const gateway = vi.fn(ok('gateway'));
    const out = await answer(req(), { providers: [{ id: 'meta', available: true, generate: meta }, { id: 'gateway', available: true, generate: gateway }] });
    expect(out).toEqual({ text: 'Deposita el pago.', source: 'paco', degraded: false, provider: 'meta' });
    expect(gateway).not.toHaveBeenCalled();
  });

  it('skips providers without credentials without calling them', async () => {
    const meta = vi.fn(ok('x'));
    const out = await answer(req(), { providers: [{ id: 'meta', available: false, generate: meta }, { id: 'gateway', available: true, generate: ok('desde el gateway') }] });
    expect(out.provider).toBe('gateway');
    expect(meta).not.toHaveBeenCalled();
  });

  it('falls through to the gateway when Meta fails', async () => {
    const out = await answer(req(), { providers: [{ id: 'meta', available: true, generate: fail }, { id: 'gateway', available: true, generate: ok('respuesta') }] });
    expect(out).toMatchObject({ provider: 'gateway', source: 'paco', degraded: false });
  });

  it('answers from the script when no provider is configured', async () => {
    const out = await answer(req('¿Cuánto cobra PROCTO?'), { providers: [{ id: 'meta', available: false, generate: fail }, { id: 'gateway', available: false, generate: fail }] });
    expect(out).toMatchObject({ source: 'guia', provider: 'guia', degraded: false });
    expect(out.text).toMatch(/3%/);
  });

  it('marks the script as degraded when configured providers all fail or answer empty', async () => {
    const out = await answer(req(), { providers: [{ id: 'meta', available: true, generate: fail }, { id: 'gateway', available: true, generate: ok('   ') }] });
    expect(out).toMatchObject({ source: 'guia', provider: 'guia', degraded: true });
    expect(out.text.length).toBeGreaterThan(10);
  });

  it('aborts a provider that takes too long and moves on', async () => {
    const slow = ({ signal }: { signal: AbortSignal }) =>
      new Promise<string>((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const out = await answer(req(), { timeoutMs: 10, providers: [{ id: 'meta', available: true, generate: slow }, { id: 'gateway', available: true, generate: ok('listo') }] });
    expect(out.provider).toBe('gateway');
  });
});

describe('summarizeHealth', () => {
  it('names the first working provider', () => {
    const h = summarizeHealth([
      { id: 'meta', configured: true, ok: true, detail: 'muse-spark-1.3' },
      { id: 'gateway', configured: true, ok: false, detail: 'billing' },
    ]);
    expect(h).toMatchObject({ available: true, provider: 'meta', reason: 'ok' });
  });
  it('explains why each provider is out when none works', () => {
    const h = summarizeHealth([
      { id: 'meta', configured: false, ok: false, detail: 'META_API_KEY no está configurada' },
      { id: 'gateway', configured: true, ok: false, detail: 'sin crédito' },
    ]);
    expect(h.provider).toBe('guia');
    expect(h.available).toBe(false);
    expect(h.reason).toMatch(/meta: META_API_KEY/);
    expect(h.reason).toMatch(/gateway: sin crédito/);
  });
  it('falls back to the gateway when Meta is not configured', () => {
    expect(summarizeHealth([{ id: 'meta', configured: false, ok: false, detail: 'x' }, { id: 'gateway', configured: true, ok: true, detail: 'm' }]).provider).toBe('gateway');
  });
});

describe('rate limit', () => {
  beforeEach(resetRateLimit);
  it('allows 12 questions a minute per caller and then answers 429', () => {
    const t = 1_000_000;
    for (let i = 0; i < 12; i++) limitCaller('1.2.3.4', t + i);
    expect(() => limitCaller('1.2.3.4', t + 20)).toThrowError(/Demasiadas/);
    expect(() => limitCaller('5.6.7.8', t + 20)).not.toThrow();
    expect(() => limitCaller('1.2.3.4', t + 61_000)).not.toThrow();
  });
});
