import { z } from 'zod';
import { contributionSchema, quoteSchema, createOrderSchema } from './schemas.js';
import { sendMessageSchema } from './chat.js';

/**
 * Mirrors the `agent_runs`, `agent_steps` and `agent_proposals` tables in apps/api/src/db.ts.
 * See docs/agent-architecture.md — "An agent never mutates an order" is the rule this whole
 * file exists to encode: every write path from the agent runtime ends at a proposal, never a
 * direct domain call.
 */

export type AgentKind = 'extract' | 'validate' | 'compose';
export type AgentRunStatus = 'running' | 'succeeded' | 'failed' | 'budget_exhausted';
export type AgentStepType = 'plan' | 'tool_call' | 'tool_result' | 'final' | 'error';
export type ProposalKind = 'contribution' | 'quote' | 'message' | 'order_draft';
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'failed';

export type AgentRun = {
  id: string;
  orgId: string;
  kind: AgentKind;
  status: AgentRunStatus;
  orderId: string | null;
  conversationId: string | null;
  inboxId: string | null;
  input: unknown;
  stepsUsed: number;
  maxSteps: number;
  tokensUsed: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};

export type AgentStep = {
  id: string;
  runId: string;
  idx: number;
  type: AgentStepType;
  name: string | null;
  input: unknown;
  output: unknown;
  createdAt: string;
};

export type AgentProposal = {
  id: string;
  orgId: string;
  runId: string | null;
  kind: ProposalKind;
  orderId: string | null;
  conversationId: string | null;
  payload: unknown;
  rationale: string;
  status: ProposalStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  operationKey: string | null;
  error: string | null;
  createdAt: string;
};

/** Describes the job for a person deciding whether to launch a run, not the underlying model call. */
export const AGENT_KIND_LABELS: Record<AgentKind, string> = {
  extract: 'Extraer datos de un mensaje',
  validate: 'Revisar un aporte propuesto',
  compose: 'Redactar la próxima consulta',
};

export const AGENT_RUN_STATUS_LABELS: Record<AgentRunStatus, string> = {
  running: 'En ejecución',
  succeeded: 'Completado',
  failed: 'Fallido',
  budget_exhausted: 'Límite de pasos alcanzado',
};

export const AGENT_STEP_TYPE_LABELS: Record<AgentStepType, string> = {
  plan: 'Plan',
  tool_call: 'Llamada a herramienta',
  tool_result: 'Resultado de herramienta',
  final: 'Resultado final',
  error: 'Error',
};

export const PROPOSAL_KIND_LABELS: Record<ProposalKind, string> = {
  contribution: 'Aporte de proveedor',
  quote: 'Cotización',
  message: 'Mensaje',
  order_draft: 'Borrador de pedido',
};

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  applied: 'Aplicada',
  failed: 'Falló al aplicar',
};

/** One entry per agent kind, carrying only the input that kind actually needs. */
export const startRunSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('extract'), inboxId: z.string().min(1).max(256) }).strict(),
  z.object({ kind: z.literal('validate'), orderId: z.uuid(), conversationId: z.uuid() }).strict(),
  z.object({ kind: z.literal('compose'), orderId: z.uuid().optional(), conversationId: z.uuid() }).strict(),
]);

export const decideProposalSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    note: z.string().max(1000).optional(),
  })
  .strict();

/**
 * Validates each proposal's payload against the domain schema its kind maps to on approval
 * (docs/agent-architecture.md "Proposal → approval gate"). Reuses the existing schemas rather
 * than redeclaring their shapes, so a domain rule change only needs updating in one place.
 */
export const proposalPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('contribution'), payload: contributionSchema }).strict(),
  z.object({ kind: z.literal('quote'), payload: quoteSchema }).strict(),
  z.object({ kind: z.literal('message'), payload: sendMessageSchema }).strict(),
  z.object({ kind: z.literal('order_draft'), payload: createOrderSchema }).strict(),
]);

/** Rendered verbatim wherever a proposal is shown, so the safety guarantee reads the same everywhere. */
export const PROPOSAL_SAFETY_NOTE =
  'Esta propuesta es una sugerencia generada a partir de un mensaje: no compromete a nadie y solo se aplicará al pedido si una persona la aprueba.';
