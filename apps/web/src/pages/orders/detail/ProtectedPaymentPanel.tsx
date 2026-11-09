import { useQuery } from '@tanstack/react-query';
import { Alert, Card, CardBody, CardHeader } from '@izumi/ui';
import type { Order } from '@izumi/contracts';
import { apiClient } from '../../../lib/apiClient';
import { useRefreshChain } from '../../../hooks/useChainOrder';
import { useStore } from '../../../hooks/useStore';
import { ConnectCard } from '../../../components/ConnectCard';
import { useSession } from '../../../session/SessionContext';
import { RoleHint } from '../../../tour/RoleHint';
import { ActivationForm } from './ActivationForm';
import { LivePayment } from './LivePayment';
import './ProtectedPaymentPanel.css';

/** "Cobro protegido": the accepted quote becomes the payment instruction on the Stellar network. */
export function ProtectedPaymentPanel({ order }: { order: Order }) {
  const s = useStore();
  const { connection } = useSession();
  const refresh = useRefreshChain();
  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: apiClient.listSuppliers });
  const link = s.getChain(order.id);

  return (
    <Card className="pp-card" data-tour="payment-panel">
      <CardHeader title="Cobro protegido" />
      <CardBody>
        {!order.accepted ? (
          <Alert tone="info">
            Se activa cuando el comprador acepta la cotización. Entonces el pago se reparte automáticamente entre los talleres y la
            coordinación, y nadie cobra antes de la entrega.
          </Alert>
        ) : !connection ? (
          <ConnectCard reason="Para activar y firmar el cobro protegido, conecta la billetera del rol que estás usando." />
        ) : link ? (
          <LivePayment order={order} />
        ) : suppliers.data ? (
          <>
            <RoleHint context={{ phase: 'inactive', deliveredUnpaid: 0, waitingDelivery: 0, offered: 0 }} />
            <ActivationForm order={order} suppliers={suppliers.data} onActivated={() => refresh('')} />
          </>
        ) : (
          <p role="status">Cargando…</p>
        )}
      </CardBody>
    </Card>
  );
}
