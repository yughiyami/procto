import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { queryKeys, ApiError } from '@izumi/api-client';
import { Alert, DescriptionList, SkeletonBlock, SkeletonText } from '@izumi/ui';
import { formatDateTime } from '@izumi/contracts';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { SupplierResponseForm } from './SupplierResponseForm';
import { CustomerAcceptance } from './CustomerAcceptance';
import './InvitationPage.css';

/**
 * The only screen a supplier or customer ever sees: a standalone phone page
 * reached from a WhatsApp link, no app chrome, no auth. See routes.tsx
 * `/i/:token` and docs/frontend-contract.md's honesty rules — every state
 * below is rendered explicitly, there is no generic fallback here.
 */
export default function InvitationPage() {
  useDocumentTitle('Invitación · PROCTO');
  const { token } = useParams<{ token: string }>();

  const query = useQuery({
    queryKey: queryKeys.publicInvitation(token ?? ''),
    queryFn: () => apiClient.getPublicInvitation(token ?? ''),
    enabled: Boolean(token),
    retry: false,
  });

  if (!token) {
    return (
      <div className="invitation">
        <Alert tone="danger" title="Enlace inválido">
          Este enlace no incluye un código de invitación. Pide al coordinador que te envíe el
          enlace nuevamente.
        </Alert>
      </div>
    );
  }

  if (query.isPending) {
    return (
      <div className="invitation">
        <SkeletonText lines={1} width="60%" />
        <SkeletonText lines={3} />
        <SkeletonBlock height="220px" />
      </div>
    );
  }

  if (query.isError) {
    const isExpiredOrMissing = query.error instanceof ApiError && query.error.kind === 'domain';

    if (isExpiredOrMissing) {
      return (
        <div className="invitation">
          <Alert tone="warning" title="Este enlace ya no es válido">
            El enlace venció o no existe. Cada invitación es de un solo uso y expira a los pocos
            días. Pide al coordinador que te envíe un enlace nuevo.
          </Alert>
        </div>
      );
    }

    const message =
      query.error instanceof ApiError
        ? query.error.userMessage()
        : 'No pudimos cargar esta invitación.';

    return (
      <div className="invitation">
        <Alert tone="danger" title="No se pudo cargar la invitación">
          {message}
        </Alert>
        <button type="button" className="invitation__retry" onClick={() => void query.refetch()}>
          Reintentar
        </button>
      </div>
    );
  }

  const invitation = query.data;

  if (invitation.used) {
    return (
      <div className="invitation">
        <Alert tone="warning" title="Esta invitación ya fue respondida">
          Cada enlace acepta exactamente un envío. Si necesitas hacer un cambio, pide al
          coordinador que genere un nuevo enlace.
        </Alert>
        <DescriptionList
          className="invitation__summary"
          items={[
            { key: 'title', term: 'Pedido', detail: invitation.title },
            { key: 'specification', term: 'Especificación', detail: invitation.specification },
            { key: 'quantity', term: 'Cantidad', detail: invitation.quantity },
            { key: 'dueAt', term: 'Fecha límite', detail: formatDateTime(invitation.dueAt) },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="invitation">
      {invitation.purpose === 'supplier' ? (
        <SupplierResponseForm token={token} invitation={invitation} />
      ) : (
        <CustomerAcceptance token={token} invitation={invitation} />
      )}
      <p className="invitation__footer-note">
        Este enlace confirma que tienes acceso a la invitación, no verifica tu identidad.
      </p>
    </div>
  );
}
