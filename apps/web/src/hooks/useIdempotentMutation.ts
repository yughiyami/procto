import { useMutation } from '@tanstack/react-query';
import type { UseMutationOptions, UseMutationResult } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { newIdempotencyKey } from '@izumi/api-client';

type IdempotentMutationFn<TVariables, TData> = (
  variables: TVariables,
  idempotencyKey: string,
) => Promise<TData>;

export type UseIdempotentMutationResult<TData, TVariables> = UseMutationResult<
  TData,
  unknown,
  TVariables
> & {
  /** Force a fresh idempotency key on the next call, abandoning the current intent. */
  resetIntent: () => void;
};

/**
 * Wraps useMutation so ONE idempotency key is generated per user intent and
 * reused across retries of that same intent — the server rejects a reused key
 * paired with a different body, so a retry must resend the identical body
 * under the identical key. The key only rotates after a success or an
 * explicit `resetIntent()` call (e.g. the user edits the form and tries a
 * genuinely new submission).
 */
export function useIdempotentMutation<TData, TVariables>(
  mutationFn: IdempotentMutationFn<TVariables, TData>,
  options?: Omit<UseMutationOptions<TData, unknown, TVariables>, 'mutationFn'>,
): UseIdempotentMutationResult<TData, TVariables> {
  const keyRef = useRef<string | null>(null);

  const getOrCreateKey = useCallback(() => {
    if (keyRef.current === null) {
      keyRef.current = newIdempotencyKey();
    }
    return keyRef.current;
  }, []);

  const resetIntent = useCallback(() => {
    keyRef.current = null;
  }, []);

  const mutation = useMutation<TData, unknown, TVariables>({
    ...options,
    mutationFn: (variables) => mutationFn(variables, getOrCreateKey()),
    // Forwarded via rest args so react-query can change the callback arity
    // between minor versions without breaking this wrapper.
    onSuccess: (...args: Parameters<NonNullable<NonNullable<typeof options>['onSuccess']>>) => {
      resetIntent();
      options?.onSuccess?.(...args);
    },
  });

  return { ...mutation, resetIntent };
}
