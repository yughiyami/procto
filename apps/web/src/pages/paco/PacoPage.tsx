import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@izumi/api-client';
import { Badge, Button, PageHeader } from '@izumi/ui';
import { useChainOrder } from '../../hooks/useChainOrder';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useStore } from '../../hooks/useStore';
import { apiClient } from '../../lib/apiClient';
import { buildPacoContext } from '../../paco/context';
import { askPaco } from '../../paco/client';
import type { PacoMessage, PacoReply } from '../../paco/client';
import { useProfile } from '../../profile/useProfile';
import { ROLES, useSession } from '../../session/SessionContext';
import type { Role } from '../../session/SessionContext';
import './PacoPage.css';

const QUICK: Record<Role, string[]> = {
  coordinadora: ['¿Qué me toca ahora?', '¿Cuánto cobra PROCTO?', '¿Cómo baja la comisión?'],
  comprador: ['¿Qué me toca ahora?', '¿Cómo sé que mi dinero está seguro?', '¿Dónde veo el comprobante?'],
  proveedor: ['¿Qué me toca ahora?', '¿Cómo pido un adelanto?', '¿Qué es la ficha de cumplimiento?'],
  inversionista: ['¿Qué me toca ahora?', '¿Cómo funciona un adelanto?', '¿Qué riesgo asumo?'],
};

type Turn = PacoMessage & { source?: PacoReply['source']; degraded?: boolean };

/** /paco: the assistant. It sees the person's role, orders and payment state and explains the next step in plain Spanish. */
export default function PacoPage() {
  useDocumentTitle('PACO, tu acompañante');
  const { role } = useSession();
  const profile = useProfile();
  const store = useStore();
  const orders = useQuery({ queryKey: queryKeys.orders.all, queryFn: apiClient.listOrders });
  const withChain = orders.data?.find((o) => store.getChain(o.id));
  const link = withChain ? store.getChain(withChain.id) : undefined;
  const chain = useChainOrder(link?.chainOrderId);
  const roleLabel = ROLES.find((r) => r.id === role)?.label ?? role;

  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [turns, busy]);

  const context = buildPacoContext({
    role,
    pro: profile.pro,
    businessName: profile.name,
    orders: orders.data ?? [],
    active:
      withChain && chain.data
        ? { order: withChain, status: chain.data.status.tag, shares: chain.data.shares.map((s) => ({ ...s, amount: s.amount })) }
        : undefined,
  });

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content }];
    setTurns(next);
    setDraft('');
    setBusy(true);
    const reply = await askPaco(next.map(({ role: r, content: c }) => ({ role: r, content: c })), context);
    setTurns([...next, { role: 'assistant', content: reply.text, source: reply.source, degraded: reply.degraded }]);
    setBusy(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  return (
    <div className="paco">
      <PageHeader title="PACO, tu acompañante" subtitle={`Te ayudo con lo que sigue en tu pedido. Estás como ${roleLabel}.`} />
      <p className="paco__note">
        PACO lee lo que ves en pantalla (tu rol, tus pedidos y el estado del pago) para explicarte el siguiente paso. No mueve dinero ni
        envía mensajes por ti, y nunca te pedirá claves.
      </p>

      <div className="paco__thread" role="log" aria-live="polite" aria-label="Conversación con PACO">
        {turns.length === 0 && (
          <p className="paco__empty">Pregúntame lo que quieras sobre cómo cobrar, depositar o pedir un adelanto.</p>
        )}
        {turns.map((t, i) => (
          <div key={i} className="paco__turn" data-role={t.role}>
            <p>{t.content}</p>
            {t.role === 'assistant' && (
              <small>
                {t.source === 'paco' ? 'Respuesta de PACO' : t.degraded ? 'Guía básica de PACO (sin conexión con el asistente)' : 'Guía básica de PACO'}
              </small>
            )}
          </div>
        ))}
        {busy && (
          <div className="paco__turn" data-role="assistant" aria-busy="true">
            <p>PACO está pensando…</p>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="paco__quick" aria-label="Preguntas sugeridas">
        {QUICK[role].map((q) => (
          <button key={q} type="button" disabled={busy} onClick={() => void send(q)}>
            {q}
          </button>
        ))}
      </div>

      <form className="paco__form" onSubmit={submit}>
        <label htmlFor="paco-input" className="paco__label">
          Tu pregunta
        </label>
        <input id="paco-input" value={draft} maxLength={500} onChange={(e) => setDraft(e.target.value)} placeholder="Escribe aquí…" autoComplete="off" />
        <Button type="submit" disabled={busy || !draft.trim()}>
          Preguntar
        </Button>
      </form>

      <p className="paco__more">
        <Badge tone="neutral">Por WhatsApp</Badge> Las conversaciones con clientes y talleres están en <Link to="/chat">Conversaciones</Link> y sus
        propuestas en <Link to="/agentes">Propuestas</Link>.
      </p>
    </div>
  );
}
