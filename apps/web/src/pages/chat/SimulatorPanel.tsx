import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, queryKeys } from '@izumi/api-client';
import { Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input, Textarea, useToast } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { EXAMPLE_JID, isValidJid } from './jid';

/**
 * Only rendered by ChatPage when `/integrations/status` reports `wapi.simulated === true`.
 * Injects a FAKE inbound message through `POST /chat/simulate/inbound` for local testing —
 * nothing here ever touches a real WhatsApp number. See docs/agent-architecture.md
 * "Simulator mode".
 */
export function SimulatorPanel() {
  const [peer, setPeer] = useState(EXAMPLE_JID);
  const [text, setText] = useState('');
  const [peerError, setPeerError] = useState<string | undefined>(undefined);
  const queryClient = useQueryClient();
  const toast = useToast();

  const mutation = useMutation({
    mutationFn: () => apiClient.simulateInbound({ peer: peer.trim(), text }),
    onSuccess: async (result) => {
      toast.show({
        tone: 'success',
        message: result.duplicate
          ? 'Ese mensaje simulado ya existía; no se creó uno nuevo.'
          : 'Mensaje simulado inyectado en la conversación.',
      });
      setText('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations });
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPeerError(undefined);
    const trimmedPeer = peer.trim();
    if (!isValidJid(trimmedPeer)) {
      setPeerError('Usa el formato de JID de WhatsApp, por ejemplo 51987654321@s.whatsapp.net.');
      return;
    }
    if (!text.trim()) return;
    mutation.mutate();
  }

  return (
    <Card className="chat__simulator">
      <CardHeader
        title={
          <span className="chat__simulator-title">
            Simulador de mensajes entrantes <Badge tone="warning">Solo pruebas</Badge>
          </span>
        }
      />
      <CardBody>
        <p className="chat__simulator-note">
          Esto crea un mensaje entrante <strong>falso</strong> para probar el flujo, exactamente
          como si hubiera llegado por WhatsApp. No se envía ni se recibe nada real: la
          integración está en modo simulador.
        </p>
        {mutation.isError ? (
          <Alert tone="danger" title="No se pudo simular el mensaje">
            {mutation.error instanceof ApiError
              ? mutation.error.userMessage()
              : 'Ocurrió un error inesperado.'}
          </Alert>
        ) : null}
        <form onSubmit={handleSubmit} noValidate>
          <Field
            label="Número (JID de WhatsApp)"
            htmlFor="sim-peer"
            required
            hint="Formato: 51987654321@s.whatsapp.net"
            error={peerError}
          >
            <Input
              id="sim-peer"
              name="peer"
              value={peer}
              error={Boolean(peerError)}
              onChange={(event) => setPeer(event.target.value)}
            />
          </Field>
          <Field label="Texto del mensaje" htmlFor="sim-text" required>
            <Textarea
              id="sim-text"
              name="text"
              rows={2}
              maxLength={4000}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </Field>
          <Button type="submit" loading={mutation.isPending} disabled={!text.trim()}>
            Inyectar mensaje simulado
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
