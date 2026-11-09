import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_MESSAGES, answer, buildInstructions, limitCaller, parsePacoRequest, resetRateLimit } from './paco.js';
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
  it('uses the model when the gateway is available', async () => {
    const generate = vi.fn(async () => 'Deposita el pago para que el dinero quede en garantía.');
    const out = await answer(req(), { gatewayAvailable: true, generate });
    expect(out).toEqual({ text: 'Deposita el pago para que el dinero quede en garantía.', source: 'paco', degraded: false });
    expect(generate).toHaveBeenCalledOnce();
  });

  it('answers from the script without calling the model when there is no gateway', async () => {
    const generate = vi.fn(async () => 'nope');
    const out = await answer(req('¿Cuánto cobra PROCTO?'), { gatewayAvailable: false, generate });
    expect(out.source).toBe('guia');
    expect(out.degraded).toBe(false);
    expect(out.text).toMatch(/3%/);
    expect(generate).not.toHaveBeenCalled();
  });

  it('falls back to the script when the model fails', async () => {
    const out = await answer(req(), {
      gatewayAvailable: true,
      generate: async () => {
        throw new Error('gateway down');
      },
    });
    expect(out).toMatchObject({ source: 'guia', degraded: true });
    expect(out.text.length).toBeGreaterThan(10);
  });

  it('falls back on an empty model answer', async () => {
    const out = await answer(req(), { gatewayAvailable: true, generate: async () => '   ' });
    expect(out.degraded).toBe(true);
  });

  it('aborts a model call that takes too long', async () => {
    const out = await answer(req(), {
      gatewayAvailable: true,
      timeoutMs: 10,
      generate: ({ signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });
    expect(out.degraded).toBe(true);
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
