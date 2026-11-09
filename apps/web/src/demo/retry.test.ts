import { describe, expect, it, vi } from 'vitest';
import { FatalDemoError, backoffDelay, isRetryable, withRetry } from './retry';

describe('backoffDelay', () => {
  it('doubles each retry and caps at maxMs', () => {
    expect([0, 1, 2, 3, 4, 5].map((n) => backoffDelay(n, 500, 4000))).toEqual([500, 1000, 2000, 4000, 4000, 4000]);
  });
});

describe('withRetry', () => {
  it('returns the first successful result without sleeping', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    await expect(withRetry(async () => 'ok', { sleep })).resolves.toBe('ok');
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries transient failures with exponential backoff', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('account not found');
        return 'ready';
      },
      { attempts: 5, baseMs: 100, sleep },
    );
    expect(result).toBe('ready');
    expect(calls).toBe(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([100, 200]);
  });

  it('gives up after the configured attempts and throws the last error', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error(`boom ${calls}`);
        },
        { attempts: 3, sleep },
      ),
    ).rejects.toThrow('boom 3');
    expect(calls).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('does not retry fatal errors', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new FatalDemoError('stop');
        },
        { sleep },
      ),
    ).rejects.toBeInstanceOf(FatalDemoError);
    expect(calls).toBe(1);
    expect(isRetryable(new FatalDemoError('x'))).toBe(false);
    expect(isRetryable(new Error('x'))).toBe(true);
  });

  it('reports each retry to onRetry', async () => {
    const onRetry = vi.fn();
    let calls = 0;
    await withRetry(
      async () => {
        if (++calls < 2) throw new Error('lag');
      },
      { sleep: async () => {}, onRetry },
    );
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]![1]).toBe(1);
  });
});
