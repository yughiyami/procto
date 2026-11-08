import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { pool, migration } from '../src/db.js';
import { directoryMigration } from '../src/directory-wiring.js';
import { opportunityInput, opportunityStatusInput, opportunityMigration, registerOpportunities } from '../src/opportunity-wiring.js';

test('Opportunity validation: money, human status and loss reasons', () => {
  assert.equal(opportunityInput.parse({ title: 'Polos' }).amountCents, null);
  for (const amountCents of [-1, 1.1, Number.MAX_SAFE_INTEGER + 1]) assert.equal(opportunityInput.safeParse({ title: 'Polos', amountCents }).success, false);
  assert.equal(opportunityInput.safeParse({ title: 'Polos', status: 'won' }).success, false);
  assert.equal(opportunityStatusInput.safeParse({ status: 'lost' }).success, false);
  assert.equal(opportunityStatusInput.safeParse({ status: 'lost', lossReason: ' ' }).success, false);
  assert.equal(opportunityStatusInput.safeParse({ status: 'won' }).success, true);
});

test('Opportunities persist with tenant-bound company and explicit status transitions', { skip: !process.env.DATABASE_URL }, async () => {
  const db = pool(); await db.query(migration); await db.query(directoryMigration); await db.query(opportunityMigration);
  const ids: string[] = [randomUUID(), randomUUID()]; const companyId = randomUUID();
  for (const id of ids) await db.query('INSERT INTO organizations(id,name) VALUES($1,$2)', [id, 'Sales test']);
  await db.query("INSERT INTO directory_companies(id,org_id,name,source_url,data,source) VALUES($1,$2,'Test','https://example.com','{}','manual')", [companyId, ids[0]]);
  const app = Fastify();
  app.setErrorHandler((error, _req, reply) => reply.code(error instanceof ZodError ? 400 : 500).send({ error: 'Request failed' }));
  app.addHook('preHandler', async (req, reply) => { const token = req.headers.authorization?.replace(/^Bearer /, ''); if (!token || !ids.includes(token)) return reply.code(401).send({ error: 'Unauthorized' }); (req as unknown as { org: string }).org = token; });
  registerOpportunities(app, db);
  const headers = { authorization: `Bearer ${ids[0]}` }, other = { authorization: `Bearer ${ids[1]}` };
  try {
    assert.equal((await app.inject({ url: '/opportunities' })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/opportunities', headers: other, payload: { title: 'Cross tenant', companyId } })).statusCode, 404);
    const saved = await app.inject({ method: 'POST', url: '/opportunities', headers, payload: { title: 'Polos', companyId, amountCents: 105050 } });
    assert.equal(saved.statusCode, 201); const id = saved.json().id;
    assert.equal(saved.json().status, 'open'); assert.equal(saved.json().amountCents, 105050);
    assert.equal((await app.inject({ url: '/opportunities', headers: other })).json().items.length, 0);
    assert.equal((await app.inject({ method: 'POST', url: `/opportunities/${id}/status`, headers: other, payload: { status: 'won' } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/opportunities/${id}/status`, headers, payload: { status: 'lost' } })).statusCode, 400);
    await db.query("UPDATE sales_opportunities SET updated_at=now()-interval '20 days' WHERE id=$1", [id]);
    assert.equal((await app.inject({ url: '/opportunities', headers })).json().items[0].status, 'open');
    for (const status of ['quoted', 'won', 'lost', 'open']) {
      const result = await app.inject({ method: 'POST', url: `/opportunities/${id}/status`, headers, payload: { status, ...(status === 'lost' ? { lossReason: 'Cliente eligió otra oferta' } : {}) } });
      assert.equal(result.statusCode, 200); assert.equal(result.json().status, status);
      assert.equal(result.json().lossReason, status === 'lost' ? 'Cliente eligió otra oferta' : null);
    }
    assert.equal((await app.inject({ url: '/opportunities', headers })).json().items.length, 1);
  } finally { await app.close(); for (const id of ids) { await db.query('DELETE FROM sales_opportunities WHERE org_id=$1', [id]); await db.query('DELETE FROM directory_companies WHERE org_id=$1', [id]); await db.query('DELETE FROM organizations WHERE id=$1', [id]); } await db.end(); }
});
