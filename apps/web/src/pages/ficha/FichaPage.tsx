import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { StrKey } from '@stellar/stellar-sdk';
import { Alert, Badge, Button, ProctoMark } from '@izumi/ui';
import { formatPen } from '@izumi/contracts';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useStore } from '../../hooks/useStore';
import { scoreSupplier, LEVELS } from '../../reputation/score';
import type { ScoredShare } from '../../reputation/score';
import { listChainOrders } from '../../stellar/chain';
import { explorerAccount, explorerContract, shortAddress } from '../../stellar/config';
import { flattenShares } from '../../stellar/shares';
import { tokenUnitsToPenCents } from '../../stellar/units';
import './FichaPage.css';

const TONE = { 'sin-historial': 'neutral', bronce: 'warning', plata: 'info', oro: 'success' } as const;

/** /ficha/:address: public, shareable fulfilment record computed from the contract, never from self-reported data. */
export default function FichaPage() {
  const { address = '' } = useParams<{ address: string }>();
  const store = useStore();
  const [copied, setCopied] = useState(false);
  const valid = StrKey.isValidEd25519PublicKey(address);
  const orders = useQuery({ queryKey: ['chain-orders', 'ficha'], queryFn: () => listChainOrders(60), enabled: valid });

  const name = Object.entries(store.state.supplierWallets)
    .map(([id, wallet]) => (wallet === address ? store.state.suppliers.find((s) => s.id === id)?.name : undefined))
    .find(Boolean);
  useDocumentTitle(name ? `Ficha de cumplimiento de ${name}` : 'Ficha de cumplimiento');

  const shares: ScoredShare[] = flattenShares(orders.data ?? []).map((s) => ({
    orderId: s.orderId,
    supplier: s.supplier,
    owner: s.owner,
    amount: s.amount,
    delivered: s.delivered,
    paid: s.paid,
    refunded: s.refunded,
    offered: s.offerPrice !== undefined,
  }));
  const score = scoreSupplier(address, shares);
  const orderIds = [...new Set(shares.filter((s) => s.supplier === address).map((s) => s.orderId))];

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked; the address bar still has the link.
    }
  }

  return (
    <div className="ficha">
      <header className="ficha__bar">
        <Link to="/" className="ficha__brand" aria-label="PROCTO, inicio">
          <ProctoMark size={26} />
          <span>PROCTO</span>
        </Link>
        <Link to="/demo" className="ficha__cta">
          Probar la demo
        </Link>
      </header>

      {!valid ? (
        <Alert tone="warning" title="Esta dirección no es válida">
          Revisa el enlace que te compartieron. Una ficha se abre con la dirección de la cuenta del taller.
        </Alert>
      ) : (
        <>
          <section className="ficha__head" aria-labelledby="ficha-title">
            <p className="ficha__kicker">Ficha de cumplimiento</p>
            <h1 id="ficha-title">{name ?? `Cuenta ${shortAddress(address)}`}</h1>
            <p className="ficha__addr">
              <code>{address}</code>
            </p>
            <div className="ficha__badge" data-level={score.level.id}>
              <Badge tone={TONE[score.level.id]}>{score.level.label}</Badge>
              <span>{score.level.rule}</span>
            </div>
            <div className="ficha__actions">
              <Button size="sm" variant="secondary" onClick={() => void copy()}>
                {copied ? 'Enlace copiado' : 'Copiar enlace de la ficha'}
              </Button>
              <a href={explorerAccount(address)} target="_blank" rel="noreferrer">
                Ver la cuenta en la red Stellar
              </a>
            </div>
          </section>

          {orders.isPending && <p role="status">Leyendo los cobros registrados en la red…</p>}
          {orders.isError && <Alert tone="warning">No pudimos leer la red ahora. Vuelve a abrir esta ficha en unos segundos.</Alert>}

          {orders.data && (
            <>
              <dl className="ficha__stats">
                <div>
                  <dt>Cobros completados</dt>
                  <dd>{score.paid}</dd>
                </div>
                <div>
                  <dt>Entregas a tiempo</dt>
                  <dd>{score.deliveredOnTime}</dd>
                </div>
                <div>
                  <dt>Cumplimiento</dt>
                  <dd>{score.fulfilmentRate === null ? 'Sin datos' : `${Math.round(score.fulfilmentRate * 100)}%`}</dd>
                </div>
                <div>
                  <dt>Volumen cobrado</dt>
                  <dd>{formatPen(tokenUnitsToPenCents(score.volumeUnits))}</dd>
                </div>
                <div>
                  <dt>Adelantos vendidos</dt>
                  <dd>
                    {score.advancesSold} <small>({score.advancesHonored} cumplidos)</small>
                  </dd>
                </div>
                <div>
                  <dt>En curso</dt>
                  <dd>{score.pending}</dd>
                </div>
              </dl>

              {score.sharesTotal === 0 && (
                <Alert tone="info" title="Todavía no hay historial">
                  Esta cuenta no figura como taller en ningún cobro protegido. La ficha se llena sola con cada pedido que se cobra.
                </Alert>
              )}

              {score.next && (
                <p className="ficha__next">
                  Próximo nivel: <strong>{score.next.level.label}</strong>.{' '}
                  {score.next.missingPaid > 0 ? `Faltan ${score.next.missingPaid} cobros completados. ` : ''}
                  {score.next.level.rule}
                </p>
              )}

              <section aria-labelledby="niveles">
                <h2 id="niveles">Cómo se gana la insignia</h2>
                <ol className="ficha__levels">
                  {LEVELS.map((l) => (
                    <li key={l.id} data-current={l.id === score.level.id || undefined}>
                      <strong>{l.label}</strong>
                      <span>{l.rule}</span>
                    </li>
                  ))}
                </ol>
                <p className="ficha__note">
                  La insignia no se compra: sale solo del historial de pagos en el contrato. Si un taller no cumple y el plazo vence, el
                  dinero vuelve al comprador y la ficha lo registra.
                </p>
              </section>

              <section aria-labelledby="evidencia">
                <h2 id="evidencia">Evidencia verificable</h2>
                <ul className="ficha__evidence">
                  <li>
                    <a href={explorerAccount(address)} target="_blank" rel="noreferrer">
                      Cuenta del taller en stellar.expert
                    </a>
                  </li>
                  <li>
                    <a href={explorerContract()} target="_blank" rel="noreferrer">
                      Contrato de cobro protegido en stellar.expert
                    </a>
                  </li>
                  {orderIds.map((id) => (
                    <li key={id}>
                      <Link to={`/comprobante/${id}`}>Comprobante del pedido protegido n.º {id}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
