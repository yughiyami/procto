import { PhotoLibrary } from './PhotoLibrary';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { ApiError, queryKeys } from '@izumi/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Textarea } from '@izumi/ui';
import { validMediaUrl } from './mediaUrl';
import { apiClient } from '../../lib/apiClient';
import { useIdempotentMutation } from '../../hooks/useIdempotentMutation';

const MIN_LENGTH = 1;
const MAX_LENGTH = 4000;

interface ComposerProps {
  conversationId: string;
  /** True when `/integrations/status` already reports outgoing sends as disabled. */
  outgoingDisabled: boolean;
  simulated?: boolean;
}

/**
 * Sends via `POST /chat/conversations/:id/messages`. That route 409s naming
 * `WAPI_OUTGOING_ENABLED` when outgoing is off — we check that proactively via
 * `outgoingDisabled` so the control never invites a doomed submission, and we
 * still surface the exact server text verbatim if a race lets one through.
 */
export function Composer({ conversationId, outgoingDisabled, simulated }: ComposerProps) {
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<'text' | 'image' | 'sticker'>('text');
  const [url, setUrl] = useState('');
  const [promotion, setPromotion] = useState(false);
  const [consent, setConsent] = useState(false);
  const [disabledReason, setDisabledReason] = useState<string | undefined>(undefined);
  const queryClient = useQueryClient();

  const mutation = useIdempotentMutation(
    (variables: Parameters<typeof apiClient.sendChatMessage>[1], idempotencyKey) =>
      apiClient.sendChatMessage(conversationId, variables, idempotencyKey),
    {
      onSuccess: async () => {
        setBody('');
        setUrl('');
        setConsent(false);
        await queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversation(conversationId) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations });
      },
      onError: (error: unknown) => {
        if (error instanceof ApiError && error.kind === 'domain' && error.message.includes('WAPI_OUTGOING_ENABLED')) {
          setDisabledReason(error.message);
        }
      },
    },
  );

  const blocked = outgoingDisabled || Boolean(disabledReason);
  const mediaValid = kind === 'text' || validMediaUrl(url);
  const ready = mediaValid && (kind !== 'text' || Boolean(body.trim())) && (!promotion || consent);
  function resetDraft() { mutation.resetIntent(); mutation.reset(); }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!ready || trimmed.length > MAX_LENGTH || blocked || mutation.isPending) return;
    mutation.mutate({ body: kind === 'sticker' ? '' : trimmed,
      ...(kind !== 'text' ? { media: { kind, url: url.trim() } } : {}),
      ...(promotion ? { promotion: true, confirmPromotionConsent: true } : {}),
    });
  }

  if (blocked) {
    return (
      <div className="conversation__composer conversation__composer--disabled">
        <Alert tone="warning" title="Envío de mensajes deshabilitado">
          {disabledReason ??
            (simulated
              ? 'La simulación de salida está deshabilitada. El administrador debe habilitar WAPI_OUTGOING_ENABLED manteniendo WAPI_MODE=simulator. No se contactará a nadie.'
              : 'El envío saliente no está habilitado o todavía no se pudo verificar. Revisa Integraciones antes de intentar enviar.')}
        </Alert>
      </div>
    );
  }

  return (
    <form className="conversation__composer" onSubmit={handleSubmit}>
      {mutation.isError ? (
        <Alert tone="danger" title="No se pudo enviar">
          {mutation.error instanceof ApiError ? mutation.error.userMessage() : 'Ocurrió un error inesperado.'}
        </Alert>
      ) : null}
      {mutation.isSuccess ? <p role="status">{simulated ? 'Simulación registrada: no se contactó al destinatario.' : 'Mensaje registrado. Revisa su estado en la conversación; no confirma entrega.'}</p> : null}
      <p className="conversation__agent-note">{simulated ? 'Modo simulación: no contacta a nadie.' : 'Al enviar autorizas este mensaje a este contacto. En cola no significa entregado.'}</p>
      <details className="conversation__attachments"><summary>Fotos, stickers y promociones{kind !== 'text' ? ' · adjunto seleccionado' : ''}</summary>
      <PhotoLibrary onSelect={selectedUrl => { setKind('image'); setUrl(selectedUrl); resetDraft(); }} />
      <fieldset className="conversation__media-controls" disabled={mutation.isPending}>
        <legend>Preparar mensaje</legend>
        <label>Formato<select value={kind} onChange={event => { setKind(event.target.value as typeof kind); resetDraft(); }}>
          <option value="text">Texto</option><option value="image">Imagen con texto</option><option value="sticker">Sticker</option>
        </select></label>
        {kind !== 'text' ? <label>URL pública HTTPS del {kind === 'image' ? 'archivo de imagen' : 'sticker WebP'}
          <input type="url" maxLength={2048} value={url} placeholder="https://tu-sitio.com/archivo.webp" onChange={event => { setUrl(event.target.value); resetDraft(); }} aria-invalid={Boolean(url) && !mediaValid} />
          <small>No uses enlaces a páginas, archivos privados ni localhost. {kind === 'sticker' ? 'El sticker se envía sin texto adjunto.' : 'El texto inferior será el pie de imagen.'}</small>
          {url && !mediaValid ? <small role="alert">Necesitas una URL HTTPS pública válida, sin credenciales.</small> : null}
        </label> : null}
        <label className="conversation__media-check"><input type="checkbox" checked={promotion} onChange={event => { setPromotion(event.target.checked); setConsent(false); resetDraft(); }} /> Este mensaje es una promoción</label>
        {promotion ? <label className="conversation__media-check"><input type="checkbox" checked={consent} onChange={event => { setConsent(event.target.checked); resetDraft(); }} /> Confirmo que este contacto aceptó recibir promociones. Revisé el precio, condiciones y vigencia.</label> : null}
      </fieldset>
      </details>
      <div className="conversation__composer-row">
        {kind !== 'sticker' ? <Textarea
          aria-label="Escribe un mensaje"
          className="conversation__composer-input"
          placeholder="Escribe un mensaje…"
          rows={1}
          minLength={kind === 'text' ? MIN_LENGTH : undefined}
          maxLength={MAX_LENGTH}
          value={body}
          disabled={mutation.isPending}
          onChange={(event) => { setBody(event.target.value); resetDraft(); }}
        /> : null}
        <Button type="submit" loading={mutation.isPending} disabled={!ready}>
          {simulated ? 'Simular envío' : kind === 'text' ? 'Enviar' : kind === 'image' ? 'Enviar imagen' : 'Enviar sticker'}
        </Button>
      </div>
    </form>
  );
}
