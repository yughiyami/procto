import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@izumi/ui';
import { explorerTx } from '../stellar/config';
import { fetchTxConfirmation, formatConfirmedAt, horizonTxUrl } from '../stellar/txConfirmation';
import './TxConfirmation.css';

const MAX_ATTEMPTS = 8;

/** Live "Confirmado por Horizon" badge for one transaction hash. Confirmed results are cached for the session. */
export function TxConfirmation({ hash }: { hash: string }) {
  const attempts = useRef(0);
  const query = useQuery({
    queryKey: ['tx-confirmation', hash],
    queryFn: () => {
      attempts.current += 1;
      return fetchTxConfirmation(hash);
    },
    // A confirmed record never changes; otherwise keep asking every few seconds for a while.
    staleTime: (q) => (q.state.data ? Infinity : 0),
    refetchInterval: (q) => (q.state.data || attempts.current >= MAX_ATTEMPTS ? false : 4_000),
    retry: 1,
  });
  const tx = query.data;
  const gaveUp = !tx && !query.isFetching && (query.isError || attempts.current >= MAX_ATTEMPTS);

  return (
    <div className="txc" data-state={tx ? (tx.successful ? 'ok' : 'failed') : gaveUp ? 'unknown' : 'pending'}>
      {tx ? (
        <>
          <Badge tone={tx.successful ? 'success' : 'danger'}>{tx.successful ? '✓ Confirmado por Horizon' : 'La red rechazó este movimiento'}</Badge>
          <span className="txc__meta">
            Registro n.º {tx.ledger.toLocaleString('es-PE')} · {formatConfirmedAt(tx.confirmedAt)}
          </span>
          {tx.feePaidByPlatform ? <span className="txc__meta">Comisión pagada por PROCTO</span> : null}
        </>
      ) : gaveUp ? (
        <>
          <Badge tone="warning">No pudimos confirmarlo ahora</Badge>
          <button type="button" className="txc__retry" onClick={() => {
              attempts.current = 0;
              void query.refetch();
            }}>
            Reintentar
          </button>
        </>
      ) : (
        <Badge tone="info">Confirmando…</Badge>
      )}
      <span className="txc__links">
        <a href={explorerTx(hash)} target="_blank" rel="noreferrer">
          Ver en stellar.expert
        </a>
        <a href={horizonTxUrl(hash)} target="_blank" rel="noreferrer">
          Ver en Horizon
        </a>
      </span>
    </div>
  );
}
