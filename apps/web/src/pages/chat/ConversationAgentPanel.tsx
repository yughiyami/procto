import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, queryKeys, type ConversationSummary, type StartAgentRunInput } from '@izumi/api-client';
import { AGENT_RUN_STATUS_LABELS, type ChatMessage, type IntegrationsStatus } from '@izumi/contracts';
import { Alert, Button, Field, Select } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { useIdempotentMutation } from '../../hooks/useIdempotentMutation';
import { ProposalCard } from '../agents/ProposalCard';
import '../agents/AgentsPage.css';

/** Keep the approval gate next to the conversation, not hidden in a separate module. */
export function ConversationAgentPanel({ conversation, messages, status }: {
  conversation: ConversationSummary; messages: ChatMessage[]; status?: IntegrationsStatus;
}) {
  const [selected, setSelected] = useState('');
  const lastIntent = useRef('');
  const client = useQueryClient();
  const proposals = useQuery({ queryKey: queryKeys.agents.proposals('pending'), queryFn: () => apiClient.listProposals('pending'), refetchInterval: 4000 });
  const runs = useQuery({ queryKey: queryKeys.agents.runs, queryFn: apiClient.listAgentRuns, refetchInterval: 4000 });
  const suppliers = useQuery({ queryKey: queryKeys.suppliers.all, queryFn: apiClient.listSuppliers });
  const mutation = useIdempotentMutation((input: StartAgentRunInput, key: string) => apiClient.startAgentRun(input, key), {
    onSuccess: () => { void client.invalidateQueries({ queryKey: queryKeys.agents.runs }); },
  });
  function start(input: StartAgentRunInput) {
    const signature = JSON.stringify(input);
    if (signature !== lastIntent.current) mutation.resetIntent();
    lastIntent.current = signature;
    mutation.mutate(input);
  }
  const inbound = messages.filter(message => message.direction === 'in');
  const inboxId = selected || inbound.at(-1)?.id || '';
  const pending = proposals.data?.filter(proposal => proposal.conversationId === conversation.id) ?? [];
  const recent = runs.data?.filter(run => run.conversationId === conversation.id).slice(0, 3) ?? [];
  const running = recent.some(run => run.status === 'running');
  const blocked = conversation.agentPaused || !status?.deepseek.configured || mutation.isPending || running;
  return <section className="conversation__paco" aria-label="Asistente PACO">
    <h2>PACO · de mensaje a propuesta</h2>
    <p>{conversation.autoReply && !conversation.agentPaused ? 'Respuesta automática autorizada para mensajes nuevos. Revisa aquí las propuestas y el estado de cada envío.' : '1. Recibe el mensaje → 2. PACO propone → 3. Revisa y aprueba → 4. Consulta el estado del envío.'}</p>
    {!status?.deepseek.configured ? <Alert tone="warning" title="IA todavía no disponible">Configura DeepSeek en el servidor. <Link to="/integraciones">Ver integraciones</Link>. Puedes continuar creando pedidos y respondiendo manualmente.</Alert> : null}
    {conversation.agentPaused ? <p>Activa PACO arriba para permitir el análisis. Se iniciará en modo revisión humana.</p> : <p>Los mensajes nuevos pueden generar {conversation.autoReply ? 'respuestas automáticas' : 'propuestas para aprobación'} con el worker e IA configurados. Activarlo no procesa mensajes anteriores; selecciona uno para revisarlo.</p>}
    {mutation.isError ? <Alert tone="danger" title="No se pudo iniciar PACO">{mutation.error instanceof ApiError ? mutation.error.userMessage() : 'Revisa la conexión e inténtalo de nuevo.'}</Alert> : null}
    {mutation.isSuccess ? <p role="status">Solicitud registrada. El worker la procesará; las propuestas aparecerán aquí.</p> : null}
    <Field label="Mensaje a interpretar" htmlFor="paco-inbox"><Select id="paco-inbox" value={inboxId} disabled={blocked} onChange={event => { setSelected(event.target.value); mutation.resetIntent(); mutation.reset(); }}>
      {!inbound.length ? <option value="">Primero recibe o simula un mensaje</option> : null}
      {inbound.map(message => <option key={message.id} value={message.id}>{message.body.slice(0, 100)}</option>)}
    </Select></Field>
    <div className="conversation__paco-actions">
      <Button variant="secondary" disabled={blocked || !inboxId} onClick={() => start({ kind: 'extract', inboxId })}>Interpretar pedido</Button>
      <Button disabled={blocked || !inbound.length} onClick={() => { start({ kind: 'compose', conversationId: conversation.id, ...(conversation.orderId ? { orderId: conversation.orderId } : {}) }); }}>Proponer respuesta</Button>
    </div>
    {runs.isError || proposals.isError ? <Alert tone="warning" title="No se pudo actualizar PACO">Revisa la conexión. <Link to="/agentes">Abrir agentes</Link>.</Alert> : null}
    {recent.length ? <ul>{recent.map(run => <li key={run.id}><Link to={`/agentes/ejecuciones/${run.id}`}>{AGENT_RUN_STATUS_LABELS[run.status]} · {run.kind === 'compose' ? 'Respuesta' : run.kind === 'extract' ? 'Interpretación' : 'Revisión'}</Link>{run.status === 'failed' ? ' — revisa el error antes de reintentar.' : ''}</li>)}</ul> : null}
    <h3>Para tu aprobación ({pending.length})</h3>
    {!pending.length ? <p>No hay propuestas pendientes en esta conversación. <Link to="/agentes">Ver historial de decisiones</Link>.</p> : pending.map(proposal => <ProposalCard key={proposal.id} proposal={proposal} suppliers={suppliers.data ?? []} />)}
  </section>;
}
