import type { FormEvent } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, queryKeys } from '@izumi/api-client';
import type { ConversationSummary, LinkConversationInput } from '@izumi/api-client';
import { Alert, Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, Field, Icon, Select, useToast } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { formatPeer } from './jid';

const UNCHANGED = '__unchanged__';
const CLEAR = '__clear__';

interface ConversationHeaderPanelProps {
  conversation: ConversationSummary;
}

function LinkForm({ conversation }: { conversation: ConversationSummary }) {
  const [orderChoice, setOrderChoice] = useState(UNCHANGED);
  const [supplierChoice, setSupplierChoice] = useState(UNCHANGED);
  const queryClient = useQueryClient();
  const toast = useToast();

  const ordersQuery = useQuery({ queryKey: queryKeys.orders.all, queryFn: apiClient.listOrders });
  const suppliersQuery = useQuery({ queryKey: queryKeys.suppliers.all, queryFn: apiClient.listSuppliers });

  const mutation = useMutation({
    mutationFn: (input: LinkConversationInput) => apiClient.linkConversation(conversation.id, input),
    onSuccess: async () => {
      toast.show({ tone: 'success', message: 'Vínculo actualizado.' });
      setOrderChoice(UNCHANGED);
      setSupplierChoice(UNCHANGED);
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations });
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversation(conversation.id) });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (orderChoice === UNCHANGED && supplierChoice === UNCHANGED) return;
    const input: LinkConversationInput = {};
    if (orderChoice !== UNCHANGED) input.orderId = orderChoice === CLEAR ? null : orderChoice;
    if (supplierChoice !== UNCHANGED) input.supplierId = supplierChoice === CLEAR ? null : supplierChoice;
    mutation.mutate(input);
  }

  return (
    <form className="conversation__link-form" onSubmit={handleSubmit}>
      <p className="conversation__link-hint">
        Deja un campo en “No cambiar” para conservar su vínculo actual. Elegir “Quitar vínculo”
        lo limpia explícitamente; solo se envía lo que cambias.
      </p>
      {mutation.isError ? (
        <Alert tone="danger" title="No se pudo actualizar el vínculo">
          {mutation.error instanceof ApiError ? mutation.error.userMessage() : 'Ocurrió un error inesperado.'}
        </Alert>
      ) : null}
      <div className="conversation__link-row">
        <Field label="Pedido" htmlFor="link-order">
          <Select
            id="link-order"
            value={orderChoice}
            onChange={(event) => setOrderChoice(event.target.value)}
          >
            <option value={UNCHANGED}>No cambiar</option>
            <option value={CLEAR}>Quitar vínculo</option>
            {ordersQuery.data?.map((order) => (
              <option key={order.id} value={order.id}>
                {order.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Proveedor" htmlFor="link-supplier">
          <Select
            id="link-supplier"
            value={supplierChoice}
            onChange={(event) => setSupplierChoice(event.target.value)}
          >
            <option value={UNCHANGED}>No cambiar</option>
            <option value={CLEAR}>Quitar vínculo</option>
            {suppliersQuery.data?.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        loading={mutation.isPending}
        disabled={orderChoice === UNCHANGED && supplierChoice === UNCHANGED}
      >
        Guardar vínculo
      </Button>
    </form>
  );
}

function AgentSwitch({ conversation }: { conversation: ConversationSummary }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof apiClient.setConversationAgent>[1]) => apiClient.setConversationAgent(conversation.id, input),
    onSuccess: async (result) => {
      toast.show({
        tone: 'success',
        message: result.agentPaused ? 'Agente pausado para esta conversación.' : 'Configuración del agente guardada.',
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations });
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversation(conversation.id) });
    },
  });

  return (
    <div className="conversation__agent-switch">
      <div className="conversation__agent-status">
        <Icon name={conversation.agentPaused ? 'pause' : 'play'} />
        <div>
          <p className="conversation__agent-state">
            {conversation.agentPaused ? (
              <Badge tone="warning">PACO en pausa</Badge>
            ) : (
              <Badge tone="success">PACO habilitado</Badge>
            )}
          </p>
          <p className="conversation__agent-note">
            {conversation.agentPaused ? 'Actívalo para ayudar a este comprador.' : conversation.autoReply ? 'Responde de forma conversacional a los mensajes nuevos.' : 'Prepara respuestas que tú apruebas.'}
          </p>
        </div>
      </div>
      {mutation.isError ? (
        <Alert tone="danger" title="No se pudo cambiar el estado del agente">
          {mutation.error instanceof ApiError ? mutation.error.userMessage() : 'Ocurrió un error inesperado.'}
        </Alert>
      ) : null}
      {conversation.agentPaused ? (
        <Button size="sm" variant="secondary" onClick={() => setConfirmOpen(true)} loading={mutation.isPending}>
          Activar agente
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => mutation.mutate({ paused: true })}
          loading={mutation.isPending}
        >
          Pausar agente
        </Button>
      )}
      <label className="conversation__media-check"><input type="checkbox" checked={conversation.autoReply === true} disabled={conversation.agentPaused || mutation.isPending}
        onChange={event => mutation.mutate({ paused: false, autoReply: event.target.checked })} />
        Responder automáticamente a este contacto (hasta 20 al día).
      </label>
      <p className="conversation__agent-note">BAJA detiene las respuestas. No ejecuta pagos reales.</p>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Activar agente para esta conversación"
        description="El agente podrá leer esta conversación y el pedido vinculado para proponer respuestas. Se activará en modo revisión humana; las respuestas automáticas se autorizan con la casilla separada."
        confirmLabel="Activar"
        onConfirm={async () => {
          await mutation.mutateAsync({ paused: false, autoReply: false });
          setConfirmOpen(false);
        }}
      />
    </div>
  );
}

export function ConversationHeaderPanel({ conversation }: ConversationHeaderPanelProps) {
  return (
    <Card className="conversation__header-panel">
      <CardHeader
        title={
          <span className="conversation__header-title">
            {conversation.displayName ?? formatPeer(conversation.peer)}
          </span>
        }
      />
      <CardBody>
        {conversation.displayName ? (
          <p className="conversation__header-phone">{formatPeer(conversation.peer)}</p>
        ) : null}
        {conversation.orderId ? (
          <p>
            <Link to={`/orders/${conversation.orderId}`} className="conversation__order-link">
              <Icon name="orders" size="sm" /> Ver pedido vinculado
            </Link>
          </p>
        ) : null}
        <details><summary>Vincular pedido o proveedor</summary><LinkForm conversation={conversation} /></details>
        <AgentSwitch conversation={conversation} />
      </CardBody>
    </Card>
  );
}
