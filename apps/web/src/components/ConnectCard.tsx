import { useState } from 'react';
import { Alert, Button, Card, CardBody, useToast } from '@izumi/ui';
import { useSession } from '../session/SessionContext';
import { friendlyError } from '../stellar/errors';
import './ConnectCard.css';

/** Shown wherever a signed action is needed and no wallet is connected yet. */
export function ConnectCard({ reason }: { reason?: string }) {
  const { connectExternal, connectQuick, connecting, role } = useSession();
  const toast = useToast();
  const [quickBusy, setQuickBusy] = useState(false);

  async function external() {
    try {
      await connectExternal();
    } catch (error) {
      toast.show({ tone: 'danger', message: friendlyError(error) });
    }
  }
  async function quick() {
    setQuickBusy(true);
    try {
      await connectQuick();
    } finally {
      setQuickBusy(false);
    }
  }

  return (
    <Card className="connect-card">
      <CardBody>
        <h3>Conecta tu billetera</h3>
        <p>{reason ?? 'Tu billetera firma cada paso y guarda tu dinero. Tú siempre tienes el control.'}</p>
        <div className="connect-card__actions">
          <Button onClick={() => void external()} loading={connecting}>
            Conectar mi billetera
          </Button>
          <Button variant="secondary" onClick={() => void quick()} loading={quickBusy}>
            Crear billetera rápida
          </Button>
        </div>
        <p className="connect-card__hint">
          Compatible con Freighter, xBull, Albedo, LOBSTR y más. ¿No tienes una? La billetera rápida se crea en este
          navegador, solo para probar con dinero de práctica.
        </p>
        {role === 'proveedor' && (
          <Alert tone="info">Cada taller usa su propia billetera, así el pago llega directo a su cuenta.</Alert>
        )}
      </CardBody>
    </Card>
  );
}
