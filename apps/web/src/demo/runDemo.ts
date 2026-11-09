/**
 * Orchestrates the one-tap demo. All side effects come in through `DemoDeps`, so the
 * ordering, parallelism, idempotency and retry behaviour are unit-tested with fakes.
 */
import { withRetry } from './retry';
import type { RetryOptions } from './retry';
import type { DemoWallet, StepId } from './scenario';

export type DemoDeps = {
  /** Seeds the demo order if needed and creates (or reuses) one quick wallet per actor. */
  createWallets: () => Promise<DemoWallet[]>;
  /** True when the account exists and already trusts the demo token. */
  isPrepared: (wallet: DemoWallet) => Promise<boolean>;
  /** Friendbot + trustline (fees sponsored). */
  prepare: (wallet: DemoWallet) => Promise<void>;
  needsFunds: (wallet: DemoWallet) => Promise<boolean>;
  /** Mints demo money through the faucet. */
  fund: (wallet: DemoWallet) => Promise<void>;
  /** Local order id when the protected payment is already live on the contract. */
  findActiveOrder: (wallets: DemoWallet[]) => Promise<string | null>;
  /** Accepts the quote if needed and creates the protected payment. Returns the local order id. */
  activateOrder: (wallets: DemoWallet[]) => Promise<string>;
};

export type StepEvent =
  | { step: StepId; status: 'active' | 'done' }
  | { step: StepId; status: 'progress'; done: number; total: number }
  | { step: StepId; status: 'retrying'; retry: number }
  | { step: StepId; status: 'error'; error: unknown };

export type DemoResult = { orderId: string; wallets: DemoWallet[] };

export async function runDemo(
  deps: DemoDeps,
  onEvent: (event: StepEvent) => void,
  retry: RetryOptions = {},
): Promise<DemoResult> {
  const attempt = <T>(step: StepId, fn: () => Promise<T>) =>
    withRetry(fn, { ...retry, onRetry: (_e, n) => onEvent({ step, status: 'retrying', retry: n }) });

  /** Runs one task per wallet in parallel and reports how many are finished. */
  async function inParallel(step: StepId, wallets: DemoWallet[], task: (w: DemoWallet) => Promise<void>) {
    let done = 0;
    await Promise.all(
      wallets.map(async (w) => {
        await attempt(step, () => task(w));
        onEvent({ step, status: 'progress', done: ++done, total: wallets.length });
      }),
    );
  }

  async function stage<T>(step: StepId, fn: () => Promise<T>): Promise<T> {
    onEvent({ step, status: 'active' });
    try {
      const value = await fn();
      onEvent({ step, status: 'done' });
      return value;
    } catch (error) {
      onEvent({ step, status: 'error', error });
      throw error;
    }
  }

  const wallets = await stage('wallets', () => attempt('wallets', () => deps.createWallets()));

  await stage('accounts', () =>
    inParallel('accounts', wallets, async (w) => {
      if (!(await deps.isPrepared(w))) await deps.prepare(w);
    }),
  );

  // Funding needs the trustline from the previous step, so it runs after it (parallel per account).
  await stage('funds', () =>
    inParallel(
      'funds',
      wallets.filter((w) => w.needsFunds),
      async (w) => {
        if (await deps.needsFunds(w)) await deps.fund(w);
      },
    ),
  );

  const orderId = await stage('order', () =>
    attempt('order', async () => (await deps.findActiveOrder(wallets)) ?? (await deps.activateOrder(wallets))),
  );

  return { orderId, wallets };
}
