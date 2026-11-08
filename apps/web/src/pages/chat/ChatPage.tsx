import { CurrentBusiness } from '../../components/CurrentBusiness';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@izumi/api-client';
import type { ConversationSummary } from '@izumi/api-client';
import { formatDateTime } from '@izumi/contracts';
import { Badge, EmptyState, Icon, PageHeader } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { SimulatorPanel } from './SimulatorPanel';
import { NewConversationPanel } from './NewConversationPanel';
import { formatPeer } from './jid';
import './ChatPage.css';

function ConversationRow({ conversation }: { conversation: ConversationSummary }) {
  return (
    <li className="chat__row">
      <Link to={`/chat/${conversation.id}`} className="chat__row-link">
        <div className="chat__row-main">
          <span className="chat__row-peer">
            {conversation.displayName ? (
              <>
                <span className="chat__row-name">{conversation.displayName}</span>
                <span className="chat__row-phone">{formatPeer(conversation.peer)}</span>
              </>
            ) : (
              <span className="chat__row-name">{formatPeer(conversation.peer)}</span>
            )}
          </span>
          <span className="chat__row-preview">
            {conversation.preview ?? 'Sin mensajes todavía'}
          </span>
        </div>
        <div className="chat__row-meta">
          <span className="chat__row-time">{formatDateTime(conversation.lastMessageAt)}</span>
          <div className="chat__row-badges">
            {conversation.unreadCount > 0 ? (
              <Badge tone="info">{conversation.unreadCount} sin responder</Badge>
            ) : null}
            {conversation.orderId ? <Badge tone="neutral">Pedido vinculado</Badge> : null}
            {conversation.supplierId ? <Badge tone="neutral">Proveedor vinculado</Badge> : null}
            {conversation.agentPaused ? (
              <Badge tone="warning">Agente en pausa</Badge>
            ) : (
              <Badge tone="success">{conversation.autoReply ? 'Respuesta automática autorizada' : 'PACO · revisión humana'}</Badge>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

function ConversationList({ conversations }: { conversations: ConversationSummary[] }) {
  return (
    <ul className="chat__list">
      {conversations.map((conversation) => (
        <ConversationRow key={conversation.id} conversation={conversation} />
      ))}
    </ul>
  );
}

export default function ChatPage() {
  useDocumentTitle('Conversaciones');

  const conversationsQuery = useQuery({
    queryKey: queryKeys.chat.conversations,
    queryFn: apiClient.listConversations,
    refetchInterval: 4000,
  });

  const statusQuery = useQuery({
    queryKey: queryKeys.integrations.status,
    queryFn: apiClient.integrationsStatus,
  });

  const wapi = statusQuery.data?.wapi;
  const simulatorAvailable = wapi?.simulated === true;

  return (
    <div className="chat">
      <CurrentBusiness />
      <PageHeader
        title={
          <span className="chat__title">
            <Icon name="chat" /> Conversaciones
          </span>
        }
        subtitle="Agrega un contacto o continúa una conversación recibida por WhatsApp."
      />

      <NewConversationPanel />

      <QueryBoundary
        query={conversationsQuery}
        isEmpty={(data) => data.length === 0}
        emptyFallback={
          <EmptyState
            icon="chat"
            title="Todavía no hay conversaciones"
            description={
              simulatorAvailable ? (
                <>
                  Las conversaciones aparecen automáticamente cuando llega un mensaje por el
                  webhook de Wapi. Mientras integras un número real, usa el simulador de abajo
                  para crear una conversación de prueba.
                </>
              ) : (
                <>Las conversaciones aparecen automáticamente cuando llega un mensaje por el webhook de Wapi.</>
              )
            }
          />
        }
      >
        {(conversations) => <ConversationList conversations={conversations} />}
      </QueryBoundary>

      {simulatorAvailable ? <SimulatorPanel /> : null}
    </div>
  );
}
