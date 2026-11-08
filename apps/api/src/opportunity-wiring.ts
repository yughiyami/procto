import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

export const opportunityInput = z.object({
  title: z.string().trim().min(1).max(200),
  companyId: z.uuid().optional(),
  amountCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().default(null),
}).strict();
export const opportunityStatusInput = z.object({
  status: z.enum(['open', 'quoted', 'won', 'lost']),
  lossReason: z.string().trim().max(2000).optional(),
}).strict().refine(value => value.status !== 'lost' || Boolean(value.lossReason), { path: ['lossReason'], message: 'Indica por qué se perdió la oportunidad' });

export const opportunityMigration = `
CREATE TABLE IF NOT EXISTS sales_opportunities(
  id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id),
  company_id uuid, title text NOT NULL, amount_cents bigint,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','quoted','won','lost')),
  loss_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(amount_cents IS NULL OR amount_cents BETWEEN 0 AND 9007199254740991),
  CHECK(status <> 'lost' OR (loss_reason IS NOT NULL AND length(trim(loss_reason)) > 0)),
  FOREIGN KEY(org_id,company_id) REFERENCES directory_companies(org_id,id)
);
CREATE INDEX IF NOT EXISTS sales_opportunities_org_idx ON sales_opportunities(org_id,created_at);
`;
const tenant = (req: unknown) => (req as { org: string }).org;
const toOpportunity = (row: Record<string, any>) => ({ id: row.id, title: row.title, companyId: row.company_id, amountCents: row.amount_cents === null ? null : Number(row.amount_cents), currency: 'PEN', status: row.status, lossReason: row.loss_reason, createdAt: row.created_at, updatedAt: row.updated_at });

/** All pipeline states are human declarations, not payment or delivery confirmations. */
export function registerOpportunities(app: FastifyInstance, db: Pool) {
  app.get('/opportunities', async req => ({ items: (await db.query('SELECT * FROM sales_opportunities WHERE org_id=$1 ORDER BY created_at DESC,id', [tenant(req)])).rows.map(toOpportunity) }));
  app.post('/opportunities', async (req, reply) => {
    const data = opportunityInput.parse(req.body);
    if (data.companyId) {
      const company = await db.query('SELECT id FROM directory_companies WHERE org_id=$1 AND id=$2', [tenant(req), data.companyId]);
      if (!company.rowCount) return reply.code(404).send({ error: 'Company not found' });
    }
    const result = await db.query(`INSERT INTO sales_opportunities(id,org_id,company_id,title,amount_cents) VALUES($1,$2,$3,$4,$5) RETURNING *`, [randomUUID(), tenant(req), data.companyId ?? null, data.title, data.amountCents]);
    return reply.code(201).send(toOpportunity(result.rows[0]));
  });
  app.post<{ Params: { id: string } }>('/opportunities/:id/status', async (req, reply) => {
    const id = z.uuid().parse(req.params.id);
    const data = opportunityStatusInput.parse(req.body);
    const result = await db.query(`UPDATE sales_opportunities SET status=$3,loss_reason=$4,updated_at=now() WHERE id=$1 AND org_id=$2 RETURNING *`, [id, tenant(req), data.status, data.status === 'lost' ? data.lossReason : null]);
    if (!result.rowCount) return reply.code(404).send({ error: 'Opportunity not found' });
    return toOpportunity(result.rows[0]);
  });
}
