import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { randomUUID, createHash } from 'node:crypto';
import { z, ZodError } from 'zod';
import { addContribution, quoteOrder, createOrder, DomainError, type Order } from './domain.js';
// Contract documented by the concurrent job-queue / chat work (src/jobs.ts, src/chat.ts —
// not owned by this module): enqueue(db, {orgId,kind,payload,dedupeKey?}) and
// queueOutbound(client, {orgId,conversationId,body,approvedBy}). Adapt these two imports if
// the landed signatures differ.
import { enqueue } from './jobs.js';
import { queueOutbound } from './chat.js';

// Duplicated rather than imported from app.ts to avoid a circular import: app.ts imports
// registerAgents from this file.
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const org = (req: unknown): string => (req as { org: string }).org;

const AGENT_RUN_BODY = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('extract'), inboxId: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ kind: z.literal('validate'), orderId: z.uuid(), conversationId: z.uuid() }).strict(),
  z.object({ kind: z.literal('compose'), orderId: z.uuid().optional(), conversationId: z.uuid() }).strict(),
]);

const DECIDE_BODY = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().max(2000).optional() }).strict();
const PROPOSAL_STATUS = z.enum(['pending', 'approved', 'rejected', 'applied', 'failed']);

type MutationResult = { status: number; body: unknown };

/**
 * The wire format is camelCase, matching @izumi/contracts. Postgres columns are
 * snake_case, so every row leaving this module goes through a mapper — returning
 * `SELECT *` directly would make the shared contract types a lie on the client.
 */
type Row = Record<string, unknown>;

const toRun = (r: Row) => ({
  id: r.id, orgId: r.org_id, kind: r.kind, status: r.status,
  orderId: r.order_id, conversationId: r.conversation_id, inboxId: r.inbox_id,
  input: r.input, stepsUsed: r.steps_used, maxSteps: r.max_steps,
  tokensUsed: r.tokens_used, error: r.error,
  createdAt: r.created_at, finishedAt: r.finished_at,
});

const toStep = (r: Row) => ({
  id: r.id, runId: r.run_id, idx: r.idx, type: r.type,
  name: r.name, input: r.input, output: r.output, createdAt: r.created_at,
});

const toProposal = (r: Row) => ({
  id: r.id, orgId: r.org_id, runId: r.run_id, kind: r.kind,
  orderId: r.order_id, conversationId: r.conversation_id,
  payload: r.payload, rationale: r.rationale, status: r.status,
  decidedBy: r.decided_by, decidedAt: r.decided_at,
  operationKey: r.operation_key, error: r.error, createdAt: r.created_at,
});

/**
 * All routes here require the org credential (req.org, set by app.ts's preHandler hook).
 *
 * THE GATE lives in the /decide endpoint below: it is the only place in this file that
 * calls into domain.ts's mutating functions. Every other route only ever reads, or writes
 * an agent_proposals row. See docs/agent-architecture.md, "the one rule that shapes
 * everything" — an agent never mutates an order.
 */
export function registerAgents(app: FastifyInstance, db: Pool): void {
  // Same idempotency machinery as app.ts's `mutation()`: an advisory lock keyed by
  // (org, Idempotency-Key), a fingerprint of the request, and a cached response in
  // `operations`. Approving (or creating a run) twice with the same key is a no-op that
  // replays the first response verbatim, including its HTTP status.
  async function withIdempotency(req: FastifyRequest, reply: FastifyReply, fn: (c: PoolClient) => Promise<MutationResult>) {
    const key = z.string().min(8).max(128).parse(req.headers['idempotency-key']);
    const tenant = org(req);
    const fingerprint = hash(req.method + req.url + JSON.stringify(req.body ?? null));
    const c = await db.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [tenant + ':' + key]);
      const prior = await c.query('SELECT fingerprint,response FROM operations WHERE org_id=$1 AND key=$2', [tenant, key]);
      if (prior.rowCount) {
        if (prior.rows[0].fingerprint !== fingerprint) throw new DomainError('Idempotency key reused with different request');
        await c.query('COMMIT');
        const cached = prior.rows[0].response as MutationResult;
        return reply.code(cached.status).send(cached.body);
      }
      const result = await fn(c);
      await c.query('INSERT INTO operations VALUES($1,$2,$3,$4)', [tenant, key, fingerprint, JSON.stringify(result)]);
      await c.query('COMMIT');
      return reply.code(result.status).send(result.body);
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }

  app.post('/agents/runs', (req, reply) => {
    // Mirrors the existing /inbox/:id/extract behaviour: manual operation stays available.
    if (!process.env.DEEPSEEK_API_KEY) return reply.code(503).send({ error: 'DeepSeek no está configurado; la operación manual sigue disponible' });
    const body = AGENT_RUN_BODY.parse(req.body);
    return withIdempotency(req, reply, async c => {
      const tenant = org(req);
      let conversationId: string | null = body.kind === 'extract' ? null : body.conversationId;
      if (body.kind === 'extract') {
        const inbox = await c.query('SELECT id, conversation_id FROM inbox WHERE id=$1 AND org_id=$2', [body.inboxId, tenant]);
        if (!inbox.rowCount) throw new DomainError('Elemento de bandeja no encontrado');
        conversationId = inbox.rows[0].conversation_id;
      } else {
        if (body.orderId) {
        const orderCheck = await c.query('SELECT id FROM orders WHERE id=$1 AND org_id=$2', [body.orderId, tenant]);
        if (!orderCheck.rowCount) throw new DomainError('Pedido no encontrado');
        }
        const conversationCheck = await c.query('SELECT id, agent_paused FROM conversations WHERE id=$1 AND org_id=$2', [body.conversationId, tenant]);
        if (!conversationCheck.rowCount) throw new DomainError('Conversación no encontrada');
        // This is where the kill switch bites: the agent may not act on a conversation
        // a person has not opted in. Delivery is not gated by it — see chat.ts.
        if (conversationCheck.rows[0].agent_paused === true) {
          throw new DomainError('La conversación tiene el agente pausado; actívalo antes de iniciar una ejecución');
        }
      }
      const runId = randomUUID();
      const maxSteps = Number(process.env.AGENT_MAX_STEPS ?? 8);
      await c.query(
        'INSERT INTO agent_runs(id,org_id,kind,order_id,conversation_id,inbox_id,input,max_steps) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          runId,
          tenant,
          body.kind,
          body.kind === 'extract' ? null : body.orderId ?? null,
          conversationId,
          body.kind === 'extract' ? body.inboxId : null,
          JSON.stringify(body),
          maxSteps,
        ],
      );
      // dedupeKey = runId: this specific run can never be enqueued twice, independent of
      // the Idempotency-Key replay above (defense in depth against a future caller that
      // enqueues directly).
      await enqueue(c, { orgId: tenant, kind: 'agent.run', payload: { runId }, dedupeKey: runId });
      const created = await c.query('SELECT * FROM agent_runs WHERE id=$1', [runId]);
      return { status: 201, body: toRun(created.rows[0]) };
    });
  });

  app.get('/agents/runs', async req => (await db.query('SELECT * FROM agent_runs WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100', [org(req)])).rows.map(toRun));

  app.get<{ Params: { id: string } }>('/agents/runs/:id', async req => {
    const id = z.uuid().parse(req.params.id);
    const tenant = org(req);
    const runRes = await db.query('SELECT * FROM agent_runs WHERE id=$1 AND org_id=$2', [id, tenant]);
    if (!runRes.rowCount) throw new DomainError('Run not found');
    // The whole reasoning trail, in order, so it is auditable end to end.
    const steps = await db.query('SELECT * FROM agent_steps WHERE run_id=$1 ORDER BY idx ASC', [id]);
    return { ...toRun(runRes.rows[0]), steps: steps.rows.map(toStep) };
  });

  app.get('/agents/proposals', async req => {
    const tenant = org(req);
    const query = z.object({ status: PROPOSAL_STATUS.optional() }).parse(req.query);
    if (query.status) return (await db.query('SELECT * FROM agent_proposals WHERE org_id=$1 AND status=$2 ORDER BY created_at DESC LIMIT 100', [tenant, query.status])).rows.map(toProposal);
    return (await db.query('SELECT * FROM agent_proposals WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100', [tenant])).rows.map(toProposal);
  });

  // THE GATE. The only route in this file allowed to call into domain.ts's mutating
  // functions, and it only ever does so re-validated against the current order state.
  app.post<{ Params: { id: string } }>('/agents/proposals/:id/decide', (req, reply) => {
    const id = z.uuid().parse(req.params.id);
    const body = DECIDE_BODY.parse(req.body);
    return withIdempotency(req, reply, async c => {
      const tenant = org(req);
      const idempotencyKey = String(req.headers['idempotency-key']);
      const proposalRes = await c.query('SELECT * FROM agent_proposals WHERE id=$1 AND org_id=$2 FOR UPDATE', [id, tenant]);
      if (!proposalRes.rowCount) throw new DomainError('Propuesta no encontrada');
      const proposal = proposalRes.rows[0];
      if (proposal.status !== 'pending') throw new DomainError(`La propuesta ya fue procesada (estado: ${proposal.status})`);
      // No per-user identity exists in this schema — only org-scoped credentials. The org
      // id is therefore the recorded human actor, exactly like every other mutation route
      // in app.ts (see e.g. `createOrder(req.body, org(req))`). Never the agent.
      const actor = tenant;

      if (body.decision === 'reject') {
        const updated = await c.query(
          "UPDATE agent_proposals SET status='rejected', decided_by=$1, decided_at=now() WHERE id=$2 RETURNING *",
          [actor, id],
        );
        return { status: 200, body: toProposal(updated.rows[0]) };
      }

      try {
        let appliedOrderId: string | null = proposal.order_id;
        switch (proposal.kind) {
          case 'contribution': {
            const orderRow = await c.query('SELECT data FROM orders WHERE id=$1 AND org_id=$2 FOR UPDATE', [proposal.order_id, tenant]);
            if (!orderRow.rowCount) throw new DomainError('El pedido de la propuesta ya no existe');
            const supplierId = (proposal.payload as { supplierId?: string }).supplierId;
            const supplierOk = await c.query('SELECT id FROM suppliers WHERE id=$1 AND org_id=$2', [supplierId ?? null, tenant]);
            if (!supplierOk.rowCount) throw new DomainError('Proveedor no encontrado');
            const orderData = orderRow.rows[0].data as Order;
            // addContribution re-parses `proposal.payload` against contributionSchema
            // itself — this IS the "re-validate against the current domain schema" step.
            addContribution(orderData, proposal.payload, actor);
            await c.query('UPDATE orders SET data=$1, updated_at=now() WHERE id=$2 AND org_id=$3', [JSON.stringify(orderData), orderData.id, tenant]);
            break;
          }
          case 'quote': {
            const orderRow = await c.query('SELECT data FROM orders WHERE id=$1 AND org_id=$2 FOR UPDATE', [proposal.order_id, tenant]);
            if (!orderRow.rowCount) throw new DomainError('El pedido de la propuesta ya no existe');
            const orderData = orderRow.rows[0].data as Order;
            quoteOrder(orderData, proposal.payload, actor);
            await c.query('UPDATE orders SET data=$1, updated_at=now() WHERE id=$2 AND org_id=$3', [JSON.stringify(orderData), orderData.id, tenant]);
            break;
          }
          case 'order_draft': {
            const created = createOrder(proposal.payload, actor);
            await c.query('INSERT INTO orders(id,org_id,data) VALUES($1,$2,$3)', [created.id, tenant, JSON.stringify(created)]);
            appliedOrderId = created.id;
            if (proposal.conversation_id) await c.query('UPDATE conversations SET order_id=$1 WHERE id=$2 AND org_id=$3 AND order_id IS NULL', [created.id, proposal.conversation_id, tenant]);
            break;
          }
          case 'message': {
            const conversationId = proposal.conversation_id as string | null;
            if (!conversationId) throw new DomainError('La propuesta no tiene conversación asociada');
            const conversationCheck = await c.query('SELECT id FROM conversations WHERE id=$1 AND org_id=$2', [conversationId, tenant]);
            if (!conversationCheck.rowCount) throw new DomainError('Conversación no encontrada');
            const messageBody = (proposal.payload as { body?: string }).body;
            if (!messageBody) throw new DomainError('La propuesta no tiene mensaje');
            await queueOutbound(c, { orgId: tenant, conversationId, body: messageBody, approvedBy: actor });
            break;
          }
          default:
            throw new DomainError(`Tipo de propuesta desconocido: ${proposal.kind}`);
        }
        const updated = await c.query(
          "UPDATE agent_proposals SET status='applied', decided_by=$1, decided_at=now(), operation_key=$2, order_id=$3 WHERE id=$4 RETURNING *",
          [actor, idempotencyKey, appliedOrderId, id],
        );
        return { status: 200, body: toProposal(updated.rows[0]) };
      } catch (error) {
        // A proposal built against a stale order fails loudly with the domain's own
        // message — never force-applied — and the failure is persisted for audit rather
        // than silently rolled back into oblivion.
        const message = error instanceof DomainError ? error.message : error instanceof ZodError ? error.issues.map(i => i.message).join('; ') : null;
        if (message === null) throw error; // Truly unexpected: roll back, surface as 500.
        const updated = await c.query(
          "UPDATE agent_proposals SET status='failed', decided_by=$1, decided_at=now(), operation_key=$2, error=$3 WHERE id=$4 RETURNING *",
          [actor, idempotencyKey, message, id],
        );
        return { status: 409, body: { error: message, proposal: toProposal(updated.rows[0]) } };
      }
    });
  });
}
