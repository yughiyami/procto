import { HORIZON_URL } from './config';

export type TxConfirmation = {
  successful: boolean;
  ledger: number;
  /** ISO timestamp of the ledger that closed the transaction. */
  confirmedAt: string;
  /** True when a different account than the sender paid the network fee (PROCTO sponsors it). */
  feePaidByPlatform: boolean;
};

export const horizonTxUrl = (hash: string) => `${HORIZON_URL}/transactions/${hash}`;

/** Maps a Horizon `/transactions/<hash>` record to what the badge needs. Throws on a malformed body. */
export function mapHorizonTx(body: unknown): TxConfirmation {
  const tx = body as {
    successful?: unknown;
    ledger?: unknown;
    created_at?: unknown;
    source_account?: unknown;
    fee_account?: unknown;
  } | null;
  if (!tx || typeof tx.successful !== 'boolean' || typeof tx.ledger !== 'number' || typeof tx.created_at !== 'string') {
    throw new Error('Unexpected Horizon transaction record');
  }
  const feeAccount = typeof tx.fee_account === 'string' ? tx.fee_account : null;
  const source = typeof tx.source_account === 'string' ? tx.source_account : null;
  return {
    successful: tx.successful,
    ledger: tx.ledger,
    confirmedAt: tx.created_at,
    feePaidByPlatform: Boolean(feeAccount && source && feeAccount !== source),
  };
}

/** Date and time in Spanish (Peru), always in Lima time so everyone sees the same moment. */
export function formatConfirmedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('es-PE', { timeZone: 'America/Lima' });
}

/** null = Horizon does not know the transaction yet (it lags a few seconds behind the network). */
export async function fetchTxConfirmation(hash: string, fetchImpl: typeof fetch = fetch): Promise<TxConfirmation | null> {
  const response = await fetchImpl(horizonTxUrl(hash));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Horizon ${response.status}`);
  return mapHorizonTx(await response.json());
}
