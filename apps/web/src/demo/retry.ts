/** Retry with exponential backoff, for a testnet whose RPC and Horizon lag a ledger or two behind. */

/** Marks an error that retrying cannot fix (for example a quote that is no longer valid). */
export class FatalDemoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FatalDemoError';
  }
}

export const isRetryable = (error: unknown): boolean => !(error instanceof FatalDemoError);

export type RetryOptions = {
  /** Total tries, including the first one. */
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
  shouldRetry?: (error: unknown) => boolean;
  /** Called before each wait with the error, the retry number (1-based) and the delay. */
  onRetry?: (error: unknown, retry: number, delayMs: number) => void;
};

export const backoffDelay = (retryIndex: number, baseMs: number, maxMs: number): number =>
  Math.min(maxMs, baseMs * 2 ** retryIndex);

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { attempts = 5, baseMs = 800, maxMs = 8000, sleep = realSleep, shouldRetry = isRetryable, onRetry } = options;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !shouldRetry(error)) throw error;
      const delay = backoffDelay(attempt - 1, baseMs, maxMs);
      onRetry?.(error, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastError;
}
