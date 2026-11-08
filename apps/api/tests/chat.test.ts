import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import Fastify from 'fastify';
import { z, ZodError } from 'zod';
import type { Pool } from 'pg';
import { pool, migration } from '../src/db.js';
import { DomainError } from '../src/domain.js';
import { registerChat } from '../src/chat-wiring.js';
import { enqueue, claimJobs, failJob, runOnce, type Job } from '../src/jobs.js';
import { upsertConversation, queueOutbound, deliverOutbound } from '../src/chat.js';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

// Minimal harness mirroring app.ts's auth hook and error handler, kept independent of
// app.ts/agent-wiring.ts so these tests do not depend on the concurrently-built agent
// runtime existing on disk.
function buildTestApp(db: Pool) {
  const app = Fastify();
  app.setErrorHandler((e, _req, reply) => {
    if (e instanceof ZodError) return reply.code(400).send({ error: 'Invalid input', issues: e.issues });
    if (e instanceof DomainError) return reply.code(409).send({ error: e.message });
    return reply.code(500).send({ error: 'Internal error' });
  });
  app.addHook('preHandler', async (req, reply) => {
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (!token) return reply.code(401).send({ error: 'Bearer token required' });
    const r = await db.query('SELECT org_id FROM credentials WHERE token_hash=$1', [hash(token)]);
    if (!r.rowCount) return reply.code(401).send({ error: 'Invalid token' });
    (req as unknown as { org: string }).org = r.rows[0].org_id;
  });
  registerChat(app, db);
  return app;
}

async function makeOrg(db: Pool, name: string) {
  const id = randomUUID();
  const token = randomBytes(32).toString('hex');
  await db.query('INSERT INTO organizations VALUES($1,$2)', [id, name]);
  await db.query('INSERT INTO credentials VALUES($1,$2)', [hash(token), id]);
  return { id, token, headers: { authorization: `Bearer ${token}` } };
}

async function dropOrgs(db: Pool, ids: string[]) {
  for (const id of ids) {
    await db.query('DELETE FROM outbound_messages WHERE org_id=$1', [id]);
    await db.query('DELETE FROM jobs WHERE org_id=$1', [id]);
    await db.query('DELETE FROM inbox WHERE org_id=$1', [id]);
    await db.query('DELETE FROM conversations WHERE org_id=$1', [id]);
    await db.query('DELETE FROM credentials WHERE org_id=$1', [id]);
    await db.query('DELETE FROM organizations WHERE id=$1', [id]);
  }
}

test('Queue: enqueue dedupes, SKIP LOCKED prevents double claim, failJob backs off then fails at max_attempts', { skip: !process.env.DATABASE_URL }, async () => {
  const db = pool();
  await db.query(migration);
  const org = await makeOrg(db, 'Queue Org');
  try {
    const dedupeKey = randomUUID();
    const first = await enqueue(db, { orgId: org.id, kind: 'test.kind', payload: { n: 1 }, dedupeKey });
    const second = await enqueue(db, { orgId: org.id, kind: 'test.kind', payload: { n: 1 }, dedupeKey });
    assert.ok(first);
    assert.equal(second, null);
    const count = await db.query('SELECT count(*)::int AS c FROM jobs WHERE org_id=$1 AND dedupe_key=$2', [org.id, dedupeKey]);
    assert.equal(count.rows[0].c, 1);

    const contestedId = await enqueue(db, { orgId: org.id, kind: 'test.kind', payload: {} });
    assert.ok(contestedId);
    const clientA = await db.connect();
    const clientB = await db.connect();
    try {
      await clientA.query('BEGIN');
      await clientB.query('BEGIN');
      const claimA = await claimJobs(clientA, 10);
      const claimB = await claimJobs(clientB, 10);
      const gotA = claimA.some(j => j.id === contestedId);
      const gotB = claimB.some(j => j.id === contestedId);
      assert.notEqual(gotA, gotB, 'exactly one concurrent claimer must win the contested job');
      await clientA.query('COMMIT');
      await clientB.query('COMMIT');
    } finally {
      clientA.release();
      clientB.release();
    }

    const failId = await enqueue(db, { orgId: org.id, kind: 'test.kind', payload: {}, maxAttempts: 2 });
    assert.ok(failId);
    await db.query('UPDATE jobs SET attempts=1 WHERE id=$1', [failId]);
    await failJob(db, failId as string, 'transient boom');
    const afterFirstFailure = (await db.query('SELECT status, run_after, last_error FROM jobs WHERE id=$1', [failId])).rows[0];
    assert.equal(afterFirstFailure.status, 'pending');
    assert.ok(afterFirstFailure.run_after.getTime() > Date.now());
    assert.equal(afterFirstFailure.last_error, 'transient boom');

    await db.query('UPDATE jobs SET attempts=2 WHERE id=$1', [failId]);
    await failJob(db, failId as string, 'terminal boom');
    const afterSecondFailure = (await db.query('SELECT status FROM jobs WHERE id=$1', [failId])).rows[0];
    assert.equal(afterSecondFailure.status, 'failed');
  } finally {
    await dropOrgs(db, [org.id]);
    await db.end();
  }
});

test('Simulator: POST /chat/simulate/inbound stores a conversation and inbox row exactly once', { skip: !process.env.DATABASE_URL }, async () => {
  const db = pool();
  await db.query(migration);
  const org = await makeOrg(db, 'Simulator Org');
  const app = buildTestApp(db);
  try {
    delete process.env.WAPI_MODE;
    delete process.env.WAPI_API_KEY;
    const peer = '51900000000@s.whatsapp.net';
    const first = await app.inject({ method: 'POST', url: '/chat/simulate/inbound', headers: org.headers, payload: { peer, text: 'Hola, necesito 20 polos' } });
    assert.equal(first.statusCode, 201);
    assert.equal(first.json().duplicate, false);
    const second = await app.inject({ method: 'POST', url: '/chat/simulate/inbound', headers: org.headers, payload: { peer, text: 'Hola, necesito 20 polos' } });
    assert.equal(second.statusCode, 201);
    assert.equal(second.json().duplicate, true);
    const conversations = await db.query('SELECT id, agent_paused FROM conversations WHERE org_id=$1 AND peer=$2', [org.id, peer]);
    assert.equal(conversations.rowCount, 1);
    assert.equal(conversations.rows[0].agent_paused, true, 'upsert must never flip agent_paused to false');
    const inboxCount = await db.query('SELECT count(*)::int AS c FROM inbox WHERE org_id=$1', [org.id]);
    assert.equal(inboxCount.rows[0].c, 1);
  } finally {
    await app.close();
    await dropOrgs(db, [org.id]);
    await db.end();
  }
});

test('Simulator mode is refused when WAPI_MODE=live', { skip: !process.env.DATABASE_URL }, async () => {
  const db = pool();
  await db.query(migration);
  const org = await makeOrg(db, 'Live Guard Org');
  const app = buildTestApp(db);
  try {
    process.env.WAPI_MODE = 'live';
    process.env.WAPI_API_KEY = 'secret';
    const r = await app.inject({ method: 'POST', url: '/chat/simulate/inbound', headers: org.headers, payload: { peer: '51900000001@s.whatsapp.net', text: 'Hola' } });
    assert.equal(r.statusCode, 409);
  } finally {
    delete process.env.WAPI_MODE;
    delete process.env.WAPI_API_KEY;
    await app.close();
    await dropOrgs(db, [org.id]);
    await db.end();
  }
});

test('Outbound job: simulator sends succeed, disabled outgoing refuses without retry, agent pause does not block a human send, live "unknown" completes the job without retry', { skip: !process.env.DATABASE_URL }, async () => {
  const db = pool();
  await db.query(migration);
  const org = await makeOrg(db, 'Outbound Org');
  const originalFetch = globalThis.fetch;
  const originalWapiOrg = process.env.WAPI_ORG_ID;
  try {
    const conversation = await upsertConversation(db, { orgId: org.id, peer: '51911111111@s.whatsapp.net' });
    await db.query('UPDATE conversations SET agent_paused=false WHERE id=$1', [conversation.id]);

    // 1) simulator mode -> sent with a sim- provider id, nothing leaves the machine.
    delete process.env.WAPI_MODE;
    delete process.env.WAPI_API_KEY;
    process.env.WAPI_OUTGOING_ENABLED = 'true';
    const simulated = await withClient(db, c => queueOutbound(c, { orgId: org.id, conversationId: conversation.id, body: 'Hola cliente', approvedBy: 'test' }));
    await deliverOutbound(db, simulated.id);
    const simulatedRow = (await db.query('SELECT status, provider_message_id FROM outbound_messages WHERE id=$1', [simulated.id])).rows[0];
    assert.equal(simulatedRow.status, 'sent');
    assert.ok(String(simulatedRow.provider_message_id).startsWith('sim-'));

    // 2) outgoing disabled -> policy failure, not a retryable error.
    process.env.WAPI_OUTGOING_ENABLED = 'false';
    const disabled = await withClient(db, c => queueOutbound(c, { orgId: org.id, conversationId: conversation.id, body: 'Segundo mensaje', approvedBy: 'test' }));
    await deliverOutbound(db, disabled.id);
    const disabledRow = (await db.query('SELECT status, error FROM outbound_messages WHERE id=$1', [disabled.id])).rows[0];
    assert.equal(disabledRow.status, 'failed');
    assert.match(disabledRow.error, /WAPI_OUTGOING_ENABLED/);
    process.env.WAPI_OUTGOING_ENABLED = 'true';

    // 3) agent_paused must NOT block delivery. It is the agent kill switch, it defaults
    // to true, and every queued row was authorized by a human â€” gating delivery on it
    // would stop a person from replying by hand in a fresh conversation. The pause is
    // enforced when starting an agent run instead (see agent-wiring.ts).
    await db.query('UPDATE conversations SET agent_paused=true WHERE id=$1', [conversation.id]);
    const paused = await withClient(db, c => queueOutbound(c, { orgId: org.id, conversationId: conversation.id, body: 'Tercer mensaje', approvedBy: 'human:test' }));
    await deliverOutbound(db, paused.id);
    const pausedRow = (await db.query('SELECT status FROM outbound_messages WHERE id=$1', [paused.id])).rows[0];
    assert.equal(pausedRow.status, 'sent', 'a human-authorized send must go out even while the agent is paused');
    await db.query('UPDATE conversations SET agent_paused=false WHERE id=$1', [conversation.id]);

    // 4) live mode, ambiguous provider response -> row stays 'unknown' and the JOB completes
    // normally (attempts stays at 1): re-sending could double-deliver to a real customer.
    process.env.WAPI_MODE = 'live';
    process.env.WAPI_API_KEY = 'secret';
    process.env.WAPI_BASE_URL = 'https://wapi.example';
    globalThis.fetch = (async () => new Response('boom', { status: 500 })) as typeof fetch;
    // Missing, malformed and foreign channel tenants fail closed before any fetch.
    let rejectedFetches = 0;
    globalThis.fetch = (async () => { rejectedFetches++; throw new Error('Must not send'); }) as typeof fetch;
    for (const channelOrg of ['', 'not-a-uuid', randomUUID()]) {
      process.env.WAPI_ORG_ID = channelOrg;
      const rejected = await withClient(db, c => queueOutbound(c, { orgId: org.id, conversationId: conversation.id, body: 'Do not deliver', approvedBy: 'test' }));
      await deliverOutbound(db, rejected.id);
      const row = (await db.query('SELECT status,error FROM outbound_messages WHERE id=$1', [rejected.id])).rows[0];
      assert.equal(row.status, 'failed'); assert.match(row.error, /WAPI_ORG_ID/);
    }
    assert.equal(rejectedFetches, 0);
    process.env.WAPI_ORG_ID = org.id;
    const live = await withClient(db, c => queueOutbound(c, { orgId: org.id, conversationId: conversation.id, body: 'Cuarto mensaje', approvedBy: 'test' }));
    let liveCalls = 0;
    globalThis.fetch = (async () => {
      liveCalls++;
      assert.equal((await db.query('SELECT status FROM outbound_messages WHERE id=$1', [live.id])).rows[0].status, 'unknown', 'crash-safe marker must precede transport');
      await deliverOutbound(db, live.id); // concurrent/retried delivery cannot send again
      return new Response('boom', { status: 500 });
    }) as typeof fetch;
    const handlers = new Map<string, (job: Job, jdb: Pool) => Promise<void>>([
      ['whatsapp.send', async (job, jdb) => deliverOutbound(jdb, (job.payload as { outboundMessageId: string }).outboundMessageId)],
    ]);
    const processed = await runOnce(db, handlers, 10);
    assert.ok(processed >= 1);
    const liveRow = (await db.query('SELECT status FROM outbound_messages WHERE id=$1', [live.id])).rows[0];
    assert.equal(liveRow.status, 'unknown');
    assert.equal(liveCalls, 1);
    const liveJob = (await db.query('SELECT status, attempts FROM jobs WHERE org_id=$1 AND dedupe_key=$2', [org.id, live.id])).rows[0];
    assert.equal(liveJob.status, 'done');
    assert.equal(liveJob.attempts, 1, 'an unknown send must never be retried');

    // Provider acceptance is not delivery; repeated processing cannot resend it.
    let acceptedCalls = 0;
    globalThis.fetch = (async () => {
      acceptedCalls++;
      return Response.json({ success: true, data: { msgId: 'wapi-accepted', status: 'in_progress' } });
    }) as typeof fetch;
    const accepted = await withClient(db, c => queueOutbound(c, { orgId: org.id, conversationId: conversation.id, body: 'Solo aceptación', approvedBy: 'test' }));
    await deliverOutbound(db, accepted.id);
    await deliverOutbound(db, accepted.id);
    const acceptedRow = (await db.query('SELECT status, provider_message_id FROM outbound_messages WHERE id=$1', [accepted.id])).rows[0];
    assert.equal(acceptedRow.status, 'accepted');
    assert.equal(acceptedRow.provider_message_id, 'wapi-accepted');
    assert.equal(acceptedCalls, 1);

  } finally {
    globalThis.fetch = originalFetch;
    if (originalWapiOrg === undefined) delete process.env.WAPI_ORG_ID; else process.env.WAPI_ORG_ID = originalWapiOrg;
    delete process.env.WAPI_MODE;
    delete process.env.WAPI_API_KEY;
    delete process.env.WAPI_BASE_URL;
    delete process.env.WAPI_OUTGOING_ENABLED;
    await dropOrgs(db, [org.id]);
    await db.end();
  }
});

test('Chat: tenant isolation across the conversation list and thread endpoints', { skip: !process.env.DATABASE_URL }, async () => {
  const db = pool();
  await db.query(migration);
  const orgA = await makeOrg(db, 'Tenant A');
  const orgB = await makeOrg(db, 'Tenant B');
  const app = buildTestApp(db);
  try {
    const conversation = await upsertConversation(db, { orgId: orgA.id, peer: '51922222222@s.whatsapp.net' });
    const listA = await app.inject({ url: '/chat/conversations', headers: orgA.headers });
    assert.equal(listA.json().length, 1);
    const listB = await app.inject({ url: '/chat/conversations', headers: orgB.headers });
    assert.equal(listB.json().length, 0);

    const threadFromB = await app.inject({ url: `/chat/conversations/${conversation.id}`, headers: orgB.headers });
    assert.equal(threadFromB.statusCode, 409);
    const threadFromA = await app.inject({ url: `/chat/conversations/${conversation.id}`, headers: orgA.headers });
    assert.equal(threadFromA.statusCode, 200);
  } finally {
    await app.close();
    await dropOrgs(db, [orgA.id, orgB.id]);
    await db.end();
  }
});

async function withClient<T>(db: Pool, fn: (c: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
