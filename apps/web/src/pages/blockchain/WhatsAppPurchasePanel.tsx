import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, createHttpClient } from '@izumi/api-client';
import { Alert, Badge, Button, Card, CardBody, CardHeader, DescriptionList } from '@izumi/ui';
import { clearToken, getToken } from '../../auth/tokenStorage';
import './WhatsAppPurchasePanel.css';

type Purchase = {
  id: string;
  order_id: string;
  acceptance_code: string;
  status: 'awaiting_acceptance' | 'quote_invalid' | 'anchor_pending' | 'anchored';
  evidence_hash: string | null;
  tx_hash: string | null;
  block_number: number | null;
  anchor_error: string | null;
  created_at: string;
  reused?: boolean;
};
type Purchases = { demo: true; chainId: number; items: Purchase[] };
const http = createHttpClient({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3017',
  getToken,
  onUnauthorized: clearToken,
});
const statuses: Record<Purchase['status'], string> = {
  awaiting_acceptance: 'Esperando al comprador',
  quote_invalid: 'Cotización no válida',
  anchor_pending: 'Compra aceptada · registro pendiente',
  anchored: 'Registro on-chain confirmado',
};

export function WhatsAppPurchasePanel() {
  const isTemporaryDemo = getToken()?.startsWith('demo_') ?? false;
  const [confirmed, setConfirmed] = useState(false);
  const requestKey = useRef(crypto.randomUUID());
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['blockchain', 'whatsapp-purchases'],
    queryFn: () => http.request<Purchases>('GET', '/demo/purchases'),
    retry: false,
    enabled: !isTemporaryDemo,
    refetchInterval: isTemporaryDemo ? false : 8000,
  });
  const mutation = useMutation({
    mutationFn: () => http.request<Purchase>('POST', '/demo/purchase/start', {
      body: { confirmSynthetic: true, confirmBuyer: true, idempotencyKey: requestKey.current },
    }),
    onSuccess: () => {
      // Keep this request key: repeated clicks or a lost response must not send a second offer.
      setConfirmed(false);
      void queryClient.invalidateQueries({ queryKey: ['blockchain', 'whatsapp-purchases'] });
    },
    onError: () => {
      setConfirmed(false);
      // A conflict can reflect another tab's purchase or changed buyer permissions.
      void queryClient.invalidateQueries({ queryKey: ['blockchain', 'whatsapp-purchases'] });
    },
  });
  const errorMessage = (error: Error) => error instanceof ApiError ? error.userMessage() : 'No se pudo completar la solicitud. Revisa la conexión.';
  const hasPending = query.data?.items.some((item) => item.status === 'awaiting_acceptance' || item.status === 'anchor_pending') ?? false;

  if (isTemporaryDemo) return <Card>
    <CardHeader title="Compra por WhatsApp → registro blockchain" actions={<Badge tone="warning">DEMO</Badge>} />
    <CardBody><Alert tone="info" title="Disponible con una cuenta del negocio">
      La sesión demo temporal no envía mensajes reales por WhatsApp ni registra compras en blockchain.
      Puedes explorar los pedidos y las simulaciones sin conectar un comprador real. Para este flujo necesitas una cuenta del negocio y la autorización del comprador.
    </Alert></CardBody>
  </Card>;

  return <Card>
    <CardHeader title="Compra por WhatsApp → registro blockchain" actions={<Badge tone="warning">DEMO · LOCAL</Badge>} />
    <CardBody className="wa-purchase">
      <p className="wa-purchase__intro">Cotiza por WhatsApp, recibe la aceptación y consulta aquí el comprobante. Compra simulada; sin dinero real.</p>
      <div className="wa-purchase__actions"><Link to="/chat">Abrir conversaciones</Link><Button variant="secondary" loading={query.isFetching} onClick={() => void query.refetch()}>Actualizar</Button></div>
      {query.isPending ? <p role="status">Buscando tus compras…</p> : null}
      {query.isError ? <Alert tone="warning">{errorMessage(query.error)}</Alert> : null}
      {query.data?.items.length === 0 ? <Alert tone="info">No hay compras en esta organización. Si ya compraste, revisa que ingresaste al negocio correcto antes de iniciar otra.</Alert> : null}
      <div className="wa-purchase__list">
        {query.data?.items.map((purchase) => {
          const verified = purchase.status === 'anchored' && !!purchase.tx_hash && purchase.block_number !== null && query.data.chainId === 31337;
          return <section className="wa-purchase__item" key={purchase.id}>
            <div className="wa-purchase__item-heading">
              <h3>{verified ? 'Compra completada' : 'Compra en curso'} · {new Date(purchase.created_at).toLocaleDateString('es-PE')}</h3>
              <Badge tone={verified ? 'success' : 'warning'}>{statuses[purchase.status] ?? purchase.status}</Badge>
            </div>
            {purchase.status === 'awaiting_acceptance' ? <p>
              El comprador debe responder en WhatsApp con esta frase completa:
              {' '}<strong className="blockchain__mono">{purchase.acceptance_code}</strong>.
              No hay un botón para aceptar en su nombre.
            </p> : null}
            {purchase.status === 'anchor_pending' ? <p>La aceptación ya está registrada. Aún no hay confirmación blockchain; el worker procesará el registro local.</p> : null}
            {purchase.anchor_error ? <Alert tone="danger" title="Registro pendiente de resolución">{purchase.anchor_error}</Alert> : null}
            {purchase.status === 'quote_invalid' ? <Alert tone="warning">La cotización no pudo validarse. No se debe interpretar esta compra como cerrada.</Alert> : null}
            {verified ? <p><strong>Listo. Tu aceptación fue recibida y el comprobante quedó registrado.</strong> No necesitas volver a comprar ni reenviar el código.</p> : null}
            <details className="wa-purchase__details"><summary>Ver comprobante y datos técnicos</summary>
            <DescriptionList items={[
              { key: 'order', term: 'Pedido', detail: <code className="blockchain__mono">{purchase.order_id}</code> },
              { key: 'network', term: 'Red', detail: `LOCAL ${query.data.chainId} · sin valor monetario` },
              ...(purchase.evidence_hash ? [{ key: 'evidence', term: 'Hash de evidencia', detail: <code className="blockchain__mono">{purchase.evidence_hash}</code> }] : []),
              ...(purchase.tx_hash ? [{ key: 'tx', term: 'Transacción de esta compra', detail: <code className="blockchain__mono">{purchase.tx_hash}</code> }] : []),
              ...(purchase.block_number !== null ? [{ key: 'block', term: 'Bloque', detail: String(purchase.block_number) }] : []),
            ]} />
            {verified ? <p>Registro nuevo confirmado en el nodo local: transacción de valor cero con hash de evidencia. No ejecuta el escrow Minkaly ni prueba un pago; tampoco es un comprobante legal o un registro en Ethereum público. No se reutilizaron los recibos del ejercicio Minkaly.</p> : null}
            </details>
          </section>;
        })}
      </div>
      <details className="wa-purchase__details" open={query.data?.items.length === 0}><summary>Iniciar otra compra de prueba</summary>      <Alert tone="info" title="Solo una demostración, sin cobros">
        Envía la propuesta DEMO al comprador autorizado <strong>+51 953 597 691</strong>.
        Solo su aceptación explícita por WhatsApp permite cerrar la compra y solicitar un nuevo registro
        en la cadena local 31337. No se registran pagos ni entregas reales.
      </Alert>
      <ol className="wa-purchase__steps">
        <li>Enviar propuesta</li><li>Comprador acepta por WhatsApp</li><li>Crear registro local</li><li>Verificar transacción</li>
      </ol>
      <p><strong>Propuesta fija DEMO:</strong> 100 polos × S/ 18.00 = S/ 1,800.00 ficticios.</p>
      <p>Antes de enviar, abre la conversación del comprador y verifica que el agente y las respuestas automáticas estén activos. Si pidió BAJA, respeta su decisión; esta pantalla no reactiva mensajes.</p>
      <label className="wa-purchase__confirmation">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={mutation.isPending || mutation.isSuccess || hasPending} />
        <span>Confirmo enviar una propuesta ficticia a este comprador. No representa una venta ni un pago real.</span>
      </label>
      <div className="wa-purchase__actions">
        <Button disabled={!confirmed || mutation.isSuccess || query.isPending || query.isError || hasPending} loading={mutation.isPending} onClick={() => mutation.mutate()}>
          Enviar propuesta DEMO por WhatsApp
        </Button>
        <Button variant="secondary" loading={query.isFetching} onClick={() => void query.refetch()}>Actualizar estado</Button>
      </div>
      {hasPending ? <p>Ya hay una compra en curso. Espera la respuesta del comprador o la confirmación del registro antes de iniciar otra.</p> : null}
      {mutation.isError ? <Alert tone="danger">{errorMessage(mutation.error)} <Link to="/chat">Revisar conversación del comprador</Link>. Después de resolver la causa, vuelve a confirmar. Reintentar conserva la misma solicitud para evitar duplicados.</Alert> : null}
      {mutation.isSuccess ? <Alert tone="success">{mutation.data.reused ? 'Recuperamos la compra existente; no se envió otra propuesta.' : 'Propuesta registrada; todavía no implica entrega del mensaje ni aceptación del comprador.'} Consulta su estado arriba.</Alert> : null}
      {query.isPending ? <p role="status">Cargando compras de esta organización…</p> : null}
      {query.isError ? <Alert tone="warning">{errorMessage(query.error)}</Alert> : null}
      {query.data?.items.length === 0 ? <p>No hay compras en esta organización. Si ya compraste, verifica que ingresaste al negocio correcto; no hace falta reenviar el código.</p> : null}
</details>
      <p className="wa-purchase__footnote">El estado se actualiza cada 8 segundos mientras esta pantalla está abierta. Los registros locales dependen del nodo de demostración; no hay explorador público.</p>
    </CardBody>
  </Card>;
}
