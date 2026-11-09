import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Badge, Button } from '@izumi/ui';
import { extras } from '../../lib/apiClient';
import { salesApi } from '../sales/api';

const dateFmt = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { dateStyle: 'medium' });

/** Repository of requests for quotation. Sample data until a real network feeds it; answering one opens a sales opportunity. */
export function RfqPanel() {
  const [, bump] = useState(0);
  const [notice, setNotice] = useState('');
  const rfqs = extras.state.rfqs;

  async function respond(id: string) {
    const rfq = rfqs.find((r) => r.id === id);
    if (!rfq || rfq.respondedOpportunityId) return;
    const item = await salesApi.create({ title: `RFQ: ${rfq.title}`, amountCents: null });
    rfq.respondedOpportunityId = item.id;
    extras.persist();
    setNotice('Quedó registrada como oportunidad en Ventas. No se envió ninguna cotización.');
    bump((n) => n + 1);
  }

  return (
    <section aria-labelledby="rfq-title">
      <h2 id="rfq-title">Solicitudes de cotización (RFQ)</h2>
      <Alert tone="warning" title="Datos de ejemplo">
        Estas solicitudes son de muestra para probar el flujo. Las solicitudes reales llegarán cuando se conecte una red de compradores o
        los directorios globales (Trade Map, TradeAtlas).
      </Alert>
      {notice && (
        <Alert tone="success" title="Lista">
          {notice} <Link to="/ventas">Ir a Ventas</Link>
        </Alert>
      )}
      <ul className="directory__rfqs">
        {rfqs.map((r) => (
          <li key={r.id}>
            <div>
              <strong>{r.title}</strong> <Badge tone="warning">Ejemplo</Badge>
              <p>
                {r.buyer} · {r.country} · {r.quantity.toLocaleString('es-PE')} {r.unit} · Partida {r.hsCode}
              </p>
              <small>Responder antes del {dateFmt(r.deadline)}. {r.notes}</small>
            </div>
            <Button variant={r.respondedOpportunityId ? 'secondary' : 'primary'} disabled={Boolean(r.respondedOpportunityId)} onClick={() => void respond(r.id)}>
              {r.respondedOpportunityId ? 'Registrada en Ventas' : 'Responder con una oportunidad'}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
