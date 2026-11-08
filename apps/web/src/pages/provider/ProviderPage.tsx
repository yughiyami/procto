import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, EmptyState, PageHeader } from '@izumi/ui';
import { formatPen } from '@izumi/contracts';
import { apiClient, store } from '../../lib/apiClient';
import { ConnectCard } from '../../components/ConnectCard';
import { useChainAction } from '../../hooks/useChainAction';
import { useRefreshChain } from '../../hooks/useChainOrder';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useSession } from '../../session/SessionContext';
import { cancelOffer, listChainOrders, markDelivered, offerShare } from '../../stellar/chain';
import type { TxOutcome } from '../../stellar/chain';
import { advanceQuote } from '../../stellar/factoring';
import { flattenShares, mineAsSupplier } from '../../stellar/shares';
import type { FlatShare } from '../../stellar/shares';
import { tokenUnitsToPenCents } from '../../stellar/units';
import type { ChainTxKind } from '../../store/localStore';
import './ProviderPage.css';

const RATIOS = [95, 96, 97] as const;
const pen = (units: bigint) => formatPen(tokenUnitsToPenCents(units));

function ShareCard({ share, onTx }: { share: FlatShare; onTx: (kind: ChainTxKind, outcome: TxOutcome, share: FlatShare) => void }) {
  const { run, busy } = useChainAction();
  const [ratio, setRatio] = useState<number>(96);
  const [asking, setAsking] = useState(false);
  const localOrder = store.findLocalOrderByChainId(share.orderId);
  const price = (share.amount * BigInt(ratio)) / 100n;
  const quote = advanceQuote({ amount: share.amount, price, days: share.daysToDeadline });
  const soldAdvance = share.owner !== share.supplier;
  const key = `${share.orderId}-${share.index}`;
  const canAct = share.status === 'Funded' && !share.paid && !soldAdvance;

  async function deliver() {
    const o = await run(`d-${key}`, (s, opt) => markDelivered(s, share.orderId, share.index, opt), 'Avisaste que entregaste.');
    if (o) onTx('mark_delivered', o, share);
  }
  async function ask() {
    const o = await run(`o-${key}`, (s, opt) => offerShare(s, share.orderId, share.index, price, opt), 'Pediste tu adelanto.');
    if (o) {
      setAsking(false);
      onTx('offer_share', o, share);
    }
  }
  async function cancel() {
    const o = await run(`c-${key}`, (s, opt) => cancelOffer(s, share.orderId, share.index, opt), 'Cancelaste el adelanto.');
    if (o) onTx('cancel_offer', o, share);
  }

  return (
    <li className="prov-card">
      <div className="prov-card__head">
        <div>
          <strong>{localOrder?.title ?? `Pedido protegido n.º ${share.orderId}`}</strong>
          <small>{share.label}</small>
        </div>
        <Badge tone={share.paid ? 'success' : share.state.key === 'escrow' || share.state.key === 'delivered' ? 'info' : 'neutral'}>
          {soldAdvance && !share.paid ? 'Cobrado por adelantado' : share.state.label}
        </Badge>
      </div>
      <p className="prov-card__amount">{pen(share.amount)}</p>
      <p className="prov-card__hint">
        {share.paid
          ? 'Este pago ya llegó a tu cuenta.'
          : share.status === 'Created'
            ? 'El comprador aún no deposita el pago.'
            : soldAdvance
              ? 'Un inversionista te adelantó este pago. No necesitas hacer nada más.'
              : 'El pago ya está depositado en garantía. Se libera cuando el comprador confirma tu entrega.'}
      </p>
      {canAct && (
        <div className="prov-card__actions">
          {!share.delivered && (
            <Button size="sm" variant="secondary" onClick={() => void deliver()} loading={busy === `d-${key}`}>
              Marcar como entregado
            </Button>
          )}
          {share.offerPrice === undefined ? (
            <Button size="sm" onClick={() => setAsking((v) => !v)} aria-expanded={asking}>
              Pedir adelanto
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => void cancel()} loading={busy === `c-${key}`}>
              Cancelar adelanto ({pen(share.offerPrice)})
            </Button>
          )}
        </div>
      )}
      {canAct && asking && share.offerPrice === undefined && (
        <div className="prov-advance">
          <fieldset>
            <legend>¿Cuánto del pago aceptas recibir hoy?</legend>
            <div className="prov-advance__ratios">
              {RATIOS.map((r) => (
                <label key={r} data-on={ratio === r}>
                  <input type="radio" name={`r-${key}`} checked={ratio === r} onChange={() => setRatio(r)} />
                  {r}%
                </label>
              ))}
            </div>
          </fieldset>
          <p className="prov-advance__result">
            Recibes <strong>{pen(price)}</strong> hoy en vez de <strong>{pen(share.amount)}</strong> en {share.daysToDeadline}{' '}
            {share.daysToDeadline === 1 ? 'día' : 'días'}.
          </p>
          <p className="prov-card__hint">
            Cedes {quote.discountPct.toFixed(0)}% ({pen(quote.profit)}) a quien adelante el pago. Si el comprador confirma antes, cobras
            igual al instante: el adelanto no cambia lo que paga el comprador.
          </p>
          <Button onClick={() => void ask()} loading={busy === `o-${key}`}>
            Publicar mi adelanto
          </Button>
        </div>
      )}
      <p className="prov-card__links">
        <Link to={`/comprobante/${share.orderId}`}>Ver comprobante</Link>
      </p>
    </li>
  );
}

export default function ProviderPage() {
  useDocumentTitle('Mis cobros');
  const { connection, workshopId, setWorkshopId } = useSession();
  const refresh = useRefreshChain();
  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: apiClient.listSuppliers });
  const orders = useQuery({ queryKey: ['chain-orders'], queryFn: () => listChainOrders(30), refetchInterval: 15_000 });

  // The wallet slot is keyed by workshop, so pin a workshop as soon as the list is known.
  useEffect(() => {
    if (!workshopId && suppliers.data?.[0]) setWorkshopId(suppliers.data[0].id);
  }, [workshopId, suppliers.data, setWorkshopId]);

  const mine = connection && orders.data ? mineAsSupplier(flattenShares(orders.data), connection.address) : [];

  function onTx(kind: ChainTxKind, outcome: TxOutcome, share: FlatShare) {
    const local = store.findLocalOrderByChainId(share.orderId);
    if (local && connection) {
      store.addChainTx(local.id, { kind, hash: outcome.hash, at: new Date().toISOString(), by: connection.address, shareIndex: share.index, sponsored: outcome.sponsored });
    }
    refresh(share.orderId);
  }

  return (
    <div className="stack-page">
      <PageHeader title="Mis cobros" subtitle="Lo que te deben, lo que ya cobraste y cómo cobrar antes." />
      {(suppliers.data?.length ?? 0) > 0 && (
        <label className="prov-who">
          Estás actuando como
          <select value={workshopId ?? suppliers.data![0]!.id} onChange={(e) => setWorkshopId(e.target.value)}>
            {suppliers.data!.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {!connection ? (
        <ConnectCard reason="Conecta la billetera de tu taller para ver tus cobros." />
      ) : orders.isPending ? (
        <p role="status">Buscando tus cobros en la red…</p>
      ) : mine.length === 0 ? (
        <EmptyState
          title="Aún no tienes cobros"
          description="Cuando una coordinadora active un cobro protegido con tu cuenta, aparecerá aquí."
        />
      ) : (
        <ul className="prov-list">
          {mine.map((s) => (
            <ShareCard key={`${s.orderId}-${s.index}`} share={s} onTx={onTx} />
          ))}
        </ul>
      )}
      <Alert tone="info" title="¿Cómo cobras?">
        La coordinadora te asigna tu parte, el comprador deposita el pago y, al confirmar tu entrega, el dinero llega directo a tu
        cuenta. Si necesitas el dinero antes, pide un adelanto.
      </Alert>
    </div>
  );
}
