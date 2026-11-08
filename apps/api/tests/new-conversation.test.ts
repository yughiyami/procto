import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { pool, migration } from '../src/db.js';
import { registerChat } from '../src/chat-wiring.js';

test('New contact validates E.164, dedupes per tenant and never sends or activates the agent', { skip: !process.env.DATABASE_URL }, async () => {
  const db = pool();
  await db.query(migration);
  const orgA = randomUUID(), orgB = randomUUID();
  for (const id of [orgA, orgB]) await db.query('INSERT INTO organizations VALUES($1,$2)', [id, 'DEMO test contact']);
  const app = Fastify();
  app.setErrorHandler((error, _req, reply) => reply.code(error instanceof ZodError ? 400 : 500).send({ error: 'Invalid input' }));
  app.addHook('preHandler', async (req, reply) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token !== orgA && token !== orgB) return reply.code(401).send();
    (req as unknown as { org: string }).org = token;
  });
  registerChat(app, db);
  const payload = { phone: '+51900000099', displayName: 'DEMO contacto' };
  const headers = { authorization: `Bearer ${orgA}` };
  try {
    assert.equal((await app.inject({ method: 'POST', url: '/chat/conversations', payload })).statusCode, 401);
    for (const phone of ['953597691', '+51 900000099', '51900000099@s.whatsapp.net', '+0123456789']) {
      assert.equal((await app.inject({ method: 'POST', url: '/chat/conversations', headers, payload: { phone } })).statusCode, 400);
    }
    assert.equal((await app.inject({ method: 'POST', url: '/chat/conversations', headers, payload: { ...payload, orgId: orgB } })).statusCode, 400);
    const create = () => app.inject({ method: 'POST', url: '/chat/conversations', headers, payload });
    const [first, retry] = await Promise.all([create(), create()]);
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().id, retry.json().id);
    assert.equal(first.json().peer, '51900000099@s.whatsapp.net');
    assert.equal(first.json().displayName, 'DEMO contacto');
    const other = await app.inject({ method: 'POST', url: '/chat/conversations', headers: { authorization: `Bearer ${orgB}` }, payload });
    assert.notEqual(first.json().id, other.json().id);
    assert.equal((await db.query('SELECT agent_paused FROM conversations WHERE id=$1', [first.json().id])).rows[0].agent_paused, true);
    await db.query('UPDATE conversations SET agent_paused=false WHERE id=$1', [first.json().id]);
    await create();
    assert.equal((await db.query('SELECT agent_paused FROM conversations WHERE id=$1', [first.json().id])).rows[0].agent_paused, false);
    for (const table of ['inbox', 'jobs', 'outbound_messages']) {
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE org_id=$1`, [orgA])).rows[0].n, 0);
    }
  } finally {
    await app.close();
    for (const id of [orgA, orgB]) {
      await db.query('DELETE FROM conversations WHERE org_id=$1', [id]);
      await db.query('DELETE FROM organizations WHERE id=$1', [id]);
    }
    await db.end();
  }
});
