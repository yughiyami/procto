import { describe, expect, it } from 'vitest';
import { sanitizeContext, scriptedAnswer } from './guidance';
import type { PacoContext } from './guidance';

const ctx = (over: Partial<PacoContext> = {}): PacoContext => ({
  role: 'comprador',
  pro: false,
  orders: [{ title: '300 chompas de alpaca', status: 'accepted', priceCents: 3_000_000, accepted: true }],
  payment: {
    orderTitle: '300 chompas de alpaca',
    phase: 'Created',
    totalCents: 3_000_000,
    deliveredUnpaid: 0,
    waitingDelivery: 3,
    offered: 0,
    shares: [{ label: 'Taller de tejido Colca', amountCents: 1_380_000, state: 'Pendiente de depósito' }],
  },
  ...over,
});

describe('scriptedAnswer', () => {
  it('tells the buyer what to do next', () => {
    expect(scriptedAnswer('¿Qué me toca ahora?', ctx())).toMatch(/Depositar pago/);
  });

  it('explains advances in plain words', () => {
    const a = scriptedAnswer('¿Cómo pido un adelanto?', ctx({ role: 'proveedor' }));
    expect(a).toMatch(/adelanto/i);
    expect(a).toMatch(/descuento/i);
    expect(a).not.toMatch(/blockchain|cripto|wallet|token/i);
  });

  it('explains the commission with the PRO rate', () => {
    expect(scriptedAnswer('¿Cuánto cobra PROCTO?', ctx())).toMatch(/3%/);
    expect(scriptedAnswer('¿Cuánto cobra PROCTO?', ctx({ pro: true }))).toMatch(/2%/);
    expect(scriptedAnswer('comisión', ctx())).toMatch(/8%/);
  });

  it('explains the verifiable receipt', () => {
    expect(scriptedAnswer('¿Dónde veo el comprobante?', ctx())).toMatch(/comprobante/i);
  });

  it('handles a user without any protected payment yet', () => {
    const a = scriptedAnswer('¿Qué hago?', ctx({ payment: null }));
    expect(a).toMatch(/cotización/i);
  });

  it('falls back to the next step and suggests topics', () => {
    const a = scriptedAnswer('hola', ctx());
    expect(a).toMatch(/Ahora te toca/);
    expect(a).toMatch(/adelanto/i);
  });
});

describe('sanitizeContext', () => {
  it('keeps only known roles and caps list sizes and text lengths', () => {
    const dirty = {
      role: 'hacker',
      orders: Array.from({ length: 50 }, (_, i) => ({ title: 'x'.repeat(500) + i, status: 'accepted', priceCents: 1, accepted: true })),
      payment: null,
    };
    const clean = sanitizeContext(dirty);
    expect(clean.role).toBe('comprador');
    expect(clean.orders.length).toBeLessThanOrEqual(5);
    expect(clean.orders[0]!.title.length).toBeLessThanOrEqual(120);
  });

  it('survives garbage', () => {
    expect(sanitizeContext(null).orders).toEqual([]);
    expect(sanitizeContext('x').payment).toBeNull();
  });
});
