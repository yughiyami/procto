import { describe, expect, it } from 'vitest';
import { orderPhase, shareState } from './shareStatus';

const base = {
  supplier: 'GA',
  owner: 'GA',
  amount: 100n,
  label: 'x',
  delivered: false,
  paid: false,
  refunded: false,
  offer_price: undefined,
};

describe('shareState', () => {
  it('is pending until the buyer funds the order', () => {
    expect(shareState(base, 'Created')).toEqual({ key: 'pending', label: 'Pendiente de depósito' });
  });
  it('is held in guarantee once funded', () => {
    expect(shareState(base, 'Funded').key).toBe('escrow');
  });
  it('shows that the workshop reported the delivery', () => {
    expect(shareState({ ...base, delivered: true }, 'Funded').key).toBe('delivered');
  });
  it('treats a null offer price (decoded Option::None) as no offer', () => {
    expect(shareState({ ...base, offer_price: null }, 'Funded').key).toBe('escrow');
  });
  it('shows an open advance offer', () => {
    expect(shareState({ ...base, offer_price: 96n }, 'Funded').key).toBe('offered');
  });
  it('is paid when released', () => {
    expect(shareState({ ...base, paid: true }, 'Completed').key).toBe('paid');
  });
  it('is refunded when the buyer got the money back', () => {
    expect(shareState({ ...base, refunded: true }, 'Refunded').key).toBe('refunded');
  });
});

describe('orderPhase', () => {
  it('maps contract status to a plain label', () => {
    expect(orderPhase('Created').label).toMatch(/activado/i);
    expect(orderPhase('Funded').label).toMatch(/depositado/i);
    expect(orderPhase('Completed').label).toMatch(/completo/i);
    expect(orderPhase('PartiallyRefunded').label).toMatch(/devuelt/i);
  });
});
