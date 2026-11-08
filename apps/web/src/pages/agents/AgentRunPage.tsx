import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AgentStep, AgentStepType } from '@izumi/contracts';
import { AGENT_KIND_LABELS, AGENT_RUN_STATUS_LABELS, AGENT_STEP_TYPE_LABELS, formatDateTime } from '@izumi/contracts';
import { queryKeys } from '@izumi/api-client';
import { Alert, Badge, DescriptionList, Icon, PageHeader } from '@izumi/ui';
import { apiClient } from '../../lib/apiClient';
import { QueryBoundary } from '../../components/QueryBoundary';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import './AgentRunPage.css';

const STEP_ICON: Record<AgentStepType, 'spark' | 'send' | 'package' | 'check' | 'alert-circle'> = {
  plan: 'spark',
  tool_call: 'send',
  tool_result: 'package',
  final: 'check',
  error: 'alert-circle',
};

const RUN_STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  running: 'neutral',
  succeeded: 'success',
  budget_exhausted: 'warning',
  failed: 'danger',
};

function StepJson({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <p className="agent-run__step-empty">Sin datos</p>;
  return <pre className="agent-run__step-json">{JSON.stringify(value, null, 2)}</pre>;
}

function StepEntry({ step }: { step: AgentStep }) {
  const [expanded, setExpanded] = useState(step.type !== 'tool_result');
  const isCollapsible = step.type === 'tool_result';
  const outputText = typeof step.output === 'string' ? step.output : JSON.stringify(step.output ?? '');
  const isLong = outputText.length > 240;

  return (
    <li className="agent-run__step">
      <div className="agent-run__step-marker" aria-hidden="true">
        <Icon name={STEP_ICON[step.type]} size="sm" />
      </div>
      <div className="agent-run__step-body">
        <div className="agent-run__step-header">
          <span className="agent-run__step-type">{AGENT_STEP_TYPE_LABELS[step.type]}</span>
          {step.name ? <span className="agent-run__step-name">{step.name}</span> : null}
          <span className="agent-run__step-time">{formatDateTime(step.createdAt)}</span>
        </div>

        {step.type === 'tool_call' ? (
          <div className="agent-run__step-section">
            <p className="agent-run__step-label">Herramienta llamada (solo lectura)</p>
            <StepJson value={step.input} />
          </div>
        ) : null}

        {step.type === 'tool_result' ? (
          <div className="agent-run__step-section">
            {isCollapsible && isLong ? (
              <button
                type="button"
                className="agent-run__step-toggle"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? 'Ocultar resultado' : 'Mostrar resultado'}
              </button>
            ) : (
              <p className="agent-run__step-label">Resultado</p>
            )}
            {expanded || !isLong ? <StepJson value={step.output} /> : null}
          </div>
        ) : null}

        {step.type === 'plan' || step.type === 'final' ? (
          <div className="agent-run__step-section">
            <StepJson value={step.output ?? step.input} />
          </div>
        ) : null}

        {step.type === 'error' ? (
          <Alert tone="danger" title="Paso con error">
            {typeof step.output === 'string' ? step.output : JSON.stringify(step.output)}
          </Alert>
        ) : null}
      </div>
    </li>
  );
}

export default function AgentRunPage() {
  const { id } = useParams<{ id: string }>();
  useDocumentTitle('Ejecución de agente');

  const runQuery = useQuery({
    queryKey: queryKeys.agents.run(id ?? 'missing'),
    queryFn: () => apiClient.getAgentRun(id ?? ''),
    enabled: Boolean(id),
    refetchInterval: query => query.state.data?.status === 'running' ? 2000 : false,
  });

  if (!id) {
    return <Alert tone="danger" title="Ejecución no encontrada">Falta el identificador de la ejecución.</Alert>;
  }

  return (
    <div className="agent-run">
      <PageHeader
        title="Trazabilidad de la ejecución"
        subtitle="Cada paso que dio el agente, en orden, tal como quedó registrado."
        breadcrumb={<Link to="/agentes">Agentes</Link>}
      />

      <QueryBoundary query={runQuery}>
        {(run) => (
          <div className="agent-run__content">
            <Alert tone="info" title="Todas las herramientas del agente son de solo lectura">
              Esta ejecución no pudo modificar ningún pedido: cada herramienta que usó el agente solo lee datos. Lo
              único que puede haber producido es una propuesta pendiente de aprobación humana.
            </Alert>

            <section className="agent-run__header-card">
              <div className="agent-run__header-top">
                <h2>{AGENT_KIND_LABELS[run.kind]}</h2>
                <Badge tone={RUN_STATUS_TONE[run.status] ?? 'neutral'}>{AGENT_RUN_STATUS_LABELS[run.status]}</Badge>
              </div>
              {run.status === 'budget_exhausted' ? (
                <p className="agent-run__budget-note">
                  El agente se detuvo intencionalmente al alcanzar su límite de pasos o de tokens; no es una falla.
                </p>
              ) : null}
              <DescriptionList
                items={[
                  { key: 'steps', term: 'Pasos usados', detail: `${run.stepsUsed} / ${run.maxSteps}` },
                  { key: 'tokens', term: 'Tokens usados', detail: String(run.tokensUsed) },
                  { key: 'createdAt', term: 'Iniciada', detail: formatDateTime(run.createdAt) },
                  { key: 'finishedAt', term: 'Finalizada', detail: run.finishedAt ? formatDateTime(run.finishedAt) : 'En curso' },
                ]}
              />
              {run.status === 'failed' && run.error ? (
                <Alert tone="danger" title="La ejecución falló">
                  {run.error}
                </Alert>
              ) : null}
            </section>

            <section>
              <h3 className="agent-run__section-title">Pasos</h3>
              {run.steps.length === 0 ? (
                <p className="agent-run__step-empty">Esta ejecución todavía no registró pasos.</p>
              ) : (
                <ol className="agent-run__timeline">
                  {run.steps.map((step) => (
                    <StepEntry key={step.id} step={step} />
                  ))}
                </ol>
              )}
            </section>

            <section>
              <h3 className="agent-run__section-title">Propuestas generadas</h3>
              <p>
                Revisa las propuestas producidas por esta ejecución en{' '}
                <Link to="/agentes">la pestaña Propuestas</Link>.
              </p>
            </section>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
