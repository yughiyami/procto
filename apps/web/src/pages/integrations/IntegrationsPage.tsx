import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader } from '@izumi/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { pacoHealth } from '../../paco/client';
import { explorerContract } from '../../stellar/config';
import './IntegrationsPage.css';

type State = { label: string; tone: 'success' | 'warning' | 'neutral' };

const ACTIVE: State = { label: 'Activo', tone: 'success' };
const NEEDS: State = { label: 'Requiere credenciales', tone: 'neutral' };

const vapiConfigured = Boolean((import.meta.env.VITE_VAPI_PUBLIC_KEY ?? '').trim());

/** Honest status of every connection: what works today, what is a sample, and what needs credentials. */
export default function IntegrationsPage() {
  useDocumentTitle('Integraciones');
  const paco = useQuery({ queryKey: ['paco', 'health'], queryFn: () => pacoHealth(), staleTime: 60_000 });
  const PROVIDER = { meta: 'Activo con Meta (Muse Spark)', gateway: 'Activo con Vercel AI Gateway', guia: 'Guía básica (sin conexión con el asistente)' } as const;
  const pacoState: State = paco.isPending ? { label: 'Comprobando…', tone: 'neutral' } : paco.data?.available ? { label: PROVIDER[paco.data.provider], tone: 'success' } : { label: PROVIDER.guia, tone: 'warning' };

  return (
    <div className="integrations">
      <PageHeader title="Integraciones" subtitle="Qué funciona hoy, qué usa datos de ejemplo y qué necesita credenciales." />
      <div className="integrations__body">
        <Alert tone="info" title="Nada se muestra como conectado sin comprobarlo">
          Una integración aparece como activa solo cuando funciona de verdad en este momento. Las que necesitan credenciales de otro
          servicio explican qué falta, en lugar de fallar.
        </Alert>

        <div className="integrations__cards">
          <Card>
            <CardHeader title="Cobro protegido (red Stellar)" actions={<Badge tone={ACTIVE.tone}>{ACTIVE.label}</Badge>} />
            <CardBody>
              <p>El depósito en garantía, el reparto del pago, los adelantos y los comprobantes funcionan sobre un contrato en la red de pruebas Stellar. Las comisiones de red las cubre PROCTO.</p>
              <a href={explorerContract()} target="_blank" rel="noreferrer">
                Ver el contrato en stellar.expert
              </a>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="PACO, el asistente" actions={<Badge tone={pacoState.tone}>{pacoState.label}</Badge>} />
            <CardBody>
              <p>PACO responde con un modelo de lenguaje: primero la API de modelos de Meta (si está configurada), luego Vercel AI Gateway. Si ninguno está disponible, responde con una guía básica escrita para cada paso, así que nunca queda sin respuesta.</p>
              <Link to="/paco">Hablar con PACO</Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="WhatsApp Business" actions={<Badge tone={NEEDS.tone}>{NEEDS.label}</Badge>} />
            <CardBody>
              <p>Disponible al conectar WhatsApp Business. Mientras tanto, las conversaciones funcionan en un simulador dentro de la app: puedes recibir mensajes de ejemplo, guardar respuestas y revisar propuestas, pero no se envía nada a un teléfono real.</p>
              <Link to="/chat">Abrir conversaciones (simulador)</Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="PACO por voz" actions={<Badge tone={vapiConfigured ? ACTIVE.tone : NEEDS.tone}>{vapiConfigured ? 'Configurado' : NEEDS.label}</Badge>} />
            <CardBody>
              <p>{vapiConfigured ? 'La llamada con PACO usa el micrófono solo cuando tú la inicias.' : 'Disponible al conectar el servicio de voz (Vapi). Hace falta una clave pública y los asistentes de voz; sin ellos la pantalla lo explica y no pide el micrófono.'}</p>
              <Link to="/voz">Ver PACO por voz</Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Directorios globales (Trade Map, TradeAtlas)" actions={<Badge tone={NEEDS.tone}>{NEEDS.label}</Badge>} />
            <CardBody>
              <p>La consulta en vivo a los directorios de comercio exterior necesita una cuenta propia con cada servicio. Mientras tanto, el directorio funciona con datos de ejemplo y con empresas que tú agregas o importas, siempre con su fuente.</p>
              <Link to="/directory">Administrar empresas y fuentes</Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Lectura de mensajes y movimientos" actions={<Badge tone={ACTIVE.tone}>{ACTIVE.label}</Badge>} />
            <CardBody>
              <p>La bandeja y el borrador financiero leen pedidos, montos y fechas con reglas dentro de tu navegador. Proponen y tú confirmas; no se envía tu texto a ningún servicio.</p>
              <Link to="/bandeja">Abrir bandeja</Link>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
