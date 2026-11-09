import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button } from '@izumi/ui';
import { formatPen } from '@izumi/contracts';
import type { Order } from '@izumi/contracts';
import { store } from '../../../lib/apiClient';
import { useBalances } from '../../../components/AccountPanel';
import { useChainAction } from '../../../hooks/useChainAction';
import { useChainEvents, useChainOrder, useRefreshChain } from '../../../hooks/useChainOrder';
import { useStore } from '../../../hooks/useStore';
import { useSession } from '../../../session/SessionContext';
import { confirmDelivery, fundChainOrder } from '../../../stellar/chain';
import type { TxOutcome } from '../../../stellar/chain';
import { TxConfirmation } from '../../../components/TxConfirmation';
import { explorerContract, explorerTx, shortAddress } from '../../../stellar/config';
import { PLATFORM_ACCOUNTS } from '../../../stellar/platform';
import type { ChainTxKind } from '../../../store/localStore';
import { orderPhase, shareState } from '../../../stellar/shareStatus';
import { formatToken, tokenUnitsToPenCents } from '../../../stellar/units';
import { EVENT_LABELS } from '../../../stellar/eventLabels';
import { RoleHint } from '../../../tour/RoleHint';

const TONE = { pending: 'neutral', escrow: 'info', delivered: 'warning', offered: 'warning', paid: 'success', refunded: 'neutral' } as const;

/** Live state of the protected payment, read from the contract, with the buyer's actions. */
export function LivePayment({ order }: { order: Order }) {
  const s = useStore();
  const link = s.getChain(order.id)!;
  const { signer, role, setRole } = useSession();
  const { run, busy } = useChainAction();
  const chain = useChainOrder(link.chainOrderId);
  // The event scan is slow on the public RPC, so it only runs once the timeline is opened.
  const [timelineOpen, setTimelineOpen] = useState(false);
  const events = useChainEvents(link.chainOrderId, timelineOpen);
  const refresh = useRefreshChain();
  const balances = useBalances();

  const chainOrder = chain.data;
  const status = chainOrder?.status.tag;
  const isBuyer = signer?.address === link.buyer;
  const total = chainOrder?.total ?? BigInt(link.shares.reduce((t, x) => t + BigInt(x.amountUnits), 0n));

  function record(kind: ChainTxKind, outcome: TxOutcome, shareIndex?: number) {
    store.addChainTx(order.id, {
      kind,
      hash: outcome.hash,
      at: new Date().toISOString(),
      by: signer!.address,
      shareIndex,
      sponsored: outcome.sponsored,
    });
    refresh(link.chainOrderId);
  }

  async function fund() {
    const outcome = await run('fund', (sg, o) => fundChainOrder(sg, link.chainOrderId, o), 'Pago depositado en garantía.');
    if (outcome) record('fund', outcome);
  }
  async function pay(index: number) {
    const outcome = await run(
      `pay-${index}`,
      (sg, o) => confirmDelivery(sg, link.chainOrderId, index, o),
      'Entrega confirmada y pago enviado.',
    );
    if (outcome) record('confirm_delivery', outcome, index);
  }

  if (chain.isPending) return <p role="status">Consultando el estado en la red…</p>;
  if (!chainOrder || !status) return <Alert tone="warning">No pudimos leer el pedido protegido. Reintenta en unos segundos.</Alert>;

  const phase = orderPhase(status);
  const tx = (kind: ChainTxKind, index?: number) => link.txs.find((t) => t.kind === kind && (index === undefined || t.shareIndex === index));
  const buyerBalance = balances.data?.PUSD ?? null;
  const needed = Number(total) / 1e7;

  return (
    <div className="pp-live">
      <RoleHint
        context={{
          phase: status,
          deliveredUnpaid: chainOrder.shares.filter((x) => !x.paid && !x.refunded && x.delivered).length,
          waitingDelivery: chainOrder.shares.filter((x) => !x.paid && !x.refunded && !x.delivered && x.offer_price == null).length,
          offered: chainOrder.shares.filter((x) => !x.paid && x.offer_price != null).length,
        }}
      />
      <div className="pp-live__head">
        <Badge tone={phase.tone}>{phase.label}</Badge>
        <span>
          Total {formatPen(tokenUnitsToPenCents(total))} <small>≈ {formatToken(total)} USD</small>
        </span>
      </div>

      {status === 'Created' && (
        <div className="pp-step" data-tour="deposit">
          <h4>Depositar pago</h4>
          <p>El comprador deposita el total. Nadie puede tocar ese dinero hasta que se confirme cada entrega.</p>
          {!isBuyer ? (
            <Alert tone="info">
              Conecta la billetera del comprador ({shortAddress(link.buyer)}).{' '}
              {role !== 'comprador' && (
                <button type="button" className="pp-linkbtn" onClick={() => setRole('comprador')}>
                  Cambiar a Comprador
                </button>
              )}
            </Alert>
          ) : (
            <>
              {buyerBalance !== null && buyerBalance < needed && (
                <Alert tone="warning">
                  Tu saldo ({buyerBalance.toLocaleString('es-PE')}) no alcanza. Carga saldo de prueba en <Link to="/cuenta">Mi billetera</Link>.
                </Alert>
              )}
              <Button onClick={() => void fund()} loading={busy === 'fund'}>
                Depositar pago
              </Button>
            </>
          )}
        </div>
      )}

      <ul className="pp-shares" data-tour="shares">
        {chainOrder.shares.map((share, i) => {
          const st = shareState(share, status);
          const meta = link.shares[i];
          const paidTx = tx('confirm_delivery', i);
          const soldToInvestor = share.owner !== share.supplier;
          const isImpact = share.supplier === PLATFORM_ACCOUNTS.impact;
          const isPlatform = isImpact || share.supplier === PLATFORM_ACCOUNTS.treasury;
          return (
            <li key={i}>
              <div className="pp-shares__main">
                <strong>{share.label}</strong>
                <span>
                  {formatPen(tokenUnitsToPenCents(share.amount))} <small>≈ {formatToken(share.amount)} USD</small>
                </span>
                <small>
                  {isImpact
                    ? '8% de nuestra comisión va a reforestación y comunidades andinas · '
                    : isPlatform
                      ? 'Comisión de PROCTO por la venta cerrada · '
                      : ''}
                  Cobra en la cuenta {shortAddress(share.supplier)}
                  {soldToInvestor && ` · adelanto: ahora cobra ${shortAddress(share.owner)}`}
                  {meta && meta.address !== share.supplier ? '' : ''}
                </small>
              </div>
              <div className="pp-shares__side">
                <Badge tone={TONE[st.key]}>{st.label}</Badge>
                {share.paid && paidTx && (
                  <a href={explorerTx(paidTx.hash)} target="_blank" rel="noreferrer">
                    Ver comprobante
                  </a>
                )}
                {status === 'Funded' && !share.paid && isBuyer && (
                  <Button size="sm" onClick={() => void pay(i)} loading={busy === `pay-${i}`}>
                    {isPlatform ? 'Liberar comisión' : 'Confirmar entrega y pagar'}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {status === 'Funded' && !isBuyer && <p className="pp-note">Solo el comprador ({shortAddress(link.buyer)}) confirma las entregas.</p>}

      <p className="pp-links" data-tour="receipt">
        <Link to={`/orders/${order.id}/comprobante`}>Ver comprobante verificable</Link>
        {' · '}
        <a href={explorerContract()} target="_blank" rel="noreferrer">
          Ver en la red Stellar
        </a>
      </p>

      <details className="pp-timeline" onToggle={(e) => setTimelineOpen(e.currentTarget.open)}>
        <summary>Historial en la red</summary>
        {events.isPending ? (
          <p>Cargando…</p>
        ) : (events.data?.length ?? 0) === 0 ? (
          <p>Aún no hay eventos visibles. Los comprobantes de cada paso siguen disponibles en el enlace de arriba.</p>
        ) : (
          <ol>
            {events.data!.map((e, i) => (
              <li key={`${e.hash}-${i}`}>
                {EVENT_LABELS[e.kind] ?? e.kind} ·{' '}
                <a href={explorerTx(e.hash)} target="_blank" rel="noreferrer">
                  {new Date(e.at).toLocaleString('es-PE')}
                </a>
                <TxConfirmation hash={e.hash} />
              </li>
            ))}
          </ol>
        )}
      </details>
    </div>
  );
}
