import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { queryKeys } from '@izumi/api-client';
import type { IntegrationsStatus } from '@izumi/contracts';
import { Alert, Badge, Card, CardBody, CardHeader, DescriptionList, PageHeader } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './IntegrationsPage.css';

function ConfiguredBadge({ configured }: { configured: boolean }) {
  return (
    <Badge tone={configured ? 'success' : 'neutral'}>
      {configured ? 'Configurado' : 'No configurado'}
    </Badge>
  );
}

function VerifiedBadge() {
  // `connected: 'not_verified'` is the only value the backend ever returns today — there is no
  // endpoint that proves a connection actually works. Never turn this green from `configured` alone.
  return <Badge tone="warning">No verificado</Badge>;
}

function IntegrationsOverview({ status }: { status: IntegrationsStatus }) {
  const unconfigured: string[] = [];
  if (!status.wapi.configured) unconfigured.push('WhatsApp (Wapi)');
  if (!status.deepseek.configured) unconfigured.push('Extracción con IA (DeepSeek)');
  if (!status.blockchain.configured) unconfigured.push('Blockchain (Minkaly)');

  return (
    <div className="integrations__body">
      <Alert tone="info" title="Configurado no es lo mismo que verificado">
        “Configurado” solo indica que existen las credenciales o variables de entorno necesarias
        para una integración. “No verificado” significa que nadie ha comprobado todavía que esa
        integración funciona de verdad. Esta pantalla nunca muestra una integración como
        “Conectado” solo porque esté configurada.
      </Alert>

      {unconfigured.length > 0 ? (
        <Alert tone="warning" title="Configuración pendiente">
          Las siguientes integraciones no están configuradas: {unconfigured.join(', ')}. Revisa el
          documento de configuración manual (docs/manual-setup.md en el repositorio) para
          activarlas.
        </Alert>
      ) : null}

      <div className="integrations__cards">
        <Card>
          <CardHeader title="Directorio y scraping" />
          <CardBody>
            <p>Importa resultados JSON de fuentes que tengas autorización para utilizar. Se conserva la procedencia, sin verificar automáticamente las empresas.</p>
            <p>La extracción automática está pendiente de conectar tu servicio; no hay un crawler activo.</p>
            <Link to="/directory">Administrar empresas y fuentes</Link>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Acceso MCP" />
          <CardBody>
            <p>Endpoint del backend: <code>/mcp</code>. Consulta el directorio, pedidos y evidencias de tu organización desde un cliente compatible.</p>
            <p>Primera versión de solo lectura. No envía mensajes, registra pagos ni firma transacciones.</p>
            <p>Configura el cliente externo con almacenamiento seguro de credenciales. No pegues tokens en conversaciones.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="WhatsApp (Wapi)" actions={<ConfiguredBadge configured={status.wapi.configured} />} />
          <CardBody>
            <DescriptionList
              items={[
                { key: 'verified', term: 'Estado de conexión', detail: <VerifiedBadge /> },
                { key: 'transport', term: 'Transporte', detail: 'No oficial (unofficial)' },
                {
                  key: 'outgoing',
                  term: 'Envío de mensajes',
                  detail: status.wapi.outgoingEnabled ? 'Habilitado' : 'Deshabilitado',
                },
              ]}
            />
            <p className="integrations__note">
              Wapi es un cliente de WhatsApp no oficial: el número usado puede ser restringido o
              bloqueado por WhatsApp en cualquier momento. Los envíos requieren aprobación, un worker activo
              y la configuración del canal.
              No uses el número principal de un negocio para hacer pruebas.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Extracción con IA (DeepSeek)" actions={<ConfiguredBadge configured={status.deepseek.configured} />} />
          <CardBody>
            <DescriptionList
              items={[
                { key: 'verified', term: 'Estado de conexión', detail: <VerifiedBadge /> },
                { key: 'model', term: 'Modelo', detail: status.deepseek.model },
              ]}
            />
            <p className="integrations__note">
              DeepSeek propone datos de un pedido a partir de un mensaje para que una persona los
              revise. Nunca confirma stock, precios, pagos ni una venta.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Blockchain (Minkaly)" actions={<ConfiguredBadge configured={status.blockchain.configured} />} />
          <CardBody>
            <DescriptionList
              items={[
                { key: 'verified', term: 'Estado de conexión', detail: <VerifiedBadge /> },
                {
                  key: 'chain',
                  term: 'Red',
                  detail:
                    status.blockchain.chainId === 11155111
                      ? 'Sepolia (red de prueba / testnet)'
                      : status.blockchain.chainId === 31337
                        ? 'LOCAL 31337 (desarrollo, no Sepolia)'
                        : `Chain ID ${status.blockchain.chainId} (red no reconocida)`,
                },
                {
                  key: 'signing',
                  term: 'Firma de transacciones',
                  detail: status.blockchain.signingEnabled ? 'Habilitada' : 'Deshabilitada',
                },
                {
                  key: 'anchoring',
                  term: 'Anclaje de evidencia',
                  detail: status.blockchain.evidenceAnchoring ? 'Habilitado' : 'Deshabilitado',
                },
              ]}
            />
            <p className="integrations__note">
              Entorno de pruebas, no la red principal de Ethereum. La API web no
              firma ni transmite transacciones: solo prepara datos sin firmar. El script DEMO
              separado opera únicamente con tokens sintéticos en la cadena local. El
              contrato de garantía (escrow) de Minkaly no es un mecanismo de anclaje de
              documentos, así que la evidencia de un pedido no queda anclada en ningún lado.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  useDocumentTitle('Integraciones');
  const query = useQuery({ queryKey: queryKeys.integrations.status, queryFn: apiClient.integrationsStatus });

  return (
    <div className="integrations-page">
      <PageHeader
        title="Integraciones"
        subtitle="Estado de las integraciones externas de Izumi. Esta pantalla es de solo lectura."
      />
      <QueryBoundary query={query}>{(status) => <IntegrationsOverview status={status} />}</QueryBoundary>
    </div>
  );
}
