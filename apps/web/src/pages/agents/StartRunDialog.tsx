import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { AgentKind } from '@izumi/contracts';
import { AGENT_KIND_LABELS } from '@izumi/contracts';
import type { StartAgentRunInput } from '@izumi/api-client';
import { ApiError, queryKeys } from '@izumi/api-client';
import { Alert, Button, Field, Modal, Select } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { useIdempotentMutation } from '../../hooks/useIdempotentMutation';

const AGENT_KINDS: AgentKind[] = ['extract', 'validate', 'compose'];

export function StartRunDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const lastIntent = useRef('');
  const [kind, setKind] = useState<AgentKind>('extract');
  const [inboxId, setInboxId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [conversationId, setConversationId] = useState('');

  const inboxQuery = useQuery({ queryKey: queryKeys.inbox.all, queryFn: apiClient.listInbox, enabled: open });
  const ordersQuery = useQuery({ queryKey: queryKeys.orders.all, queryFn: apiClient.listOrders, enabled: open });
  const conversationsQuery = useQuery({
    queryKey: queryKeys.chat.conversations,
    queryFn: apiClient.listConversations,
    enabled: open,
  });

  const startMutation = useIdempotentMutation(
    (input: StartAgentRunInput, idempotencyKey: string) => apiClient.startAgentRun(input, idempotencyKey),
    {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.agents.runs });
        handleClose();
      },
    },
  );

  function handleClose() {
    setKind('extract');
    setInboxId('');
    setOrderId('');
    setConversationId('');
    startMutation.reset();
    startMutation.resetIntent();
    onClose();
  }

  function start(input: StartAgentRunInput) {
    const signature = JSON.stringify(input);
    if (signature !== lastIntent.current) startMutation.resetIntent();
    lastIntent.current = signature;
    startMutation.mutate(input);
  }

  function handleSubmit() {
    if (kind === 'extract') {
      if (inboxId === '') return;
      start({ kind: 'extract', inboxId });
      return;
    }
    if (conversationId === '' || (kind === 'validate' && orderId === '')) return;
    if (kind === 'compose') start({ kind, conversationId, ...(orderId ? { orderId } : {}) });
    else start({ kind, orderId, conversationId });
  }

  const isUnavailable = startMutation.error instanceof ApiError && startMutation.error.status === 503;
  const errorMessage =
    startMutation.error instanceof ApiError ? startMutation.error.message : startMutation.error ? 'Ocurrió un error inesperado.' : null;

  const canSubmit = kind === 'extract' ? inboxId !== '' : conversationId !== '' && (kind === 'compose' || orderId !== '');

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Iniciar ejecución de agente"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={startMutation.isPending}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={startMutation.isPending} disabled={!canSubmit}>
            Iniciar
          </Button>
        </>
      }
    >
      <div className="agents__start-form">
        <p className="agents__start-hint">
          El agente solo puede leer datos y producir una propuesta. Ningún pedido cambia hasta que una persona la
          apruebe.
        </p>

        {errorMessage ? (
          <Alert tone={isUnavailable ? 'info' : 'danger'} title={isUnavailable ? 'DeepSeek no disponible' : 'No se pudo iniciar'}>
            {errorMessage}
            {isUnavailable ? (
              <>
                {' '}
                El camino manual sigue disponible: <Link to="/orders/nuevo">crear pedido manualmente</Link>.
              </>
            ) : null}
          </Alert>
        ) : null}

        <Field label="Tipo de ejecución" htmlFor="agent-run-kind">
          <Select
            id="agent-run-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as AgentKind)}
          >
            {AGENT_KINDS.map((value) => (
              <option key={value} value={value}>
                {AGENT_KIND_LABELS[value]}
              </option>
            ))}
          </Select>
        </Field>

        {kind === 'extract' ? (
          <Field label="Mensaje de bandeja" htmlFor="agent-run-inbox">
            <Select id="agent-run-inbox" value={inboxId} onChange={(event) => setInboxId(event.target.value)}>
              <option value="">Selecciona un mensaje…</option>
              {(inboxQuery.data ?? [])
                .filter((item) => item.status === 'pending')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.payload.sender} — {item.payload.text.slice(0, 60)}
                  </option>
                ))}
            </Select>
          </Field>
        ) : (
          <>
            <Field label={kind === 'compose' ? 'Pedido (opcional para primer contacto)' : 'Pedido'} htmlFor="agent-run-order">
              <Select id="agent-run-order" value={orderId} onChange={(event) => setOrderId(event.target.value)}>
                <option value="">Selecciona un pedido…</option>
                {(ordersQuery.data ?? []).map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Conversación" htmlFor="agent-run-conversation">
              <Select
                id="agent-run-conversation"
                value={conversationId}
                onChange={(event) => setConversationId(event.target.value)}
              >
                <option value="">Selecciona una conversación…</option>
                {(conversationsQuery.data ?? []).map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.displayName ?? conversation.peer}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
