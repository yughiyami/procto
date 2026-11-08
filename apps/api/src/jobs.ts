import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

/**
 * Durable job queue. A handler MUST be safe to run more than once: a crash between
 * `completeJob` and the caller observing it, or a claimed-but-never-finished job after
 * a worker dies, both mean at-least-once delivery. Never assume exactly-once.
 */

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

export type Job = {
  id: string;
  orgId: string;
  kind: string;
  payload: unknown;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  dedupeKey: string | null;
  lastError: string | null;
};

export type JobHandler = (job: Job, db: Pool) => Promise<void>;

const MAX_BACKOFF_SECONDS = 900;
const MAX_ERROR_LENGTH = 2000;

function toJob(row: {
  id: string;
  org_id: string;
  kind: string;
  payload: unknown;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_after: Date;
  dedupe_key: string | null;
  last_error: string | null;
}): Job {
  return {
    id: row.id,
    orgId: row.org_id,
    kind: row.kind,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAfter: row.run_after,
    dedupeKey: row.dedupe_key,
    lastError: row.last_error,
  };
}

export type EnqueueInput = {
  orgId: string;
  kind: string;
  payload: unknown;
  dedupeKey?: string;
  runAfter?: Date;
  maxAttempts?: number;
};

/** Safe to call twice with the same dedupeKey: the second call returns null. */
export async function enqueue(db: Pool | PoolClient, input: EnqueueInput): Promise<string | null> {
  const id = randomUUID();
  const r = await db.query(
    `INSERT INTO jobs(id, org_id, kind, payload, run_after, dedupe_key, max_attempts)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (org_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [id, input.orgId, input.kind, JSON.stringify(input.payload), input.runAfter ?? new Date(), input.dedupeKey ?? null, input.maxAttempts ?? 5],
  );
  return r.rowCount ? (r.rows[0] as { id: string }).id : null;
}

/**
 * Claim up to `limit` pending jobs. MUST run inside a transaction on `client` and be
 * followed by COMMIT before any handler executes — FOR UPDATE SKIP LOCKED is what lets
 * several workers claim concurrently without two of them picking up the same job.
 */
export async function claimJobs(client: PoolClient, limit: number): Promise<Job[]> {
  const claimed = await client.query(
    `SELECT id, org_id, kind, payload, status, attempts, max_attempts, run_after, dedupe_key, last_error
     FROM jobs
     WHERE status='pending' AND run_after <= now()
     ORDER BY run_after
     FOR UPDATE SKIP LOCKED
     LIMIT $1`,
    [limit],
  );
  if (claimed.rowCount === 0) return [];
  const ids = claimed.rows.map(row => row.id as string);
  const updated = await client.query(
    `UPDATE jobs SET status='running', attempts = attempts + 1, updated_at = now()
     WHERE id = ANY($1::uuid[])
     RETURNING id, org_id, kind, payload, status, attempts, max_attempts, run_after, dedupe_key, last_error`,
    [ids],
  );
  return updated.rows.map(toJob);
}

export async function completeJob(db: Pool | PoolClient, id: string): Promise<void> {
  await db.query(`UPDATE jobs SET status='done', updated_at=now() WHERE id=$1`, [id]);
}

/**
 * Failure policy: below max_attempts, back off exponentially (2^attempts seconds, capped
 * at 15 minutes) with up to 20% jitter and return to 'pending'. At or above max_attempts,
 * the job is terminally 'failed'. last_error is always recorded, truncated to a sane length.
 */
export async function failJob(db: Pool | PoolClient, id: string, error: string): Promise<void> {
  const truncated = error.slice(0, MAX_ERROR_LENGTH);
  const current = await db.query('SELECT attempts, max_attempts FROM jobs WHERE id=$1', [id]);
  if (!current.rowCount) return;
  const attempts = current.rows[0].attempts as number;
  const maxAttempts = current.rows[0].max_attempts as number;
  if (attempts >= maxAttempts) {
    await db.query(`UPDATE jobs SET status='failed', last_error=$2, updated_at=now() WHERE id=$1`, [id, truncated]);
    return;
  }
  const backoffSeconds = Math.min(2 ** attempts, MAX_BACKOFF_SECONDS);
  const jitterSeconds = backoffSeconds * Math.random() * 0.2;
  const delaySeconds = (backoffSeconds + jitterSeconds).toFixed(3);
  await db.query(
    `UPDATE jobs SET status='pending', run_after = now() + ($2 || ' seconds')::interval, last_error=$3, updated_at=now() WHERE id=$1`,
    [id, delaySeconds, truncated],
  );
}

// Handlers contributed from elsewhere (e.g. the agent runtime) register here so worker.ts
// does not need to import that module directly — it may not exist yet at build time.
const handlers = new Map<string, JobHandler>();

export function registerHandler(kind: string, handler: JobHandler): void {
  handlers.set(kind, handler);
}

export function getHandlers(): ReadonlyMap<string, JobHandler> {
  return handlers;
}

/**
 * Claim a batch inside one transaction, commit, then run each handler OUTSIDE that
 * transaction so a slow handler never holds the claim's row locks. Every job settles
 * independently: one handler throwing must not stop the others from completing.
 */
export async function runOnce(db: Pool, jobHandlers: ReadonlyMap<string, JobHandler>, batch: number): Promise<number> {
  const client = await db.connect();
  let claimed: Job[];
  try {
    await client.query('BEGIN');
    claimed = await claimJobs(client, batch);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  await Promise.all(
    claimed.map(async job => {
      const handler = jobHandlers.get(job.kind);
      if (!handler) {
        await failJob(db, job.id, `No handler registered for job kind "${job.kind}"`);
        return;
      }
      try {
        await handler(job, db);
        await completeJob(db, job.id);
      } catch (e) {
        await failJob(db, job.id, e instanceof Error ? e.message : String(e));
      }
    }),
  );

  return claimed.length;
}
