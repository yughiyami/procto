import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { pool, migration } from '../src/db.js';
import { profileInput, profileMigration, registerProfile } from '../src/profile-wiring.js';

const payload = { name: ' Tejidos del sur ', city: 'Arequipa', activity: 'both', products: ['Polos'] };
test('Profile validation requires actual business data and rejects tenant overrides', () => {
  assert.equal(profileInput.parse(payload).name, 'Tejidos del sur');
  for (const change of [{ name: ' ' }, { city: '' }, { activity: 'admin' }, { products: [] }, { products: [''] }, { products: Array(41).fill('Polos') }, { orgId: randomUUID() }]) {
    assert.equal(profileInput.safeParse({ ...payload, ...change }).success, false);
  }
});

test('Profile persists per organization, syncs name, and protects tenant boundaries', { skip: !process.env.DATABASE_URL }, async () => {
  const db = pool();
  await db.query(migration); await db.query(profileMigration);
  const ids: string[] = [randomUUID(), randomUUID()];
  for (const id of ids) await db.query('INSERT INTO organizations(id,name) VALUES($1,$2)', [id, 'Initial']);
  const app = Fastify();
  app.setErrorHandler((error, _req, reply) => reply.code(error instanceof ZodError ? 400 : 500).send({ error: 'Request failed' }));
  app.addHook('preHandler', async (req, reply) => {
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (!token || !ids.includes(token)) return reply.code(401).send({ error: 'Unauthorized' });
    (req as unknown as { org: string }).org = token;
  });
  registerProfile(app, db);
  const headers = { authorization: `Bearer ${ids[0]}` };
  const otherHeaders = { authorization: `Bearer ${ids[1]}` };
  try {
    assert.equal((await app.inject({ url: '/profile' })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/profile', payload })).statusCode, 401);
    const initial = (await app.inject({ url: '/profile', headers })).json();
    assert.equal(initial.completed, false); assert.equal(initial.name, 'Initial');
    assert.equal((await app.inject({ method: 'POST', url: '/profile', headers, payload: { ...payload, orgId: ids[1] } })).statusCode, 400);
    const saved = await app.inject({ method: 'POST', url: '/profile', headers, payload });
    assert.equal(saved.statusCode, 200); assert.equal(saved.json().completed, true);
    assert.equal((await app.inject({ url: '/profile', headers })).json().city, 'Arequipa');
    assert.equal((await db.query('SELECT name FROM organizations WHERE id=$1', [ids[0]])).rows[0].name, 'Tejidos del sur');
    assert.equal((await app.inject({ url: '/profile', headers: otherHeaders })).json().completed, false);
    assert.equal((await app.inject({ method: 'POST', url: '/profile', headers, payload: { ...payload, city: 'Cusco' } })).statusCode, 200);
    assert.equal((await app.inject({ url: '/profile', headers })).json().city, 'Cusco');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM business_profiles WHERE org_id=$1', [ids[0]])).rows[0].n, 1);
  } finally {
    await app.close();
    for (const id of ids) { await db.query('DELETE FROM business_profiles WHERE org_id=$1', [id]); await db.query('DELETE FROM organizations WHERE id=$1', [id]); }
    await db.end();
  }
});
