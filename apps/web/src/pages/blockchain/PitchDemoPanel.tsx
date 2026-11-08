import { useEffect, useRef, useState } from 'react';
import { createHttpClient } from '@izumi/api-client';
import { clearToken, getToken } from '../../auth/tokenStorage';
import './PitchDemoPanel.css';

type Run = {
 id: string; agent: string; recipient: string; status: 'waiting_acceptance' | 'completed'; createdAt: string;
 product: string; quantity: number; unitPriceCents: number; totalCents: number;
 events: { index: number; stage: string; label: string; at: string; digest: string; previousDigest: string | null }[];
 receipt: { id: string; issuedAt: string; legalValidity: false; amountCents: number } | null;
 order: { id: string; status: string } | null;
};
const http = createHttpClient({ baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3017', getToken, onUnauthorized: clearToken });
const stages = ['Propuesta', 'Aceptación', 'Pedido DEMO', 'Custodia simulada', 'Entrega simulada', 'Liberación simulada', 'Comprobante'];
const descriptions = ['El agente prepara tu compra.', 'El usuario tiene la última palabra.', 'Una operación, sin duplicados.', 'Garantía de pago, sin fondos reales.', 'Hito logístico de demostración.', 'La garantía se libera en la simulación.', 'Trazabilidad persistida y exportable.'];
const money = (cents: number) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(cents / 100);

export function PitchDemoPanel() {
 const [run, setRun] = useState<Run | null>(null);
 const [history, setHistory] = useState<Run[]>([]);
 const [agent, setAgent] = useState('PACO · Agente de compras');
 const [recipient, setRecipient] = useState('+51953597691');
 const [loading, setLoading] = useState(true);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState('');
 const [visible, setVisible] = useState(1);
 const [replaying, setReplaying] = useState(false);
 const [response, setResponse] = useState('');
 const timer = useRef<ReturnType<typeof setInterval> | null>(null);
 const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
 function select(value: Run) { stop(); setReplaying(false); setRun(value); setVisible(value.events.length); setResponse(''); }
 useEffect(() => {
  let active = true;
  http.request<{items: Run[]}>('GET', '/pitch-demo/runs').then(data => { if (active) { setHistory(data.items); if (data.items[0]) select(data.items[0]); } })
   .catch(() => { if (active) setError('No se pudo cargar la demo. Recarga la página para reintentar.'); })
   .finally(() => { if (active) setLoading(false); });
  return () => { active = false; stop(); };
 }, []);
 function play(result: Run) {
  stop(); setRun(result); setVisible(1); setReplaying(true);
  let step = 1;
  timer.current = setInterval(() => { step++; setVisible(step); if (step >= result.events.length) { stop(); setReplaying(false); } }, 850);
 }
 async function create() {
  setBusy(true); setError('');
  try {
   const result = await http.request<Run>('POST', '/pitch-demo/runs', { body: { agent, recipient } });
   select(result); setHistory(items => [result, ...items].slice(0,30));
  } catch { setError('No se pudo preparar la propuesta. Comprueba la sesión y el número (+51 y 9 dígitos).'); }
  finally { setBusy(false); }
 }
 async function accept() {
  if (!run || busy) return;
  setBusy(true); setError('');
  try {
   const result = await http.request<Run>('POST', `/pitch-demo/runs/${run.id}/accept`, { body: { response: 'ACEPTAR', demo: true } });
   setHistory(items => items.map(item => item.id === result.id ? result : item)); setResponse(''); play(result);
  } catch { setError('No se pudo confirmar la respuesta. Reintenta: aceptar dos veces no duplica la operación.'); }
  finally { setBusy(false); }
 }
 function download() {
  if (!run) return;
  const blob = new Blob([JSON.stringify({ notice: 'SIMULACIÓN. Sin WhatsApp, fondos, entrega física, validez tributaria ni anclaje blockchain. Digest SHA256 local, no hash de transacción.', ...run }, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `izumi-demo-${run.id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
 }
 const completed = run?.status === 'completed' && visible >= 7;
 return <section className="pitch-demo" aria-labelledby="pitch-title">
  <div className="pitch-demo__heading"><div><span className="pitch-demo__eyebrow">IZUMI / AGENT COMMERCE</span><h2 id="pitch-title">Una palabra.<br/><em>Toda la operación.</em></h2><p>Tu agente propone. Tú aceptas. La compra avanza con trazabilidad.</p></div><span className="pitch-demo__badge">● SIMULACIÓN · SIN DINERO REAL</span></div>
  <p className="pitch-demo__disclaimer">Escenario guionado de compra y blockchain. No envía WhatsApp, no ejecuta IA ni firma transacciones. El número identifica al destinatario de demostración.</p>
  {error && <div role="alert" className="pitch-demo__error">{error}</div>}
  {loading ? <p role="status">Cargando escenario…</p> : <>
  <div className="pitch-demo__setup">
   <label>Agente / presentador<input value={agent} maxLength={80} onChange={e=>setAgent(e.target.value)} disabled={busy || replaying}/></label>
   <label>Destinatario Perú<input type="tel" value={recipient} onChange={e=>setRecipient(e.target.value)} disabled={busy || replaying}/></label>
   <button className="pitch-demo__secondary" onClick={()=>void create()} disabled={busy || replaying || !agent.trim() || !/^\+51\d{9}$/.test(recipient)}>{busy ? 'Guardando…' : run ? '+ Nueva propuesta DEMO' : 'Preparar propuesta DEMO'}</button>
  </div>
  {run ? <div className="pitch-demo__stage">
   <div className="pitch-demo__phone">
    <div className="pitch-demo__phone-top"><span>9:41</span><span>DEMO WEB · ▮▮▮</span></div>
    <div className="pitch-demo__contact"><span className="pitch-demo__avatar">i</span><div><strong>{run.agent}</strong><small>+51 {run.recipient.slice(3)} · móvil simulado</small></div><span className="pitch-demo__dot"/></div>
    <div className="pitch-demo__messages">
     <span className="pitch-demo__date">VISTA PREVIA · NO ENVIADO</span>
     <div className="pitch-demo__bubble">Ya preparé tu propuesta de compra. Tú decides cuándo comenzar.<div className="pitch-demo__product"><span>PROPUESTA DEMO</span><h3>{run.quantity} polos de algodón</h3><p>{money(run.unitPriceCents)} / unidad · Perú</p><strong>{money(run.totalCents)}</strong><small>Precio y producto ficticios para el pitch.</small></div><p>Responde <b>ACEPTAR</b> para simular el flujo completo.</p></div>
     {visible >= 2 && <div className="pitch-demo__answer">ACEPTAR <small>Confirmado en DEMO, no WhatsApp</small></div>}
     {visible >= 4 && <div className="pitch-demo__bubble pitch-demo__confirmation">◇ Custodia simulada activada.<br/><small>Sin cargo ni transferencia real.</small></div>}
     {completed && <div className="pitch-demo__bubble pitch-demo__confirmation">✓ Operación DEMO completada.<br/><small>Comprobante y trazabilidad disponibles.</small></div>}
    </div>
    {run.status === 'waiting_acceptance' ? <form className="pitch-demo__reply" onSubmit={e=>{e.preventDefault(); if(response.trim().toUpperCase()==='ACEPTAR') void accept();}}><label htmlFor="pitch-response">Esperando tu aceptación</label><input id="pitch-response" value={response} onChange={e=>setResponse(e.target.value)} placeholder="Escribe ACEPTAR" disabled={busy}/><button disabled={busy || response.trim().toUpperCase() !== 'ACEPTAR'}>{busy ? 'Confirmando…' : 'ACEPTAR DEMO →'}</button><small>Al aceptar autorizas solo esta simulación.</small></form> : <div className="pitch-demo__reply"><strong>{completed ? '✓ Escenario completado' : 'Reproduciendo operación guardada…'}</strong><small>La animación presenta eventos ya persistidos.</small></div>}
   </div>
   <div className="pitch-demo__operation">
    <div className="pitch-demo__operation-head"><span className="pitch-demo__eyebrow">ORQUESTACIÓN DEL AGENTE</span><span>{String(visible).padStart(2,'0')} / 07</span></div>
    <h3>{completed ? 'De intención a operación.' : run.status === 'waiting_acceptance' ? 'El control siempre es tuyo.' : 'Una compra, siete hitos.'}</h3>
    <p className="pitch-demo__muted">{run.status === 'waiting_acceptance' ? 'La propuesta está guardada. Nada avanza hasta que escribas ACEPTAR.' : 'Registro de demostración persistido. Sin ejecución en una red blockchain.'}</p>
    <ol className="pitch-demo__timeline" aria-label="Estado de la operación">{stages.map((stage,index)=><li key={stage} className={index < visible ? 'is-done' : ''}><span className="pitch-demo__step">{index < visible ? '✓' : String(index+1).padStart(2,'0')}</span><div><strong>{stage}</strong><small>{descriptions[index]}</small></div><span>{index < visible ? 'REGISTRADO' : 'PENDIENTE'}</span></li>)}</ol>
    <div className="pitch-demo__metrics"><div><small>Valor demostrativo</small><strong>{money(run.totalCents)}</strong></div><div><small>Dinero transferido</small><strong>S/ 0.00</strong></div><div><small>Mensajes enviados</small><strong>0</strong></div></div>
    {completed && <div className="pitch-demo__receipt"><span>✓ COMPROBANTE DEMO · SIN VALIDEZ TRIBUTARIA</span><strong>{money(run.totalCents)}</strong><code>{run.receipt?.id}</code><p>Entrega y liberación simuladas. No acredita pago ni entrega física.</p><div className="pitch-demo__actions"><button onClick={download}>Descargar trazabilidad</button><button className="pitch-demo__secondary" onClick={()=>play(run)} disabled={replaying}>Repetir animación</button></div></div>}
    <details className="pitch-demo__evidence"><summary>Ver evidencia técnica · ledger simulado SHA256</summary><p>No anclado a blockchain. Estos digests locales no son hashes de transacciones ni prueba de consenso.</p><code>Escenario: {run.id}</code>{run.events.slice(0,visible).map(event=><div key={event.index}><strong>{event.index}. {event.label}</strong><small>{new Date(event.at).toLocaleString('es-PE')}</small><code>{event.digest}</code></div>)}</details>
   </div>
  </div> : <div className="pitch-demo__empty">Prepara una propuesta y deja el escenario listo para que el usuario escriba ACEPTAR.</div>}
  {history.length > 1 && <label className="pitch-demo__history">Escenarios guardados<select value={run?.id ?? ''} onChange={e=>{const selected=history.find(item=>item.id===e.target.value);if(selected)select(selected);}} disabled={busy || replaying}>{history.map(item=><option key={item.id} value={item.id}>{item.agent} · {item.recipient} · {item.status==='completed'?'Completado':'Esperando ACEPTAR'} · {item.id.slice(0,8)}</option>)}</select></label>}
  </>}
 </section>;
}
