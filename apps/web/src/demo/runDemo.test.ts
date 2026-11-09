import { describe, expect, it, vi } from 'vitest';
import { runDemo } from './runDemo';
import type { DemoDeps, StepEvent } from './runDemo';
import type { DemoWallet } from './scenario';
import { FatalDemoError } from './retry';

const WALLETS: DemoWallet[] = [
  { slot: 'coordinadora', label: 'Coordinadora', role: 'coordinadora', address: 'GC', needsFunds: false },
  { slot: 'comprador', label: 'Comprador', role: 'comprador', address: 'GB', needsFunds: true },
  { slot: 'proveedor:a', label: 'Taller A', role: 'proveedor', workshopId: 'a', address: 'GA', needsFunds: false },
  { slot: 'inversionista', label: 'Inversionista', role: 'inversionista', address: 'GI', needsFunds: true },
];

function makeDeps(overrides: Partial<DemoDeps> = {}): DemoDeps {
  return {
    createWallets: vi.fn(async () => WALLETS),
    isPrepared: vi.fn(async () => false),
    prepare: vi.fn(async () => {}),
    needsFunds: vi.fn(async () => true),
    fund: vi.fn(async () => {}),
    findActiveOrder: vi.fn(async () => null),
    activateOrder: vi.fn(async () => 'order-1'),
    ...overrides,
  };
}

const fast = { sleep: async () => {}, attempts: 3 };

describe('runDemo', () => {
  it('runs the four steps in order and returns the order id', async () => {
    const events: StepEvent[] = [];
    const deps = makeDeps();
    const result = await runDemo(deps, (e) => events.push(e), fast);
    expect(result).toEqual({ orderId: 'order-1', wallets: WALLETS });
    const started = events.filter((e) => e.status === 'active').map((e) => e.step);
    expect(started).toEqual(['wallets', 'accounts', 'funds', 'order']);
    const done = events.filter((e) => e.status === 'done').map((e) => e.step);
    expect(done).toEqual(['wallets', 'accounts', 'funds', 'order']);
  });

  it('prepares every account and funds only the ones that hold money', async () => {
    const deps = makeDeps();
    await runDemo(deps, () => {}, fast);
    expect(deps.prepare).toHaveBeenCalledTimes(4);
    expect(deps.fund).toHaveBeenCalledTimes(2);
    expect((deps.fund as ReturnType<typeof vi.fn>).mock.calls.map((c) => (c[0] as DemoWallet).slot)).toEqual(['comprador', 'inversionista']);
  });

  it('is idempotent: skips prepared accounts, funded wallets and an already active order', async () => {
    const deps = makeDeps({
      isPrepared: vi.fn(async () => true),
      needsFunds: vi.fn(async () => false),
      findActiveOrder: vi.fn(async () => 'existing'),
    });
    const result = await runDemo(deps, () => {}, fast);
    expect(result.orderId).toBe('existing');
    expect(deps.prepare).not.toHaveBeenCalled();
    expect(deps.fund).not.toHaveBeenCalled();
    expect(deps.activateOrder).not.toHaveBeenCalled();
  });

  it('retries a step that fails because the network lags', async () => {
    let calls = 0;
    const deps = makeDeps({
      prepare: vi.fn(async (w: DemoWallet) => {
        if (w.slot === 'comprador' && ++calls < 3) throw new Error('account not found');
      }),
    });
    await expect(runDemo(deps, () => {}, fast)).resolves.toMatchObject({ orderId: 'order-1' });
    expect(calls).toBe(3);
  });

  it('reports the failing step and rethrows when retries are exhausted', async () => {
    const events: StepEvent[] = [];
    const deps = makeDeps({
      activateOrder: vi.fn(async () => {
        throw new Error('rpc down');
      }),
    });
    await expect(runDemo(deps, (e) => events.push(e), fast)).rejects.toThrow('rpc down');
    const last = events[events.length - 1]!;
    expect(last).toMatchObject({ step: 'order', status: 'error' });
    expect(deps.activateOrder).toHaveBeenCalledTimes(3);
  });

  it('does not retry fatal errors', async () => {
    const deps = makeDeps({
      createWallets: vi.fn(async () => {
        throw new FatalDemoError('order missing');
      }),
    });
    await expect(runDemo(deps, () => {}, fast)).rejects.toBeInstanceOf(FatalDemoError);
    expect(deps.createWallets).toHaveBeenCalledTimes(1);
  });

  it('reports per-account progress while preparing', async () => {
    const events: StepEvent[] = [];
    await runDemo(makeDeps(), (e) => events.push(e), fast);
    const progress = events.filter(
      (e): e is Extract<StepEvent, { status: 'progress' }> => e.step === 'accounts' && e.status === 'progress',
    );
    expect(progress.map((e) => e.done)).toEqual([1, 2, 3, 4]);
    expect(progress[0]!.total).toBe(4);
  });
});
