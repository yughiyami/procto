import type { ChatMessage } from '@izumi/contracts';
import { OUTBOUND_STATUS_LABELS, formatDateTime } from '@izumi/contracts';
import { Alert, Badge, Icon } from '@izumi/ui';
import { validMediaUrl } from './mediaUrl';

const STATUS_TONE: Record<NonNullable<ChatMessage['status']>, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  queued: 'info',
  accepted: 'info',
  sent: 'info',
  unknown: 'warning',
  failed: 'danger',
};

function OutboundStatusBadge({ status }: { status: NonNullable<ChatMessage['status']> }) {
  return <Badge tone={STATUS_TONE[status]}>{OUTBOUND_STATUS_LABELS[status]}</Badge>;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isOutbound = message.direction === 'out';
  return (
    <li className={`conversation__bubble-row conversation__bubble-row--${message.direction}`}>
      <div className="conversation__bubble">
        <p className="conversation__bubble-body">{message.body}</p>
        {message.media ? <p className="conversation__bubble-media">
          {message.media.kind === 'sticker' ? 'Sticker' : 'Imagen'} · {validMediaUrl(message.media.url)
            ? <a href={message.media.url} target="_blank" rel="noopener noreferrer">Abrir archivo adjunto</a>
            : 'Archivo no disponible'}
        </p> : null}
        <div className="conversation__bubble-meta">
          {message.promotion ? <Badge tone="neutral" size="sm">Promoción</Badge> : null}
          <span className="conversation__bubble-time">{formatDateTime(message.at)}</span>
          {message.simulated ? (
            <Badge tone="warning" size="sm">
              Simulado
            </Badge>
          ) : null}
          {isOutbound && !message.simulated && message.status ? <OutboundStatusBadge status={message.status} /> : null}
        </div>
        {isOutbound && message.status === 'unknown' ? (
          <Alert tone="warning" className="conversation__bubble-warning">
            <strong>No sabemos si este mensaje llegó.</strong> El proveedor de WhatsApp respondió
            de forma ambigua y el sistema deliberadamente <strong>no reintenta el envío</strong>:
            reenviarlo podría entregarle el mensaje dos veces a una persona real. Verifica
            manualmente en WhatsApp si el mensaje llegó antes de continuar.
          </Alert>
        ) : null}
      </div>
    </li>
  );
}

export function MessageThread({ messages }: { messages: ChatMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="conversation__empty-thread">
        <Icon name="chat" size="lg" />
        <p>Todavía no hay mensajes en esta conversación.</p>
      </div>
    );
  }

  return (
    <ul className="conversation__thread" aria-label="Mensajes de la conversación">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </ul>
  );
}
