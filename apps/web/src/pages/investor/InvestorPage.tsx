import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button, EmptyState, PageHeader } from '@izumi/ui';
import { formatPen } from '@izumi/contracts';
import { store } from '../../lib/apiClient';
import { ConnectCard } from '../../components/ConnectCard';
import { useBalances } from '../../components/AccountPanel';
import { useChainAction } from '../../hooks/useChainAction';
import { useRefreshChain } from '../../hooks/useChainOrder';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useSession } from '../../session/SessionContext';
import { buyShare, listChainOrders } from '../../stellar/chain';
import { advanceQuote } from '../../stellar/factoring';
import { boughtBy, flattenShares, openOffers } from '../../stellar/shares';
import type { FlatShare } from '../../stellar/shares';
import { tokenUnitsToPenCents } from '../../stellar/units';
import './InvestorPage.css';

const pen = (units: bigint) => formatPen(tokenUnitsToPenCents(units));
const pct = (x: number) => `${x.toLocaleString('es-PE', { maximumFractionDigits: x >= 100 ? 0 : 1 })}%`;

function OfferCard({ share, balance, onBought }: { share: FlatShare; balance: number | null; onBought: (s: FlatShare, hash: string, sponsored: boolean) => void }) {
  const { run, busy } = useChainAction();
  const price = share.offerPrice!;
  const q = advanceQuote({ amount: share.amount, price, days: share.daysToDeadline });
  const key = `${share.orderId}-${share.index}`;
  const local = store.findLocalOrderByChainId(share.orderId);
  const short = balance !== null && balance < Number(price) / 1e7;

  async function buy() {
    const o = await run(`b-${key}`, (s, opt) => buyShare(s, share.orderId, share.index, opt), 'Adelanto financiado. Cobrarás cuando se confirme la entrega.');
    if (o) onBought(share, o.hash, o.sponsored);
  }

  return (
    <li className="inv-card">
      <div className="inv-card__head">
        <div>
          <strong>{local?.title ?? `Pedido protegido n.º ${share.orderId}`}</strong>
          <small>{share.label}</small>
        </div>
        <Badge tone="success">Pago ya depositado</Badge>
      </div>
      <dl className="inv-card__nums">
        <div>
          <dt>Tú pagas hoy</dt>
          <dd>{pen(price)}</dd>
        </div>
        <div>
          <dt>Recibes al confirmar la entrega</dt>
          <dd>{pen(share.amount)}</dd>
        </div>
        <div>
          <dt>Ganas</dt>
          <dd>
            {pen(q.profit)} <small>({pct(q.periodRate * 100)} en hasta {share.daysToDeadline} {share.daysToDeadline === 1 ? 'día' : 'días'})</small>
          </dd>
        </div>
        <div>
          <dt>Rendimiento anualizado</dt>
          <dd>≈ {pct(q.annualRate * 100)}</dd>
        </div>
      </dl>
      <p className="inv-card__guarantee">
        El pago del comprador ya está depositado en garantía; solo financias el tiempo de entrega. El riesgo que asumes es que el taller no
        entregue y el comprador no confirme antes del plazo.
      </p>
      {short && <Alert tone="warning">Tu saldo no alcanza para este adelanto. Carga saldo de prueba en Mi billetera.</Alert>}
      <div className="inv-card__actions">
        <Button onClick={() => void buy()} loading={busy === `b-${key}`}>
          Comprar este adelanto
        </Button>
        <Link to={`/comprobante/${share.orderId}`}>Ver comprobante</Link>
      </div>
    </li>
  );
}

export default function InvestorPage() {
  useDocumentTitle('Adelantos');
  const { connection } = useSession();
  const refresh = useRefreshChain();
  const balances = useBalances();
  const orders = useQuery({ queryKey: ['chain-orders'], queryFn: () => listChainOrders(30), refetchInterval: 15_000 });

  const flat = orders.data ? flattenShares(orders.data) : [];
  const offers = openOffers(flat, connection?.address);
  const mine = connection ? boughtBy(flat, connection.address) : [];

  function onBought(share: FlatShare, hash: string, sponsored: boolean) {
    const local = store.findLocalOrderByChainId(share.orderId);
    if (local && connection) {
      store.addChainTx(local.id, { kind: 'buy_share', hash, at: new Date().toISOString(), by: connection.address, shareIndex: share.index, sponsored });
    }
    refresh(share.orderId);
  }

  return (
    <div className="stack-page">
      <PageHeader
        title="Adelantos disponibles"
        subtitle="Talleres que piden cobrar antes. El pago ya está depositado; tú financias el tiempo de entrega."
      />
      {!connection && <ConnectCard reason="Conecta tu billetera para comprar adelantos." />}
      {orders.isPending ? (
        <p role="status">Buscando adelantos en la red…</p>
      ) : offers.length === 0 ? (
        <EmptyState
          title="No hay adelantos abiertos"
          description="Cuando un taller pida un adelanto sobre un pago ya depositado, aparecerá aquí."
        />
      ) : (
        <ul className="inv-list">
          {offers.map((s) => (
            <OfferCard key={`${s.orderId}-${s.index}`} share={s} balance={balances.data?.PUSD ?? null} onBought={onBought} />
          ))}
        </ul>
      )}
      {mine.length > 0 && (
        <section>
          <h2>Mis adelantos</h2>
          <ul className="inv-mine">
            {mine.map((s) => (
              <li key={`${s.orderId}-${s.index}`}>
                <span>
                  {s.label} · pedido n.º {s.orderId}
                </span>
                <span>
                  {pen(s.amount)} <Badge tone={s.paid ? 'success' : 'info'}>{s.paid ? 'Cobrado' : 'Esperando la confirmación de entrega'}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
