import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, queryKeys } from '@izumi/api-client';
import { Alert, Button, Card, CardBody, Field, Input } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { normalizeContactPhone, validContactPhone } from './phoneInput';

export function NewConversationPanel() {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () => apiClient.createConversation({ phone: normalizeContactPhone(phone), ...(displayName.trim() ? { displayName: displayName.trim() } : {}) }),
    onSuccess: async ({ id }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations });
      navigate(`/chat/${id}`);
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validContactPhone(phone)) {
      setPhoneError('Incluye + y el código de país. Para Perú: +51 seguido de los 9 dígitos.');
      return;
    }
    setPhoneError('');
    if (!create.isPending) create.mutate();
  }
  return (
    <Card>
      <CardBody>
        <Button type="button" aria-expanded={open} aria-controls="new-conversation-form" onClick={() => setOpen(!open)}>
          {open ? 'Cerrar formulario' : 'Nueva conversación'}
        </Button>
        {open ? <form id="new-conversation-form" onSubmit={submit}>
          <p>Guarda un contacto sin enviar mensajes. Si ya existe, abriremos su conversación. PACO permanece en pausa en contactos nuevos.</p>
          <Field label="Número con código de país" htmlFor="new-chat-phone" required error={phoneError} hint="Ejemplo Perú: +51 900 000 099. Puedes pegarlo con espacios o guiones; no enviamos mensajes al guardarlo.">
            <Input id="new-chat-phone" type="tel" inputMode="tel" autoComplete="tel" required maxLength={40} value={phone} disabled={create.isPending} onChange={event => { setPhone(event.target.value); setPhoneError(''); create.reset(); }} />
          </Field>
          <Field label="Nombre (opcional)" htmlFor="new-chat-name">
            <Input id="new-chat-name" maxLength={120} value={displayName} disabled={create.isPending} onChange={event => setDisplayName(event.target.value)} />
          </Field>
          {create.isError ? <Alert tone="danger" title="No se pudo abrir la conversación">{create.error instanceof ApiError ? create.error.userMessage() : 'Vuelve a intentarlo.'}</Alert> : null}
          <Button type="submit" loading={create.isPending}>Guardar y abrir conversación</Button>
        </form> : null}
      </CardBody>
    </Card>
  );
}
