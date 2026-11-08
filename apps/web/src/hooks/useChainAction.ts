import { useCallback, useState } from 'react';
import { useToast } from '@izumi/ui';
import { useSession } from '../session/SessionContext';
import type { Signer } from '../stellar/signer';
import { friendlyError } from '../stellar/errors';
import type { ExecuteOptions, TxOutcome } from '../stellar/chain';

/**
 * Runs a signed network action for the connected wallet: tracks the busy key, shows a
 * plain-language success/error toast, and tells the user when fees could not be sponsored.
 */
export function useChainAction() {
  const { signer } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(
    async (
      key: string,
      action: (signer: Signer, options: ExecuteOptions) => Promise<TxOutcome>,
      successMessage: string,
      overrideSigner?: Signer | null,
    ): Promise<TxOutcome | null> => {
      const active = overrideSigner ?? signer;
      if (!active) {
        toast.show({ tone: 'warning', message: 'Primero conecta tu billetera.' });
        return null;
      }
      setBusy(key);
      try {
        const outcome = await action(active, {
          onFallback: (message) => toast.show({ tone: 'warning', message, durationMs: 8000 }),
        });
        toast.show({ tone: 'success', message: successMessage });
        return outcome;
      } catch (error) {
        toast.show({ tone: 'danger', message: friendlyError(error), durationMs: 8000 });
        return null;
      } finally {
        setBusy(null);
      }
    },
    [signer, toast],
  );

  return { run, busy, signer };
}
