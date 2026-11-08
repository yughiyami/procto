import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Alert, PageHeader } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useStore } from '../../hooks/useStore';
import { ReceiptView } from './ReceiptView';

/** /orders/:id/comprobante  (local order) and /comprobante/:chainId (any on-chain order, no login needed). */
export default function ReceiptPage() {
  const { id, chainId } = useParams<{ id?: string; chainId?: string }>();
  const store = useStore();
  const orderQuery = useQuery({
    queryKey: ['orders', id ?? 'none'],
    queryFn: () => apiClient.getOrder(id!),
    enabled: Boolean(id),
  });
  useDocumentTitle('Comprobante verificable');

  const link = id ? store.getChain(id) : undefined;
  const chainOrderId = chainId ?? link?.chainOrderId;

  return (
    <div className="stack-page">
      <PageHeader
        title="Comprobante verificable"
        subtitle={orderQuery.data?.title ?? (chainId ? `Pedido protegido número ${chainId}` : undefined)}
        breadcrumb={id ? <Link to={`/orders/${id}`}>← Volver al pedido</Link> : <Link to="/inicio">← Inicio</Link>}
      />
      {chainOrderId ? (
        <ReceiptView chainOrderId={chainOrderId} order={orderQuery.data} knownTxs={link?.txs} />
      ) : (
        <Alert tone="info">Este pedido todavía no tiene cobro protegido. Actívalo desde el detalle del pedido para generar el comprobante.</Alert>
      )}
    </div>
  );
}
