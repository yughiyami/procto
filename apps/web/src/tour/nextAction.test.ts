import { describe, expect, it } from 'vitest';
import { hintTitle, nextAction } from './nextAction';
import type { PaymentContext } from './nextAction';

const ctx = (over: Partial<PaymentContext> = {}): PaymentContext => ({
  phase: 'Created',
  deliveredUnpaid: 0,
  waitingDelivery: 2,
  offered: 0,
  ...over,
});

describe('nextAction', () => {
  it('before activation the buyer activates the protected payment', () => {
    const a = nextAction('comprador', ctx({ phase: 'inactive' }));
    expect(a).toMatchObject({ mine: true, actor: 'comprador', action: 'Activar cobro protegido' });
  });

  it('after activation the buyer deposits', () => {
    const a = nextAction('comprador', ctx());
    expect(hintTitle('comprador', a)).toBe('Ahora te toca: Depositar pago');
  });

  it('other roles are told whose turn it is when the deposit is pending', () => {
    for (const role of ['proveedor', 'inversionista', 'coordinadora'] as const) {
      const a = nextAction(role, ctx());
      expect(a.mine).toBe(false);
      expect(hintTitle(role, a)).toBe('Ahora le toca al Comprador: Depositar pago');
    }
  });

  it('funded: the workshop delivers or asks for an advance', () => {
    const a = nextAction('proveedor', ctx({ phase: 'Funded' }));
    expect(a.mine).toBe(true);
    expect(a.action).toMatch(/adelanto/);
  });

  it('funded: the buyer waits until a workshop reports a delivery, then confirms', () => {
    const waiting = nextAction('comprador', ctx({ phase: 'Funded' }));
    expect(waiting).toMatchObject({ mine: false, actor: 'proveedor' });
    const ready = nextAction('comprador', ctx({ phase: 'Funded', deliveredUnpaid: 1 }));
    expect(hintTitle('comprador', ready)).toBe('Ahora te toca: Confirmar entrega y pagar');
  });

  it('funded: the investor acts only when an advance is offered', () => {
    expect(nextAction('inversionista', ctx({ phase: 'Funded' })).mine).toBe(false);
    expect(nextAction('inversionista', ctx({ phase: 'Funded', offered: 1 })).action).toBe('Comprar un adelanto');
  });

  it('funded: when every workshop already reported, the workshop waits for the buyer', () => {
    const a = nextAction('proveedor', ctx({ phase: 'Funded', waitingDelivery: 0, deliveredUnpaid: 2 }));
    expect(a).toMatchObject({ mine: false, actor: 'comprador' });
  });

  it('completed and refunded have no actor', () => {
    expect(nextAction('comprador', ctx({ phase: 'Completed' })).actor).toBeNull();
    expect(hintTitle('comprador', nextAction('comprador', ctx({ phase: 'Refunded' })))).toBe('Pago devuelto');
  });
});
