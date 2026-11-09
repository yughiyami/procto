import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { AgentProposal, Supplier } from '@izumi/contracts';
import { PROPOSAL_KIND_LABELS, PROPOSAL_STATUS_LABELS, formatDateTime } from '@izumi/contracts';
import { ApiError, queryKeys } from '@izumi/api-client';
import { Alert, Badge, Button, Card, CardBody, CardFooter, CardHeader, ConfirmDialog, Textarea } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { useIdempotentMutation } from '../../hooks/useIdempotentMutation';
import { approvalSummary, ProposalPayloadView } from './proposalPayload';

const STATUS_TONE: Record<AgentProposal['status'], 'neutral' | 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'neutral',
  applied: 'success',
  failed: 'danger',
};

export function ProposalCard({ proposal, suppliers }: { proposal: AgentProposal; suppliers: Supplier[] }) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState('');

  async function afterDecision() {
    const invalidations = [
      queryClient.invalidateQueries({ queryKey: ['agents', 'proposals'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.conversations }),
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inbox.all }),
    ];
    if (proposal.orderId) {
      invalidations.push(
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(proposal.orderId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
      );
    }
    await Promise.all(invalidations);
  }

  const approveMutation = useIdempotentMutation(
    (_: void, idempotencyKey: string) => apiClient.decideProposal(proposal.id, { decision: 'approve' }, idempotencyKey),
    {
      onSuccess: () => {
        setConfirmOpen(false);
        void afterDecision();
      },
    },
  );

  const rejectMutation = useIdempotentMutation(
    (note: string | undefined, idempotencyKey: string) =>
      apiClient.decideProposal(proposal.id, { decision: 'reject', note }, idempotencyKey),
    {
      onSuccess: () => {
        setRejecting(false);
        setRejectNote('');
        void afterDecision();
      },
    },
  );

  const decisionError = approveMutation.error ?? rejectMutation.error;
  const decisionErrorMessage =
    decisionError instanceof ApiError ? decisionError.message : decisionError ? 'Ocurrió un error inesperado.' : null;

  const summary = approvalSummary(proposal.kind, proposal.payload, suppliers);

  return (
    <Card className="agents__proposal-card">
      <CardHeader
        title={PROPOSAL_KIND_LABELS[proposal.kind]}
        actions={<Badge tone={STATUS_TONE[proposal.status]}>{PROPOSAL_STATUS_LABELS[proposal.status]}</Badge>}
      />
      <CardBody>
        <p className="agents__proposal-meta">Creada el {formatDateTime(proposal.createdAt)}</p>
        <p className="agents__proposal-rationale">{proposal.rationale}</p>

        <ProposalPayloadView kind={proposal.kind} payload={proposal.payload} suppliers={suppliers} />

        <details className="agents__proposal-raw">
          <summary>Ver datos sin procesar (JSON)</summary>
          <pre className="agents__proposal-raw-json">{JSON.stringify(proposal.payload, null, 2)}</pre>
        </details>

        <div className="agents__proposal-links">
          {proposal.orderId ? <Link to={`/orders/${proposal.orderId}`}>Ver pedido</Link> : null}
          {proposal.conversationId ? <Link to={`/chat/${proposal.conversationId}`}>Ver conversación y envío</Link> : null}
          {proposal.runId ? <Link to={`/agentes/ejecuciones/${proposal.runId}`}>Ver ejecución</Link> : null}
        </div>

        {proposal.status === 'failed' && proposal.error ? (
          <Alert tone="danger" title="No se pudo aplicar">
            {proposal.error}
          </Alert>
        ) : null}

        {decisionErrorMessage ? (
          <Alert tone="danger" title="La decisión no se pudo procesar">
            {decisionErrorMessage}
          </Alert>
        ) : null}

        {rejecting ? (
          <div className="agents__reject-panel">
            <Textarea
              aria-label="Motivo del rechazo (opcional)"
              placeholder="Motivo del rechazo (opcional)"
              value={rejectNote}
              onChange={(event) => setRejectNote(event.target.value)}
              maxLength={1000}
            />
            <div className="agents__reject-actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setRejecting(false);
                  setRejectNote('');
                }}
                disabled={rejectMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={rejectMutation.isPending}
                onClick={() => rejectMutation.mutate(rejectNote.trim() === '' ? undefined : rejectNote.trim())}
              >
                Confirmar rechazo
              </Button>
            </div>
          </div>
        ) : null}
      </CardBody>
      {proposal.status === 'pending' && !rejecting ? (
        <CardFooter>
          <Button variant="secondary" onClick={() => setRejecting(true)}>
            Rechazar
          </Button>
          <Button variant="primary" disabled={approveMutation.isPending || rejectMutation.isPending} onClick={() => setConfirmOpen(true)}>
            Aprobar
          </Button>
        </CardFooter>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Aprobar propuesta"
        description={summary}
        confirmLabel="Aprobar y aplicar"
        cancelLabel="Cancelar"
        onConfirm={() => {
          approveMutation.mutate();
          setConfirmOpen(false);
        }}
      />
    </Card>
  );
}
