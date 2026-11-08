import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, queryKeys } from '@izumi/api-client';
import type { Draft, InboxItem } from '@izumi/contracts';
import { formatDateTime } from '@izumi/contracts';
import { Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader, Tabs } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './InboxPage.css';

const MESSAGE_CLAMP_LENGTH = 160;

function MessageText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > MESSAGE_CLAMP_LENGTH;
  const shown = expanded || !isLong ? text : `${text.slice(0, MESSAGE_CLAMP_LENGTH)}…`;

  return (
    <div className="inbox__message-text">
      <p>{shown}</p>
      {isLong ? (
        <button type="button" className="inbox__expand" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Ver menos' : 'Ver más'}
        </button>
      ) : null}
    </div>
  );
}

interface ExtractAttemptError {
  status: number;
}

function MessagesTab({ items }: { items: InboxItem[] }) {
  const queryClient = useQueryClient();
  const [attemptErrors, setAttemptErrors] = useState<Record<string, ExtractAttemptError>>({});

  const extractMutation = useMutation({
    mutationFn: (id: string) => apiClient.extractInbox(id),
    onMutate: (id: string) => {
      setAttemptErrors((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.drafts.all }),
      ]);
    },
    onError: (error: unknown, id: string) => {
      const status = error instanceof ApiError ? error.status : 0;
      setAttemptErrors((current) => ({ ...current, [id]: { status } }));
    },
  });

  if (items.length === 0) {
    return (
      <EmptyState
        title="Todavía no llegan mensajes"
        description="Los mensajes llegan automáticamente por el webhook de Wapi cuando un contacto escribe por WhatsApp. Ninguno ha llegado todavía."
      />
    );
  }

  return (
    <ul className="inbox__list">
      {items.map((item) => {
        const message = item.payload;
        const isPending = item.status === 'pending';
        const isExtracting = extractMutation.isPending && extractMutation.variables === item.id;
        const attemptError = attemptErrors[item.id];

        return (
          <li key={item.id} className="inbox__item">
            <Card>
              <CardHeader
                title={message.sender}
                actions={
                  <Badge tone={item.status === 'extracted' ? 'success' : 'neutral'}>
                    {item.status === 'extracted' ? 'Extraído' : 'Pendiente'}
                  </Badge>
                }
              />
              <CardBody>
                <p className="inbox__timestamp">{formatDateTime(item.created_at)}</p>
                <MessageText text={message.text} />

                {attemptError?.status === 503 ? (
                  <Alert tone="info" title="Extracción por IA no configurada">
                    DeepSeek no está configurado en este entorno. Puedes seguir registrando el
                    pedido manualmente en <a href="/orders/nuevo">Nuevo pedido</a>.
                  </Alert>
                ) : null}
                {attemptError?.status === 409 ? (
                  <Alert tone="warning" title="Extracción en curso">
                    Ya hay una extracción en curso para este mensaje. Espera un momento e
                    inténtalo de nuevo.
                  </Alert>
                ) : null}
                {attemptError?.status === 502 ? (
                  <Alert tone="danger" title="La extracción falló">
                    No se pudo extraer la información de este mensaje. El mensaje sigue pendiente
                    y no se guardó ningún dato: puedes reintentar la extracción.
                  </Alert>
                ) : null}

                {isPending ? (
                  <div className="inbox__actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={isExtracting}
                      disabled={isExtracting}
                      onClick={() => extractMutation.mutate(item.id)}
                    >
                      Extraer datos
                    </Button>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function DraftsTab({ drafts }: { drafts: Draft[] }) {
  const navigate = useNavigate();

  if (drafts.length === 0) {
    return (
      <EmptyState
        title="Todavía no hay borradores"
        description="Los borradores se generan al extraer datos de un mensaje en la pestaña Mensajes. Ninguno se ha generado todavía."
      />
    );
  }

  return (
    <div className="inbox__drafts">
      <Alert tone="warning" title="Un borrador no es un pedido">
        Un borrador es una PROPUESTA extraída automáticamente de un mensaje. No es un pedido
        verificado, no compromete a nadie y todavía no ha sido revisado por una persona. Cada
        campo debe ser confirmado antes de convertirlo en un pedido real.
      </Alert>

      <ul className="inbox__list">
        {drafts.map((draft) => {
          const data = draft.data;
          return (
            <li key={draft.id} className="inbox__item">
              <Card>
                <CardHeader
                  title={data.product ?? 'No detectado'}
                  actions={
                    <Button
                      size="sm"
                      onClick={() =>
                        navigate('/orders/nuevo', {
                          state: {
                            fromDraftId: draft.id,
                            product: data.product,
                            quantity: data.quantity,
                            specifications: data.specifications,
                            deadline: data.deadline,
                            missingFields: data.missingFields,
                          },
                        })
                      }
                    >
                      Revisar y crear pedido
                    </Button>
                  }
                />
                <CardBody>
                  <dl className="inbox__draft-fields">
                    <div>
                      <dt>Producto</dt>
                      <dd>{data.product ?? 'No detectado'}</dd>
                    </div>
                    <div>
                      <dt>Cantidad</dt>
                      <dd>{data.quantity ?? 'No detectado'}</dd>
                    </div>
                    <div>
                      <dt>Especificaciones</dt>
                      <dd>{data.specifications ?? 'No detectado'}</dd>
                    </div>
                    <div>
                      <dt>Fecha límite</dt>
                      <dd>{data.deadline ? formatDateTime(data.deadline) : 'No detectado'}</dd>
                    </div>
                  </dl>
                  {data.missingFields.length > 0 ? (
                    <div className="inbox__missing-fields">
                      <span className="inbox__missing-fields-label">Datos que faltan:</span>
                      {data.missingFields.map((field) => (
                        <Badge key={field} tone="warning">
                          {field}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <p className="inbox__created-at">Generado el {formatDateTime(draft.created_at)}</p>
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function InboxPage() {
  useDocumentTitle('Bandeja de entrada');
  const [activeTab, setActiveTab] = useState('messages');

  const inboxQuery = useQuery({ queryKey: queryKeys.inbox.all, queryFn: apiClient.listInbox });
  const draftsQuery = useQuery({ queryKey: queryKeys.drafts.all, queryFn: apiClient.listDrafts });

  return (
    <div className="inbox">
      <PageHeader
        title="Bandeja de entrada"
        subtitle="Mensajes de WhatsApp recibidos y los borradores de pedido extraídos de ellos."
      />

      <Tabs
        label="Secciones de la bandeja"
        activeKey={activeTab}
        onChange={setActiveTab}
        tabs={[
          {
            key: 'messages',
            label: 'Mensajes',
            panel: (
              <QueryBoundary query={inboxQuery}>
                {(items) => <MessagesTab items={items} />}
              </QueryBoundary>
            ),
          },
          {
            key: 'drafts',
            label: 'Borradores',
            panel: (
              <QueryBoundary query={draftsQuery}>
                {(drafts) => <DraftsTab drafts={drafts} />}
              </QueryBoundary>
            ),
          },
        ]}
      />
    </div>
  );
}
