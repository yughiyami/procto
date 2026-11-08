import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, CardBody, CardHeader, useToast } from '@izumi/ui';
import { formatPen } from '@izumi/contracts';
import { useSession } from '../session/SessionContext';
import { getBalances, prepareAccount, requestDemoFunds } from '../stellar/chain';
import { explorerAccount, explorerTx, shortAddress } from '../stellar/config';
import { friendlyError } from '../stellar/errors';
import { tokenUnitsToPenCents } from '../stellar/units';
import { ConnectCard } from './ConnectCard';
import './AccountPanel.css';

export const balanceKey = (address: string | undefined) => ['balance', address ?? 'none'] as const;

export function useBalances() {
  const { connection } = useSession();
  return useQuery({
    queryKey: balanceKey(connection?.address),
    queryFn: () => getBalances(connection!.address),
    enabled: Boolean(connection),
    refetchInterval: 20_000,
  });
}

/** "Mi billetera": balance, "Preparar mi cuenta" and the clearly-labelled demo faucet. */
export function AccountPanel() {
  const { connection, signer, disconnect } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const balances = useBalances();
  const [step, setStep] = useState<string | null>(null);
  const [faucetHash, setFaucetHash] = useState<string | null>(null);

  if (!connection || !signer) return <ConnectCard />;

  const pusd = balances.data?.PUSD ?? null;
  const ready = balances.data?.exists && pusd !== null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: balanceKey(connection.address) });

  async function prepare() {
    setStep('Creando tu cuenta…');
    try {
      await prepareAccount(
        signer!,
        (s) => setStep(s === 'permission' ? 'Habilitando dólares digitales…' : 'Creando tu cuenta…'),
        { onFallback: (m) => toast.show({ tone: 'warning', message: m }) },
      );
      toast.show({ tone: 'success', message: 'Tu cuenta está lista.' });
    } catch (error) {
      toast.show({ tone: 'danger', message: friendlyError(error) });
    } finally {
      setStep(null);
      void refresh();
    }
  }

  async function faucet() {
    setStep('Cargando saldo de prueba…');
    try {
      const result = await requestDemoFunds(connection!.address);
      setFaucetHash(result.hash);
      toast.show({ tone: 'success', message: `Recibiste ${result.amount.toLocaleString('es-PE')} dólares digitales de prueba.` });
    } catch (error) {
      toast.show({ tone: 'danger', message: friendlyError(error) });
    } finally {
      setStep(null);
      void refresh();
    }
  }

  return (
    <Card className="account-panel">
      <CardHeader
        title="Mi billetera"
        actions={
          <Button variant="ghost" size="sm" onClick={() => void disconnect()}>
            Desconectar
          </Button>
        }
      />
      <CardBody>
        <p className="account-panel__addr">
          Cuenta{' '}
          <a href={explorerAccount(connection.address)} target="_blank" rel="noreferrer">
            {shortAddress(connection.address)}
          </a>{' '}
          ({connection.kind === 'quick' ? 'billetera rápida' : 'billetera externa'})
        </p>
        <div className="account-panel__balance" aria-live="polite">
          <span className="account-panel__amount">
            {pusd === null ? '—' : pusd.toLocaleString('es-PE', { maximumFractionDigits: 2 })}
          </span>
          <span className="account-panel__unit">dólares digitales de prueba</span>
          {pusd !== null && (
            <span className="account-panel__pen">≈ {formatPen(tokenUnitsToPenCents(BigInt(Math.round(pusd * 1e7))))}</span>
          )}
        </div>
        {!ready ? (
          <>
            <p>Para empezar, prepara tu cuenta. No necesitas comprar nada: PROCTO cubre las comisiones de la red.</p>
            <Button onClick={() => void prepare()} loading={step !== null}>
              Preparar mi cuenta
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => void faucet()} loading={step !== null}>
            Cargar saldo de prueba
          </Button>
        )}
        {step && <p role="status">{step}</p>}
        {faucetHash && (
          <p className="account-panel__proof">
            <a href={explorerTx(faucetHash)} target="_blank" rel="noreferrer">
              Ver en la red Stellar
            </a>
          </p>
        )}
        <Alert tone="warning" title="Dinero de práctica">
          Estás en una red de pruebas. Estos dólares digitales no tienen valor real y sirven solo para la demostración. La tasa
          usada es fija: S/ 3.75 por dólar.
        </Alert>
      </CardBody>
    </Card>
  );
}
