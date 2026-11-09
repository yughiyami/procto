import { describe, expect, it } from 'vitest';
import { composeSupplierQuestion, extractMovementDraft, extractPriceQuote, extractRequestDraft, suggestProfile } from './localRules';

const NOW = new Date('2026-11-08T12:00:00Z');

describe('extractRequestDraft', () => {
  it('reads product, quantity and a dated deadline from a WhatsApp-style request', () => {
    const d = extractRequestDraft('Hola, necesito 200 polos de algodón pima para el 20 de diciembre, tallas S M L', NOW);
    expect(d.quantity).toBe(200);
    expect(d.product).toMatch(/polos/i);
    expect(d.deadline?.startsWith('2026-12-20')).toBe(true);
    expect(d.missingFields).toEqual([]);
    expect(d.requiresHumanConfirmation).toBe(true);
  });

  it('understands relative deadlines in weeks', () => {
    const d = extractRequestDraft('Quiero 50 chompas de alpaca en 3 semanas', NOW);
    expect(d.quantity).toBe(50);
    expect(d.deadline?.startsWith('2026-11-29')).toBe(true);
  });

  it('reports what is missing instead of guessing', () => {
    const d = extractRequestDraft('Buenas, ¿tienen chompas?', NOW);
    expect(d.quantity).toBeNull();
    expect(d.deadline).toBeNull();
    expect(d.missingFields).toEqual(expect.arrayContaining(['quantity', 'deadline']));
  });

  it('rolls a past month/day to next year', () => {
    const d = extractRequestDraft('Necesito 10 ponchos para el 5 de enero', NOW);
    expect(d.deadline?.startsWith('2027-01-05')).toBe(true);
  });
});

describe('extractPriceQuote', () => {
  it('reads a unit price and quantity in soles', () => {
    expect(extractPriceQuote('Te hago 150 unidades a S/ 9.50 cada una')).toEqual({ quantity: 150, unitCostCents: 950 });
    expect(extractPriceQuote('son 90 piezas a 8,80 soles la unidad')).toEqual({ quantity: 90, unitCostCents: 880 });
  });
  it('returns nulls when there is no price', () => {
    expect(extractPriceQuote('Déjame revisar y te aviso')).toEqual({ quantity: null, unitCostCents: null });
  });
});

describe('extractMovementDraft', () => {
  it('classifies a customer receipt and reads the amount', () => {
    const d = extractMovementDraft('Cobré 120 soles al cliente por el adelanto');
    expect(d).toMatchObject({ kind: 'customer_receipt', amountCents: 12_000 });
    expect(d.requiresHumanConfirmation).toBe(true);
  });
  it('classifies a supplier payment', () => {
    expect(extractMovementDraft('Pagué S/ 1,250.50 al taller de tejido')).toMatchObject({ kind: 'supplier_payment', amountCents: 125_050 });
  });
  it('flags missing data', () => {
    const d = extractMovementDraft('Hice un movimiento');
    expect(d.kind).toBeNull();
    expect(d.amountCents).toBeNull();
    expect(d.missingFields).toEqual(expect.arrayContaining(['kind', 'amountCents']));
  });
});

describe('suggestProfile', () => {
  it('extracts name, city, activity and products', () => {
    const p = suggestProfile('Mi negocio se llama Tejidos Andinos. Estoy en Arequipa. Vendo chompas, ponchos y gorros y coordino talleres.');
    expect(p.name).toBe('Tejidos Andinos');
    expect(p.city).toBe('Arequipa');
    expect(p.activity).toBe('both');
    expect(p.products).toEqual(['chompas', 'ponchos', 'gorros']);
  });
  it('leaves unknown fields empty and lists them', () => {
    const p = suggestProfile('Hago tejidos.');
    expect(p.name).toBeNull();
    expect(p.missingFields).toEqual(expect.arrayContaining(['name', 'city']));
  });
});

describe('composeSupplierQuestion', () => {
  it('asks for quantity, price and date in plain Spanish', () => {
    const msg = composeSupplierQuestion({ supplierName: 'Taller Colca', orderTitle: '300 chompas', quantity: 300 });
    expect(msg).toMatch(/Taller Colca/);
    expect(msg).toMatch(/300 chompas/);
    expect(msg).toMatch(/precio/i);
  });
});
