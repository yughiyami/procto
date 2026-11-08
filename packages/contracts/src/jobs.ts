/**
 * Mirrors the `jobs` table in apps/api/src/db.ts. The durable job queue: a worker claims rows
 * with `FOR UPDATE SKIP LOCKED`, so a crash never loses an outbound message or an agent run.
 */

export type JobKind = 'agent.run' | 'whatsapp.send';
export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

type JobBase = {
  id: string;
  orgId: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  dedupeKey: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

/** `kind` and `payload` are correlated per docs/agent-architecture.md — modelled as a union so a
 * handler can narrow on `kind` and get the right payload shape without a cast. */
export type Job =
  | (JobBase & { kind: 'agent.run'; payload: { runId: string } })
  | (JobBase & { kind: 'whatsapp.send'; payload: { outboundMessageId: string } });

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  pending: 'Pendiente',
  running: 'En ejecución',
  done: 'Completado',
  failed: 'Fallido',
};
