import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { StrKey } from '@stellar/stellar-sdk';
import { Alert, Button, Input, useToast } from '@izumi/ui';
import { formatPen } from '@izumi/contracts';
import type { Order, Supplier } from '@izumi/contracts';
import { store } from '../../../lib/apiClient';
import { useChainAction } from '../../../hooks/useChainAction';
import { useSession } from '../../../session/SessionContext';
import { createChainOrder, getBalances, prepareAccount } from '../../../stellar/chain';
import { DEFAULT_TOKEN, TOKENS, shortAddress } from '../../../stellar/config';
import { friendlyError } from '../../../stellar/errors';
import { buildShares, suggestDeadline } from '../../../stellar/mapping';
import { formatToken, penCentsToTokenUnits } from '../../../stellar/units';
import { describeCommission } from '../../../stellar/commission';
import { useProfile } from '../../../profile/useProfile';

type Props = { order: Order; suppliers: Supplier[]; onActivated: () => void };

const slotOf = (supplierId: string | null) => (supplierId ? `proveedor:${supplierId}` : 'coordinadora');

/** Splits the accepted quote into payments, lets people assign each account, and creates the protected payment. */
export function ActivationForm({ order, suppliers, onActivated }: Props) {
  const { role, setRole, signer, ensureQuickSlot, signerOfSlot } = useSession();
  const { run, busy } = useChainAction();
  const toast = useToast();
  const profile = useProfile();
  const shares = useMemo(() => buildShares(order, suppliers, { commission: { pro: profile.pro } }), [order, suppliers, profile.pro]);
  const [addresses, setAddresses] = useState<string[]>(() =>
    shares.map((s) => s.address ?? (s.supplierId ? (store.supplierWallet(s.supplierId) ?? '') : '')),
  );
  const [working, setWorking] = useState<string | null>(null);

  const total = shares.reduce((t, s) => t + s.amountCents, 0);
  const setAddress = (index: number, value: string) =>
    setAddresses((prev) => prev.map((a, i) => (i === index ? value.trim() : a)));

  async function useDemoWallets() {
    setWorking('Creando y preparando billeteras de demostración…');
    try {
      const next: string[] = [];
      for (const share of shares) {
        if (share.address) {
          next.push(share.address);
          continue;
        }
        const slot = slotOf(share.supplierId);
        const connection = ensureQuickSlot(slot);
        const slotSigner = signerOfSlot(slot) ?? undefined;
        next.push(connection.address);
        if (slotSigner) await prepareAccount(slotSigner);
      }
      setAddresses(next);
      toast.show({ tone: 'success', message: 'Billeteras de demostración listas para cobrar.' });
    } catch (error) {
      toast.show({ tone: 'danger', message: friendlyError(error) });
    } finally {
      setWorking(null);
    }
  }

  async function activate() {
    const invalid = addresses.findIndex((a) => !StrKey.isValidEd25519PublicKey(a));
    if (invalid >= 0) {
      toast.show({ tone: 'warning', message: `Falta la cuenta de cobro de: ${shares[invalid]!.label}.` });
      return;
    }
    setWorking('Revisando que cada cuenta pueda recibir el pago…');
    try {
      for (let i = 0; i < addresses.length; i++) {
        const balances = await getBalances(addresses[i]!);
        if (!balances.exists || balances.PUSD === null) {
          toast.show({
            tone: 'warning',
            message: `${shares[i]!.label} aún no preparó su cuenta. Usa "Billeteras de demostración" o pídele que entre a Mi billetera.`,
            durationMs: 9000,
          });
          return;
        }
      }
    } catch (error) {
      toast.show({ tone: 'danger', message: friendlyError(error) });
      return;
    } finally {
      setWorking(null);
    }

    const deadline = suggestDeadline(order.dueAt);
    const outcome = await run(
      'activate',
      (s, options) =>
        createChainOrder(
          s,
          {
            token: DEFAULT_TOKEN,
            deadline,
            shares: shares.map((share, i) => ({
              supplier: addresses[i]!,
              label: share.label,
              amount: penCentsToTokenUnits(share.amountCents),
            })),
          },
          options,
        ),
      'Cobro protegido activado.',
    );
    if (!outcome) return;
    const created = outcome as Awaited<ReturnType<typeof createChainOrder>>;
    shares.forEach((share, i) => share.supplierId && store.setSupplierWallet(share.supplierId, addresses[i]!));
    store.setChain(order.id, {
      chainOrderId: created.orderId,
      token: DEFAULT_TOKEN,
      tokenContract: TOKENS[DEFAULT_TOKEN].contract,
      buyer: signer!.address,
      deadline,
      shares: shares.map((share, i) => ({
        supplierId: share.supplierId,
        kind: share.kind,
        label: share.label,
        address: addresses[i]!,
        amountCents: share.amountCents,
        amountUnits: penCentsToTokenUnits(share.amountCents).toString(),
      })),
      txs: [{ kind: 'create_order', hash: outcome.hash, at: new Date().toISOString(), by: signer!.address, sponsored: outcome.sponsored }],
    });
    onActivated();
  }

  return (
    <div className="pp-form">
      <p className="pp-lead">
        La cotización aceptada define cuánto cobra cada uno. El comprador deposita el pago completo y cada taller cobra directo en su
        cuenta cuando se confirma su entrega.
      </p>
      <ul className="pp-split">
        {shares.map((share, i) => (
          <li key={share.label}>
            <div className="pp-split__head">
              <strong>{share.label}</strong>
              <span>
                {formatPen(share.amountCents)} <small>≈ {formatToken(penCentsToTokenUnits(share.amountCents))} USD</small>
              </span>
            </div>
            {share.address ? (
              <p className="pp-split__fixed">
                {share.kind === 'impact'
                  ? 'Va automáticamente al fondo de impacto: 8% de la comisión de PROCTO.'
                  : 'Se paga automáticamente a PROCTO cuando se cobra el pedido.'}{' '}
                <small>Cuenta {shortAddress(share.address)}</small>
              </p>
            ) : (
              <label className="pp-split__wallet">
                Cuenta donde cobra
                <Input
                  value={addresses[i] ?? ''}
                  onChange={(e) => setAddress(i, e.target.value)}
                  placeholder="Pega la dirección de su billetera (empieza con G)"
                  spellCheck={false}
                  autoComplete="off"
                />
              </label>
            )}
          </li>
        ))}
        <li className="pp-split__total">
          <strong>Total del pedido</strong>
          <strong>{formatPen(total)}</strong>
        </li>
      </ul>
      <p className="pp-note">
        {describeCommission(profile.pro)} {profile.pro ? '' : <>Con una cuenta PRO es 2%: actívala en <Link to="/negocio">Mi negocio</Link>.</>}
      </p>
      <p className="pp-note">
        Tasa de demostración fija: S/ 3.75 por dólar digital. El plazo máximo para entregar es el día de entrega más 7 días.
      </p>
      <div className="pp-actions">
        <Button variant="secondary" onClick={() => void useDemoWallets()} loading={working !== null}>
          Usar billeteras de demostración
        </Button>
        {role === 'comprador' ? (
          <Button onClick={() => void activate()} loading={busy === 'activate' || working !== null} disabled={!signer}>
            Activar cobro protegido
          </Button>
        ) : (
          <Button onClick={() => setRole('comprador')}>Cambiar a Comprador para activar</Button>
        )}
      </div>
      {role === 'comprador' && !signer && <Alert tone="info">Conecta la billetera del comprador en la pestaña “Mi billetera”.</Alert>}
      {working && <p role="status">{working}</p>}
    </div>
  );
}
