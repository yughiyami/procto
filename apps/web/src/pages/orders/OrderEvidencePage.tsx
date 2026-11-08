import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@izumi/api-client';
import type { DomainEvent, EvidenceExport } from '@izumi/contracts';
import { formatDateTime } from '@izumi/contracts';
import { Alert, Button, PageHeader } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './OrderEvidencePage.css';

const EVENT_LABELS: Record<string, string> = {
  'request.created': 'Solicitud creada',
  'contribution.updated': 'Aporte registrado o actualizado',
  'quote.created': 'Cotización preparada',
  'quote.accepted': 'Cotización aceptada',
  'delivery.recorded': 'Entrega registrada',
  'money.recorded': 'Movimiento registrado',
  'order.cancelled': 'Pedido cancelado',
};

function eventLabel(type: string): string {
  return EVENT_LABELS[type] ?? type;
}

function truncateHash(hash: string): string {
  if (!hash) return '—';
  return hash.length > 10 ? `${hash.slice(0, 10)}…` : hash;
}

function downloadEvidence(evidence: EvidenceExport, orderId: string) {
  const blob = new Blob([JSON.stringify(evidence, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `evidencia-${orderId}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function EventItem({ event }: { event: DomainEvent }) {
  return (
    <li className="order-evidence__event">
      <div className="order-evidence__event-marker" aria-hidden="true" />
      <div className="order-evidence__event-body">
        <div className="order-evidence__event-head">
          <span className="order-evidence__event-type">{eventLabel(event.type)}</span>
          <span className="order-evidence__event-date">{formatDateTime(event.at)}</span>
        </div>
        <p className="order-evidence__event-actor">Actor: {event.actor}</p>
        <p className="order-evidence__event-hashes">
          <span>
            hash: <code className="order-evidence__mono">{truncateHash(event.hash)}</code>
          </span>
          <span>
            anterior: <code className="order-evidence__mono">{truncateHash(event.previousHash)}</code>
          </span>
        </p>
        <details>
          <summary>Ver datos sin procesar</summary>
          <pre className="order-evidence__raw">{JSON.stringify(event.data, null, 2)}</pre>
        </details>
      </div>
    </li>
  );
}

function EvidenceContent({ orderId, evidence }: { orderId: string; evidence: EvidenceExport }) {
  return (
    <>
      <Alert tone="info" title="Qué es esta evidencia">
        Esta es una exportación de auditoría privada. No está anclada en ninguna blockchain y no prueba el
        cumplimiento físico del pedido.
      </Alert>

      {evidence.warning ? <Alert tone="warning">{evidence.warning}</Alert> : null}

      <p className="order-evidence__algorithm">
        Algoritmo: <code className="order-evidence__mono">{evidence.algorithm}</code>
      </p>

      <Button type="button" variant="secondary" onClick={() => downloadEvidence(evidence, orderId)}>
        Descargar evidencia (JSON)
      </Button>

      <div className="order-evidence__chain-note">
        Cada registro incluye la huella (hash) del registro anterior, de modo que alterar una entrada anterior rompe
        la cadena. Esta página muestra esos valores tal como llegaron; no ha vuelto a calcular ni verificado la
        cadena.
      </div>

      <ol className="order-evidence__timeline">
        {evidence.events.map((event) => (
          <EventItem key={event.id} event={event} />
        ))}
      </ol>
    </>
  );
}

export default function OrderEvidencePage() {
  const { id } = useParams();
  const orderId = id ?? '';
  useDocumentTitle('Evidencia del pedido');

  const evidenceQuery = useQuery({
    queryKey: queryKeys.orders.evidence(orderId),
    queryFn: () => apiClient.getEvidence(orderId),
    enabled: orderId !== '',
  });

  return (
    <div className="order-evidence">
      <PageHeader title="Evidencia del pedido" breadcrumb={<Link to={`/orders/${orderId}`}>← Volver al pedido</Link>} />
      <QueryBoundary query={evidenceQuery}>{(evidence) => <EvidenceContent orderId={orderId} evidence={evidence} />}</QueryBoundary>
    </div>
  );
}
