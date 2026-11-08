import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ProposalStatus } from '@izumi/contracts';
import { AGENT_KIND_LABELS, AGENT_RUN_STATUS_LABELS, PROPOSAL_SAFETY_NOTE, PROPOSAL_STATUS_LABELS, formatDateTime } from '@izumi/contracts';
import { queryKeys } from '@izumi/api-client';
import type { AgentRun } from '@izumi/contracts';
import { Alert, Badge, Button, EmptyState, PageHeader, Table, Tabs } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ProposalCard } from './ProposalCard';
import { StartRunDialog } from './StartRunDialog';
import './AgentsPage.css';

const STATUS_CHIPS: ProposalStatus[] = ['pending', 'approved', 'applied', 'rejected', 'failed'];

const RUN_STATUS_TONE: Record<AgentRun['status'], 'neutral' | 'success' | 'warning' | 'danger'> = {
  running: 'neutral',
  succeeded: 'success',
  budget_exhausted: 'warning',
  failed: 'danger',
};

function ProposalsTab() {
  const [status, setStatus] = useState<ProposalStatus>('pending');
  const suppliersQuery = useQuery({ queryKey: queryKeys.suppliers.all, queryFn: apiClient.listSuppliers });
  const proposalsQuery = useQuery({
    queryKey: queryKeys.agents.proposals(status),
    queryFn: () => apiClient.listProposals(status),
    refetchInterval: 4000,
  });

  return (
    <div className="agents__proposals-tab">
      <Alert tone="info" title="Cómo funcionan las propuestas">
        {PROPOSAL_SAFETY_NOTE}
      </Alert>

      <div className="agents__filters" role="group" aria-label="Filtrar por estado">
        {STATUS_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            className={`agents__filter-chip${status === chip ? ' agents__filter-chip--active' : ''}`}
            aria-pressed={status === chip}
            onClick={() => setStatus(chip)}
          >
            {PROPOSAL_STATUS_LABELS[chip]}
          </button>
        ))}
      </div>

      <QueryBoundary
        query={proposalsQuery}
        isEmpty={(data) => data.length === 0}
        emptyFallback={
          <EmptyState
            title="No hay propuestas con este estado"
            description="Las propuestas aparecen aquí cuando una ejecución de agente produce una sugerencia para revisar."
          />
        }
      >
        {(proposals) => (
          <QueryBoundary query={suppliersQuery}>
            {(suppliers) => (
              <ul className="agents__proposal-list">
                {proposals.map((proposal) => (
                  <li key={proposal.id}>
                    <ProposalCard proposal={proposal} suppliers={suppliers} />
                  </li>
                ))}
              </ul>
            )}
          </QueryBoundary>
        )}
      </QueryBoundary>
    </div>
  );
}

function RunsTab() {
  const [startOpen, setStartOpen] = useState(false);
  const runsQuery = useQuery({ queryKey: queryKeys.agents.runs, queryFn: apiClient.listAgentRuns, refetchInterval: 4000 });

  return (
    <div className="agents__runs-tab">
      <div className="agents__runs-actions">
        <Button variant="primary" onClick={() => setStartOpen(true)}>
          Iniciar ejecución
        </Button>
      </div>

      <QueryBoundary
        query={runsQuery}
        isEmpty={(data) => data.length === 0}
        emptyFallback={
          <EmptyState
            title="Todavía no hay ejecuciones"
            description="Inicia una ejecución de agente para extraer datos de un mensaje, revisar un aporte propuesto o redactar la próxima consulta."
          />
        }
      >
        {(runs) => (
          <Table<AgentRun>
            columns={[
              { key: 'kind', header: 'Tipo', render: (run) => AGENT_KIND_LABELS[run.kind] },
              {
                key: 'status',
                header: 'Estado',
                render: (run) => <Badge tone={RUN_STATUS_TONE[run.status]}>{AGENT_RUN_STATUS_LABELS[run.status]}</Badge>,
              },
              { key: 'steps', header: 'Pasos', render: (run) => `${run.stepsUsed} / ${run.maxSteps}` },
              { key: 'tokens', header: 'Tokens', render: (run) => run.tokensUsed },
              { key: 'createdAt', header: 'Creada', render: (run) => formatDateTime(run.createdAt) },
              {
                key: 'note',
                header: 'Detalle',
                render: (run) => {
                  if (run.status === 'budget_exhausted') {
                    return 'Se detuvo intencionalmente al alcanzar su límite de pasos o tokens.';
                  }
                  if (run.status === 'failed' && run.error) return run.error;
                  return '—';
                },
              },
              {
                key: 'link',
                header: 'Auditoría',
                render: (run) => <Link to={`/agentes/ejecuciones/${run.id}`}>Ver trazabilidad</Link>,
              },
            ]}
            rows={runs}
            keyExtractor={(run) => run.id}
          />
        )}
      </QueryBoundary>

      <StartRunDialog open={startOpen} onClose={() => setStartOpen(false)} />
    </div>
  );
}

export default function AgentsPage() {
  useDocumentTitle('Agentes');
  const [activeTab, setActiveTab] = useState('proposals');

  return (
    <div className="agents">
      <PageHeader
        title="Agentes"
        subtitle="Propuestas sugeridas a partir de mensajes y su trazabilidad. Ninguna se aplica sin que una persona la apruebe."
      />

      <Tabs
        label="Secciones de agentes"
        activeKey={activeTab}
        onChange={setActiveTab}
        tabs={[
          { key: 'proposals', label: 'Propuestas', panel: <ProposalsTab /> },
          { key: 'runs', label: 'Ejecuciones', panel: <RunsTab /> },
        ]}
      />
    </div>
  );
}
