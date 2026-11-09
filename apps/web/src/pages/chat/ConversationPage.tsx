import { CurrentBusiness } from '../../components/CurrentBusiness';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@izumi/api-client';
import type { IntegrationsStatus } from '@izumi/contracts';
import { Icon, PageHeader, Spinner } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ConversationHeaderPanel } from './ConversationHeaderPanel';
import { MessageThread } from './MessageThread';
import { ConversationAgentPanel } from './ConversationAgentPanel';
import { Composer } from './Composer';
import { formatPeer } from './jid';
import './ConversationPage.css';

/** See ChatPage.tsx: the real response carries `wapi.outgoingEnabled`, already in the contract type. */
type WapiStatus = IntegrationsStatus['wapi'];

export default function ConversationPage() {
  const { id } = useParams<{ id: string }>();

  const conversationsQuery = useQuery({
    queryKey: queryKeys.chat.conversations,
    queryFn: apiClient.listConversations,
    refetchInterval: 4000,
  });

  const messagesQuery = useQuery({
    queryKey: id ? queryKeys.chat.conversation(id) : queryKeys.chat.conversations,
    queryFn: () => apiClient.getConversation(id ?? ''),
    refetchInterval: 4000,
    enabled: Boolean(id),
  });

  const statusQuery = useQuery({
    queryKey: queryKeys.integrations.status,
    queryFn: apiClient.integrationsStatus,
    refetchInterval: 15000,
  });

  const conversation = conversationsQuery.data?.find((item) => item.id === id);
  const wapi = statusQuery.data?.wapi as WapiStatus | undefined;
  const outgoingDisabled = !wapi?.outgoingEnabled;

  useDocumentTitle(conversation ? conversation.displayName ?? formatPeer(conversation.peer) : 'Conversación');

  if (!id) {
    return (
      <p role="alert" className="conversation__missing-id">
        Falta el identificador de la conversación en la URL.
      </p>
    );
  }

  return (
    <div className="conversation">
      <CurrentBusiness />
      <PageHeader
        title={
          <span className="conversation__title">
            <Icon name="chat" /> {conversation ? conversation.displayName ?? formatPeer(conversation.peer) : 'Conversación'}
          </span>
        }
        breadcrumb={
          <Link to="/chat" className="conversation__back">
            <Icon name="arrow-left" size="sm" /> Conversaciones
          </Link>
        }
      />

      {conversation ? (
        <ConversationHeaderPanel conversation={conversation} />
      ) : conversationsQuery.isPending ? (
        <div className="conversation__header-loading">
          <Spinner size="sm" label="Cargando datos de la conversación…" />
        </div>
      ) : null}

      <div className="conversation__body">
        <QueryBoundary query={messagesQuery} isEmpty={(data) => data.length === 0} emptyFallback={<MessageThread messages={[]} />}>
          {(messages) => <MessageThread messages={messages} />}
        </QueryBoundary>
      </div>

      <Composer key={id} conversationId={id} outgoingDisabled={outgoingDisabled} simulated={wapi?.simulated === true} />
      {conversation ? <details className="conversation__advanced"><summary>Revisar propuestas e historial de PACO</summary><ConversationAgentPanel key={id} conversation={conversation} messages={messagesQuery.data ?? []} status={statusQuery.data} /></details> : null}
    </div>
  );
}
