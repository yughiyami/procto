import { describe, expect, it } from 'vitest';
import { DEMO_ORDER_TITLE_PREFIX, DEMO_STEPS, FUNDS_MIN, isDemoOrder, landingPath, needsFaucet, parseDemoRole, walletPlan } from './scenario';

describe('parseDemoRole', () => {
  it('defaults to the buyer, who has the first action', () => {
    expect(parseDemoRole('')).toBe('comprador');
    expect(parseDemoRole('?rol=cualquiera')).toBe('comprador');
  });
  it.each(['comprador', 'proveedor', 'inversionista', 'coordinadora'])('accepts %s', (rol) => {
    expect(parseDemoRole(`?rol=${rol}`)).toBe(rol);
  });
  it('is case-insensitive', () => {
    expect(parseDemoRole('?rol=Proveedor')).toBe('proveedor');
  });
});

describe('walletPlan', () => {
  const plan = walletPlan([
    { id: 'a', name: 'Taller de tejido Colca' },
    { id: 'b', name: 'Taller de bordado Misti' },
  ]);
  it('creates one wallet for each of the five actors', () => {
    expect(plan.map((w) => w.slot)).toEqual(['coordinadora', 'comprador', 'proveedor:a', 'proveedor:b', 'inversionista']);
  });
  it('only the buyer and the investor need demo money', () => {
    expect(plan.filter((w) => w.needsFunds).map((w) => w.slot)).toEqual(['comprador', 'inversionista']);
  });
  it('labels workshops by name and records their id', () => {
    expect(plan[2]).toMatchObject({ label: 'Taller de tejido Colca', role: 'proveedor', workshopId: 'a' });
  });
});

describe('needsFaucet', () => {
  it('asks for money when below the minimum or without a balance line', () => {
    expect(needsFaucet(null)).toBe(true);
    expect(needsFaucet(0)).toBe(true);
    expect(needsFaucet(FUNDS_MIN - 1)).toBe(true);
  });
  it('skips the faucet when there is enough', () => {
    expect(needsFaucet(FUNDS_MIN)).toBe(false);
    expect(needsFaucet(19_000)).toBe(false);
  });
});

describe('misc', () => {
  it('has four steps in order', () => {
    expect(DEMO_STEPS.map((s) => s.id)).toEqual(['wallets', 'accounts', 'funds', 'order']);
  });
  it('recognizes the demo order by title', () => {
    expect(isDemoOrder({ title: `${DEMO_ORDER_TITLE_PREFIX} para tienda en Lima` })).toBe(true);
    expect(isDemoOrder({ title: '80 ponchos' })).toBe(false);
  });
  it('lands on the Cobro protegido tab', () => {
    expect(landingPath('abc')).toBe('/orders/abc?seccion=payment');
  });
});
