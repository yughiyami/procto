import { useEffect, useRef, useState } from 'react';
import Vapi from '@vapi-ai/web';
import { Alert, Button, PageHeader } from '@izumi/ui';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './VoicePage.css';

type Mode = 'user' | 'sales';
type Phase = 'idle' | 'connecting' | 'active' | 'stopping';
const publicKey = (import.meta.env.VITE_VAPI_PUBLIC_KEY ?? '').trim();
const assistants: Record<Mode, string> = {
  user: (import.meta.env.VITE_VAPI_USER_ASSISTANT_ID ?? '').trim(),
  sales: (import.meta.env.VITE_VAPI_SALES_ASSISTANT_ID ?? '').trim(),
};
const phaseLabel: Record<Phase, string> = { idle: 'Micrófono apagado', connecting: 'Conectando…', active: 'Conversación activa', stopping: 'Finalizando…' };

export default function VoicePage() {
  useDocumentTitle('PACO por voz');
  const [mode, setMode] = useState<Mode>('user');
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState<{ role: string; text: string }[]>([]);
  const client = useRef<Vapi | null>(null);
  const active = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current = false;
      generation.current++;
      client.current?.stop();
      client.current?.removeAllListeners();
    };
  }, []);

  async function start() {
    if (active.current || !consent || !publicKey || !assistants[mode]) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError('Necesitas HTTPS (o localhost) y un navegador con acceso al micrófono.');
      return;
    }
    active.current = true;
    const attempt = ++generation.current;
    setPhase('connecting'); setError(''); setTranscript([]);
    let vapi: Vapi | null = null;
    try {
      // Permission is requested only after an explicit, informed start action.
      const permission = await navigator.mediaDevices.getUserMedia({ audio: true });
      permission.getTracks().forEach(track => track.stop());
      if (!mounted.current || !active.current || generation.current !== attempt) return;
      vapi = new Vapi(publicKey);
      client.current = vapi;
      const current = () => mounted.current && generation.current === attempt && client.current === vapi;
      vapi.on('call-start', () => {
        if (!current() || !active.current) { vapi?.stop(); return; }
        setPhase('active');
      });
      vapi.on('call-end', () => {
        if (current()) { active.current = false; setPhase('idle'); }
      });
      vapi.on('error', () => {
        if (current()) {
          active.current = false; setPhase('idle');
          setError('No se pudo mantener la conversación. Revisa permisos, conexión y configuración de Vapi.');
          vapi?.stop();
        }
      });
      vapi.on('message', (message: { type?: string; transcriptType?: string; role?: string; transcript?: string }) => {
        if (current() && active.current && message.type === 'transcript' && message.transcriptType === 'final' && typeof message.transcript === 'string') {
          const entry = { role: message.role === 'user' ? 'Tú' : 'PACO', text: message.transcript.slice(0, 4000) };
          setTranscript(items => [...items.slice(-49), entry]);
        }
      });
      const call = await vapi.start(assistants[mode]);
      if (!current() || !active.current) { vapi.stop(); return; }
      if (!call) { active.current = false; setPhase('idle'); setError('Vapi no inició la sesión. Revisa el asistente y la cuenta.'); }
    } catch {
      vapi?.stop();
      if (mounted.current && generation.current === attempt && (!vapi || client.current === vapi)) {
        active.current = false; setPhase('idle');
        setError('No se pudo iniciar. Autoriza el micrófono y revisa la configuración de Vapi.');
      }
    }
  }

  function stop() {
    active.current = false;
    generation.current++;
    setPhase('stopping');
    client.current?.stop();
    client.current?.removeAllListeners();
    client.current = null;
    setPhase('idle');
  }

  const configured = Boolean(publicKey && assistants[mode]);
  return <div className="voice-page">
    <PageHeader title="PACO por voz" subtitle="Habla desde tu navegador. Tú decides cuándo encender el micrófono." />
    <section className="voice-page__panel">
      <h2>¿Con quién quieres hablar?</h2>
      <div className="voice-page__modes" role="group" aria-label="Tipo de asistente">
        <Button variant={mode === 'user' ? 'primary' : 'secondary'} disabled={phase !== 'idle'} aria-pressed={mode === 'user'} onClick={() => { setMode('user'); setConsent(false); setTranscript([]); }}>Mi negocio</Button>
        <Button variant={mode === 'sales' ? 'primary' : 'secondary'} disabled={phase !== 'idle'} aria-pressed={mode === 'sales'} onClick={() => { setMode('sales'); setConsent(false); setTranscript([]); }}>Asistente de ventas</Button>
      </div>
      <p>{mode === 'user' ? 'Consulta y organiza tus ideas para el negocio.' : 'Practica respuestas y prepara conversaciones comerciales.'} Esta sesión no recibe automáticamente tus pedidos ni tu cuaderno contable.</p>
      <p>Usa asistentes configurados sin herramientas ni transferencias en Vapi. Esta pantalla no puede comprobar esa configuración externa.</p>
      {!configured && <Alert tone="warning" title="Voz pendiente de configurar">Falta la clave pública de Vapi o el ID del asistente seleccionado. Configúralos en el entorno web y recompila. No uses una clave privada.</Alert>}
      <Alert tone="info" title="Antes de conversar">El audio se transmite a Vapi y a los proveedores configurados en tu asistente. Puede generar costos. La grabación y retención dependen de tu configuración en Vapi: revísala antes de usar datos personales o financieros. Esta interfaz no envía mensajes de WhatsApp ni realiza llamadas telefónicas.</Alert>
      <label className="voice-page__consent"><input type="checkbox" checked={consent} disabled={phase !== 'idle'} onChange={event => setConsent(event.target.checked)} /> Entiendo el uso del micrófono, el envío del audio y los posibles costos.</label>
      <p role="status" aria-live="polite">{phaseLabel[phase]}</p>
      {error && <Alert tone="danger" title="Revisa la conexión">{error}</Alert>}
      <div className="voice-page__actions">
        <Button disabled={!configured || !consent || phase !== 'idle'} onClick={() => void start()}>Iniciar conversación</Button>
        <Button variant="secondary" disabled={phase === 'idle'} onClick={stop}>Detener</Button>
      </div>
    </section>
    <section className="voice-page__panel" aria-label="Transcripción de esta sesión">
      <h2>Conversación de esta sesión</h2>
      <p>Esta vista mantiene hasta 50 intervenciones en memoria, no en el cuaderno contable. Vapi puede conservar datos según su configuración.</p>
      {transcript.length ? <ol className="voice-page__transcript">{transcript.map((entry, index) => <li key={index}><strong>{entry.role}</strong><p>{entry.text}</p></li>)}</ol> : <p>No hay intervenciones todavía. Si el asistente no emite transcripciones, esta lista permanecerá vacía.</p>}
    </section>
  </div>;
}
