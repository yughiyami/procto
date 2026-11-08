import { CurrentBusiness } from '../../components/CurrentBusiness';
import { PitchDemoPanel } from './PitchDemoPanel';
import { WhatsAppPurchasePanel } from './WhatsAppPurchasePanel';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@izumi/api-client';
import { ApiError } from '@izumi/api-client';
import type { PrepareBlockchainInput } from '@izumi/api-client';
import type { IntegrationsStatus } from '@izumi/contracts';
import { Alert, Badge, Button, Card, CardBody, CardHeader, DescriptionList, Field, Input, PageHeader, Select } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './BlockchainPage.css';
import { LocalDemoPanel } from './LocalDemoPanel';

const SEPOLIA_CHAIN_ID = 11155111;
const HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const AMOUNT_PATTERN = /^[1-9]\d{0,77}$/;

type PrepareAction = PrepareBlockchainInput['action'];

type PreparedTransaction = {
  chainId: number;
  to: string;
  data: string;
  value: string;
  requiresWalletSignature: boolean;
  testnetOnly: boolean;
};

function isPreparedTransaction(value: unknown): value is PreparedTransaction {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.chainId === 'number' &&
    typeof v.to === 'string' &&
    typeof v.data === 'string' &&
    typeof v.value === 'string'
  );
}

type DealState = {
  client: string;
  seller: string;
  amountBaseUnits: string;
  releaseAt: string;
  disputeDeadline: string;
  state: number;
  chainId: number;
};

function isDealState(value: unknown): value is DealState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.client === 'string' && typeof v.seller === 'string' && typeof v.state === 'number';
}

function networkName(chainId: number): string {
  if (chainId === 31337) return 'LOCAL 31337 (desarrollo, no Sepolia)';
  return chainId === SEPOLIA_CHAIN_ID ? 'Sepolia (testnet)' : `Chain ID ${chainId} (red no reconocida)`;
}

function ConfiguredBadge({ configured }: { configured: boolean }) {
  return <Badge tone={configured ? 'success' : 'neutral'}>{configured ? 'Configurado' : 'No configurado'}</Badge>;
}

function StatusPanel({ status }: { status: IntegrationsStatus }) {
  const blockchain = status.blockchain;
  return (
    <Card>
      <CardHeader title="Estado de Minkaly" actions={<ConfiguredBadge configured={blockchain.configured} />} />
      <CardBody className="blockchain__status-body">
        <DescriptionList
          items={[
            { key: 'chain', term: 'Red', detail: networkName(blockchain.chainId) },
            { key: 'configured', term: 'Configurado', detail: <ConfiguredBadge configured={blockchain.configured} /> },
            {
              key: 'verified',
              term: 'Verificado',
              detail: <Badge tone="warning">No verificado</Badge>,
            },
            {
              key: 'signing',
              term: 'Firma de transacciones',
              detail: <Badge tone={blockchain.signingEnabled ? 'success' : 'neutral'}>{blockchain.signingEnabled ? 'Habilitada' : 'Deshabilitada'}</Badge>,
            },
            {
              key: 'anchoring',
              term: 'Anclaje de evidencia',
              detail: <Badge tone={blockchain.evidenceAnchoring ? 'success' : 'neutral'}>{blockchain.evidenceAnchoring ? 'Habilitado' : 'Deshabilitado'}</Badge>,
            },
          ]}
        />
        <ul className="blockchain__facts">
          <li>
            <strong>{networkName(blockchain.chainId)}</strong> es una red de prueba (testnet). El dinero que se mueve
            ahí no tiene valor real; nada aquí representa una transacción comercial en la red principal de Ethereum.
          </li>
          <li>
            "Configurado" solo indica que existen las variables de entorno necesarias. "No verificado" significa que
            este panel no comprueba la conexión. La tarjeta DEMO local y la consulta del contrato muestran
            verificaciones independientes; configurar variables no equivale a verificar una conexión.
          </li>
          <li>
            El formulario técnico de esta sección <strong>solo prepara datos sin firmar</strong>.
            El flujo de compra WhatsApp tiene un registro local independiente, únicamente después de la aceptación del comprador.
          </li>
          <li>
            Minkaly es un contrato de garantía (escrow), no un mecanismo de anclaje de documentos.
            La evidencia genérica de pedidos no se ancla automáticamente. El recibo del flujo WhatsApp
            se muestra por separado y no certifica pagos, entregas físicas ni documentos legales.
          </li>
        </ul>
      </CardBody>
    </Card>
  );
}

function PrepareForm({ configured }: { configured: boolean }) {
  const [action, setAction] = useState<PrepareAction>('retain');
  const [orderHash, setOrderHash] = useState('');
  const [seller, setSeller] = useState('');
  const [amountBaseUnits, setAmountBaseUnits] = useState('');
  const [releaseAtLocal, setReleaseAtLocal] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: PrepareBlockchainInput) => apiClient.prepareBlockchain(input),
  });

  function validate(): PrepareBlockchainInput | null {
    if (!HASH_PATTERN.test(orderHash)) {
      setFormError('El hash del pedido debe ser 0x seguido de 64 caracteres hexadecimales.');
      return null;
    }
    if (action === 'retain') {
      if (!ADDRESS_PATTERN.test(seller)) {
        setFormError('La dirección del vendedor debe ser una dirección Ethereum válida (0x + 40 hex).');
        return null;
      }
      if (!AMOUNT_PATTERN.test(amountBaseUnits)) {
        setFormError('El monto debe ser un número entero positivo en unidades base del token, sin decimales.');
        return null;
      }
      if (!releaseAtLocal) {
        setFormError('Indica la fecha y hora de liberación.');
        return null;
      }
      const releaseAtSeconds = Math.floor(new Date(releaseAtLocal).getTime() / 1000);
      if (!Number.isSafeInteger(releaseAtSeconds) || releaseAtSeconds <= Math.floor(Date.now() / 1000)) {
        setFormError('La fecha de liberación debe ser una fecha futura válida.');
        return null;
      }
      setFormError(null);
      return { action: 'retain', orderHash, seller, amountBaseUnits, releaseAt: releaseAtSeconds };
    }
    setFormError(null);
    return { action, orderHash };
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const input = validate();
    if (!input) return;
    mutation.mutate(input);
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback('Copiado al portapapeles.');
    } catch {
      setCopyFeedback('No se pudo copiar automáticamente; selecciona el texto manualmente.');
    }
  }

  const serverError = mutation.isError
    ? mutation.error instanceof ApiError
      ? mutation.error.userMessage()
      : 'No se pudo preparar la transacción.'
    : null;

  const result = mutation.data;
  const prepared = isPreparedTransaction(result) ? result : null;

  return (
    <Card>
      <CardHeader title="Preparar transacción (sin firmar)" />
      <CardBody className="blockchain__form-body">
        {!configured ? (
          <Alert tone="warning" title="Minkaly no está configurado">
            Falta la variable de entorno <code>MINKALY_CONTRACT_ADDRESS</code> en el servidor. El formulario queda
            deshabilitado para no enviar una solicitud que el servidor rechazaría con un error 503.
          </Alert>
        ) : null}

        <form className="blockchain__form" onSubmit={handleSubmit}>
          <Field label="Acción" htmlFor="blockchain-action">
            <Select
              id="blockchain-action"
              value={action}
              disabled={!configured}
              onChange={(event) => setAction(event.target.value as PrepareAction)}
            >
              <option value="retain">Retener (retain)</option>
              <option value="release">Liberar (release)</option>
              <option value="claim">Reclamar (claim)</option>
              <option value="settleExpiredClaim">Liquidar reclamo vencido (settleExpiredClaim)</option>
            </Select>
          </Field>

          <Field label="Hash interno del pedido Minkaly (no hash de transacción)" htmlFor="blockchain-order-hash" hint="0x seguido de 64 caracteres hexadecimales">
            <Input
              id="blockchain-order-hash"
              value={orderHash}
              disabled={!configured}
              placeholder="0x..."
              onChange={(event) => setOrderHash(event.target.value.trim())}
            />
          </Field>

          {action === 'retain' ? (
            <>
              <Field label="Vendedor (seller)" htmlFor="blockchain-seller" hint="Dirección Ethereum del vendedor">
                <Input
                  id="blockchain-seller"
                  value={seller}
                  disabled={!configured}
                  placeholder="0x..."
                  onChange={(event) => setSeller(event.target.value.trim())}
                />
              </Field>
              <Field
                label="Monto (amountBaseUnits)"
                htmlFor="blockchain-amount"
                hint="Entero en unidades base del token (no PEN, no un número JS con decimales)"
              >
                <Input
                  id="blockchain-amount"
                  value={amountBaseUnits}
                  disabled={!configured}
                  inputMode="numeric"
                  placeholder="1000000"
                  onChange={(event) => setAmountBaseUnits(event.target.value.trim())}
                />
              </Field>
              <Field label="Liberación (releaseAt)" htmlFor="blockchain-release-at" hint="Fecha y hora futura en la que el contrato permite liberar los fondos">
                <Input
                  id="blockchain-release-at"
                  type="datetime-local"
                  value={releaseAtLocal}
                  disabled={!configured}
                  onChange={(event) => setReleaseAtLocal(event.target.value)}
                />
              </Field>
            </>
          ) : null}

          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          {serverError ? <Alert tone="danger" title="El servidor rechazó la solicitud">{serverError}</Alert> : null}

          <Button type="submit" disabled={!configured} loading={mutation.isPending}>
            Preparar transacción
          </Button>
        </form>

        {prepared ? (
          <div className="blockchain__result">
            <Alert tone="info" title="Esta transacción NO ha sido firmada, enviada ni ejecutada">
              Prepararla no cambia nada en la cadena y no prueba nada comercialmente: es solo el dato de la llamada
              (calldata) sin firmar. Alguien debe firmarla y enviarla desde su propia billetera conectada a{' '}
              {networkName(prepared.chainId)}.
            </Alert>
            <div className="blockchain__tx-scroll">
              <dl className="blockchain__tx-fields">
                <div>
                  <dt>chainId</dt>
                  <dd>{prepared.chainId}</dd>
                </div>
                <div>
                  <dt>to</dt>
                  <dd>{prepared.to}</dd>
                </div>
                <div>
                  <dt>value</dt>
                  <dd>{prepared.value}</dd>
                </div>
                <div>
                  <dt>data</dt>
                  <dd className="blockchain__tx-data">{prepared.data}</dd>
                </div>
              </dl>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => void handleCopy(JSON.stringify(prepared))}>
              Copiar transacción sin firmar
            </Button>
            {copyFeedback ? <p className="blockchain__copy-feedback">{copyFeedback}</p> : null}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function ReadDealPanel({ configured, initialHash = '' }: { configured: boolean; initialHash?: string }) {
  const [orderHash, setOrderHash] = useState(initialHash);
  const [submittedHash, setSubmittedHash] = useState<string | null>(initialHash || null);
  const [formError, setFormError] = useState<string | null>(null);

  const dealQuery = useQuery({
    queryKey: submittedHash ? ['blockchain', 'deal', submittedHash] : ['blockchain', 'deal', 'idle'],
    queryFn: () => apiClient.readDeal(submittedHash ?? ''),
    enabled: submittedHash !== null,
    retry: false,
  });

  // Only MINKALY_CONTRACT_ADDRESS is visible via /integrations/status — a missing
  // MINKALY_RPC_URL still 503s but we cannot detect that client-side, so it surfaces
  // through readErrorMessage below rather than disabling the form up front.
  const canQuery = configured;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!HASH_PATTERN.test(orderHash)) {
      setFormError('El hash del pedido debe ser 0x seguido de 64 caracteres hexadecimales.');
      return;
    }
    setFormError(null);
    if (submittedHash === orderHash) void dealQuery.refetch();
    else setSubmittedHash(orderHash);
  }

  const deal = dealQuery.data;
  const dealState = isDealState(deal) ? deal : null;

  let readErrorMessage: string | null = null;
  if (dealQuery.isError && dealQuery.error instanceof ApiError) {
    const apiError = dealQuery.error;
    if (apiError.status === 503) {
      readErrorMessage = 'La conexión RPC de solo lectura no está configurada en el servidor.';
    } else if (apiError.status === 502) {
      readErrorMessage =
        'No pudimos verificar el estado del contrato en la red configurada. Esto no significa que el trato no exista, solo que no se pudo confirmar ahora mismo.';
    } else {
      readErrorMessage = apiError.userMessage();
    }
  }

  return (
    <Card>
      <CardHeader title="Consultar garantía Minkaly (herramienta técnica)" />
      <CardBody className="blockchain__form-body">
        {!canQuery ? (
          <Alert tone="warning" title="La consulta no está disponible">
            Falta la variable de entorno MINKALY_CONTRACT_ADDRESS en el servidor. El formulario queda deshabilitado
            para no enviar una solicitud que el servidor rechazaría con un error 503. Si el contrato ya está
            configurado pero falta MINKALY_RPC_URL, el formulario se mantiene habilitado y el error 503
            correspondiente se mostrará al consultar.
          </Alert>
        ) : null}

        <form className="blockchain__form" onSubmit={handleSubmit}>
          <Field label="Hash interno del pedido Minkaly (no hash de transacción)" htmlFor="blockchain-read-hash" hint="0x seguido de 64 caracteres hexadecimales">
            <Input
              id="blockchain-read-hash"
              value={orderHash}
              disabled={!canQuery}
              placeholder="0x..."
              onChange={(event) => setOrderHash(event.target.value.trim())}
            />
          </Field>
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <Button type="submit" disabled={!canQuery} loading={dealQuery.isFetching}>
            Consultar
          </Button>
        </form>

        {readErrorMessage ? <Alert tone="danger" title="No se pudo leer el contrato">{readErrorMessage}</Alert> : null}

        {dealState ? (
          <div className="blockchain__tx-scroll">
            <DescriptionList
              items={[
                { key: 'client', term: 'Cliente', detail: <span className="blockchain__mono">{dealState.client}</span> },
                { key: 'seller', term: 'Vendedor', detail: <span className="blockchain__mono">{dealState.seller}</span> },
                { key: 'amount', term: 'Monto (unidades base)', detail: <span className="blockchain__mono">{dealState.amountBaseUnits}</span> },
                { key: 'releaseAt', term: 'Liberación (unix)', detail: dealState.releaseAt },
                { key: 'disputeDeadline', term: 'Plazo de disputa (unix)', detail: dealState.disputeDeadline },
                { key: 'state', term: 'Estado (código)', detail: dealState.state },
                { key: 'chain', term: 'Red', detail: networkName(dealState.chainId) },
              ]}
            />
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function BlockchainContent({ status }: { status: IntegrationsStatus }) {
  const [selection, setSelection] = useState({ hash: '', version: 0 });
  return (
    <div className="blockchain__body">
      <LocalDemoPanel onSelect={(hash) => setSelection((current) => ({ hash, version: current.version + 1 }))} />
      <ReadDealPanel key={selection.version} initialHash={selection.hash} configured={status.blockchain.configured} />
      <StatusPanel status={status} />
      <PrepareForm configured={status.blockchain.configured} />
    </div>
  );
}

export default function BlockchainPage() {
  useDocumentTitle('Blockchain');
  const statusQuery = useQuery({ queryKey: queryKeys.integrations.status, queryFn: apiClient.integrationsStatus });

  return (
    <div className="blockchain">
      <CurrentBusiness />
      <PageHeader
        title="Compras y comprobantes"
        subtitle="Compra DEMO por WhatsApp y registro verificable en blockchain local. Sin dinero real."
      />
      <WhatsAppPurchasePanel />
      <details><summary style={{ cursor: 'pointer', padding: '16px 0' }}>Ensayo visual separado · sin WhatsApp ni registro on-chain</summary>
        <PitchDemoPanel />
      </details>
      <details><summary style={{ cursor: 'pointer', padding: '16px 0' }}>Herramientas técnicas de blockchain</summary>
      <QueryBoundary query={statusQuery}>{(status) => <BlockchainContent status={status} />}</QueryBoundary>
      </details>
    </div>
  );
}
