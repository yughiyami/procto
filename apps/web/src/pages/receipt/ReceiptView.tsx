import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button } from '@izumi/ui';
import { formatPen } from '@izumi/contracts';
import type { Order } from '@izumi/contracts';
import { useChainEvents, useChainOrder } from '../../hooks/useChainOrder';
import { PLATFORM_ACCOUNTS } from '../../stellar/platform';
import { CONTRACT_ID, explorerAccount, explorerContract, explorerTx, shortAddress, tokenByContract } from '../../stellar/config';
import { EVENT_LABELS, TX_LABELS } from '../../stellar/eventLabels';
import { orderPhase, shareState } from '../../stellar/shareStatus';
import { formatToken, tokenUnitsToPenCents } from '../../stellar/units';
import { verifyEvidence } from '../../store/domain';
import type { ChainTx } from '../../store/localStore';
import { TxConfirmation } from '../../components/TxConfirmation';
import './ReceiptPage.css';

type Props = {
  chainOrderId: string;
  /** Local order, when this browser knows it (adds the internal audit-chain check). */
  order?: Order;
  knownTxs?: ChainTx[];
};

type Row = { hash: string; label: string; at?: string; by?: string };

/** On-chain verification: every payment, every transaction hash, and what each party received. */
export function ReceiptView({ chainOrderId, order, knownTxs = [] }: Props) {
  const chain = useChainOrder(chainOrderId);
  const events = useChainEvents(chainOrderId);
  const [auditOk, setAuditOk] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    if (order) void verifyEvidence(order.events).then((ok) => alive && setAuditOk(ok));
    return () => {
      alive = false;
    };
  }, [order]);

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    for (const t of knownTxs) {
      const label = TX_LABELS[t.kind] ?? t.kind;
      map.set(t.hash, { hash: t.hash, label: t.shareIndex !== undefined ? `${label} (pago ${t.shareIndex + 1})` : label, at: t.at, by: t.by });
    }
    for (const e of events.data ?? []) {
      if (!map.has(e.hash)) map.set(e.hash, { hash: e.hash, label: EVENT_LABELS[e.kind] ?? e.kind, at: e.at });
    }
    return [...map.values()].sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));
  }, [knownTxs, events.data]);

  if (chain.isPending) return <p role="status">Consultando la red…</p>;
  const o = chain.data;
  if (!o) return <Alert tone="danger">No encontramos el pedido protegido número {chainOrderId} en la red.</Alert>;

  const status = o.status.tag;
  const phase = orderPhase(status);
  const token = tokenByContract(o.token);

  return (
    <div className="receipt">
      <section className="receipt__summary">
        <Badge tone={phase.tone}>{phase.label}</Badge>
        <dl>
          <div>
            <dt>Total del pedido</dt>
            <dd>
              {formatPen(tokenUnitsToPenCents(o.total))} <small>≈ {formatToken(o.total)} {token?.code ?? ''}</small>
            </dd>
          </div>
          <div>
            <dt>Ya pagado a los talleres</dt>
            <dd>{formatPen(tokenUnitsToPenCents(o.released))}</dd>
          </div>
          <div>
            <dt>Devuelto al comprador</dt>
            <dd>{formatPen(tokenUnitsToPenCents(o.refunded))}</dd>
          </div>
          <div>
            <dt>Comprador</dt>
            <dd>
              <a href={explorerAccount(o.buyer)} target="_blank" rel="noreferrer">
                {shortAddress(o.buyer)}
              </a>
            </dd>
          </div>
          <div>
            <dt>Plazo máximo</dt>
            <dd>{new Date(Number(o.deadline) * 1000).toLocaleDateString('es-PE', { dateStyle: 'long' })}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h2>Quién recibió qué</h2>
        <ul className="receipt__shares">
          {o.shares.map((s, i) => {
            const st = shareState(s, status);
            const advanced = s.owner !== s.supplier;
            const platformNote =
              s.supplier === PLATFORM_ACCOUNTS.impact
                ? '8% de nuestra comisión va a reforestación y comunidades andinas.'
                : s.supplier === PLATFORM_ACCOUNTS.treasury
                  ? 'Comisión de PROCTO por la venta cerrada.'
                  : null;
            return (
              <li key={i}>
                <div>
                  <strong>{s.label}</strong>
                  <span>
                    {formatPen(tokenUnitsToPenCents(s.amount))} <small>≈ {formatToken(s.amount)}</small>
                  </span>
                </div>
                <div>
                  <Badge tone={st.key === 'paid' ? 'success' : 'neutral'}>{st.label}</Badge>
                  <small>
                    {s.paid ? 'Pagado a ' : 'Cobrará '}
                    <a href={explorerAccount(s.owner)} target="_blank" rel="noreferrer">
                      {shortAddress(s.owner)}
                    </a>
                    {advanced && ' (inversionista que adelantó el pago)'}
                  </small>
                  {platformNote && <small className="receipt__platform">{platformNote}</small>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2>Comprobantes en la red Stellar</h2>
        {rows.length === 0 ? (
          <p>Todavía no hay movimientos visibles. Revisa el contrato directamente.</p>
        ) : (
          <ol className="receipt__txs">
            {rows.map((r) => (
              <li key={r.hash}>
                <span>{r.label}</span>
                <a href={explorerTx(r.hash)} target="_blank" rel="noreferrer">
                  {r.hash.slice(0, 10)}…{r.hash.slice(-6)}
                </a>
                {r.at && <small>{new Date(r.at).toLocaleString('es-PE')}</small>}
                <TxConfirmation hash={r.hash} />
              </li>
            ))}
          </ol>
        )}
        <p className="receipt__note">
          Cada enlace abre el registro público en stellar.expert. El contrato es{' '}
          <a href={explorerContract()} target="_blank" rel="noreferrer">
            {CONTRACT_ID.slice(0, 6)}…{CONTRACT_ID.slice(-4)}
          </a>
          .
        </p>
      </section>

      {order && (
        <Alert tone={auditOk === false ? 'danger' : 'info'} title="Registro interno del pedido">
          {auditOk === null
            ? 'Verificando…'
            : auditOk
              ? 'El historial de acciones del pedido (cotización, aceptación, entregas) está íntegro: ningún dato fue modificado.'
              : 'El historial interno no coincide con sus firmas. Alguien lo modificó.'}{' '}
          Este registro es interno; el pago verificable es el de la red Stellar.
        </Alert>
      )}
      <Button variant="secondary" onClick={() => window.print()}>
        Imprimir o guardar comprobante
      </Button>
    </div>
  );
}
