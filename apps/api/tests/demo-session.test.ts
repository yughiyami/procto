import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { buildApp, hash } from '../src/app.js';
import { createDemoRateLimiter, demoRouteAllowed } from '../src/demo-session.js';

// Deliberately no DATABASE_URL: these tests cannot mutate the user's database.
function database() {
  const sessions = new Map<string, any>(), organizations = new Map<string, any>(), orders: any[] = [], conversations: any[] = [], statements: string[] = [];
  let totalOverride = 0;
  const query = async (sql: string, values: any[] = []) => {
    statements.push(sql);
    let rows: any[] = [];
    if (sql.startsWith('SELECT count(*)')) rows = [{ total: totalOverride || sessions.size, active: sessions.size }];
    else if (sql.startsWith('INSERT INTO organizations')) organizations.set(values[0], { id: values[0], name: values[1] });
    else if (sql.startsWith('INSERT INTO demo_sessions')) sessions.set(values[0], { org_id: values[1], expires_at: values[2], ready: false });
    else if (sql.startsWith('UPDATE demo_sessions')) sessions.get(values[0]).ready = true;
    else if (sql.includes('FROM demo_sessions WHERE')) {
      const session = sessions.get(values[0]);
      if (session?.ready && Date.parse(session.expires_at) > Date.now()) rows = [session];
    } else if (sql.includes('FROM organizations WHERE')) rows = organizations.has(values[0]) ? [organizations.get(values[0])] : [];
    else if (sql.startsWith('INSERT INTO orders')) orders.push({ id: values[0], org_id: values[1], data: JSON.parse(values[2]) });
    else if (sql.startsWith('SELECT data FROM orders')) rows = orders.filter(o => o.org_id === values[0]);
    else if (sql.includes('FROM credentials')) rows = values[0] === hash('normal-token') ? [{ org_id: 'normal-org' }] : [];
    else if (sql.startsWith('INSERT INTO conversations')) {
      let row = conversations.find(c => c.org_id === values[1] && c.peer === values[2]);
      if (!row) { row = { id: values[0], org_id: values[1], peer: values[2], display_name: values[3], agent_paused: true }; conversations.push(row); }
      rows = [row];
    } else if (sql.includes('FROM conversations WHERE id=')) rows = conversations.filter(c => c.id === values[0] && c.org_id === values[1]);
    return { rows, rowCount: sql.startsWith('SELECT') ? rows.length : 1 };
  };
  return { sessions, orders, conversations, statements, setTotal: (n: number) => { totalOverride = n; }, db: { query, connect: async () => ({ query, release() {} }) } as unknown as Pool };
}

test('Demo allowlist blocks live effects and unfamiliar/encoded route names', () => {
  for (const route of ['/orders/:id/invitations', '/demo/draft', '/demo/import', '/chat', '/agents/run', '/webhooks/wapi', '/mcp', '/blockchain/prepare', '/orders/', '/%6frders']) {
    assert.equal(demoRouteAllowed('POST', route), false, route);
  }
  assert.equal(demoRouteAllowed('POST', '/orders/:id/movements'), true);
  assert.equal(demoRouteAllowed('POST', '/chat/conversations'), true);
  for (const route of ['/chat/conversations/:id/messages', '/chat/conversations/:id/agent', '/chat/simulate/inbound']) assert.equal(demoRouteAllowed('POST', route), false);
  assert.equal(demoRouteAllowed('DELETE', '/orders'), false);
});

test('Demo can save and reopen phone contacts without sending, activating agents or crossing tenants', async () => {
  const previous = process.env.DEMO_ACCESS_ENABLED; process.env.DEMO_ACCESS_ENABLED = 'true';
  const fake = database(), app = buildApp(fake.db);
  try {
    const issue = async () => (await app.inject({ method: 'POST', url: '/demo/session', payload: {} })).json();
    const a = await issue(), b = await issue();
    const headers = { authorization: `Bearer ${a.token}` }, otherHeaders = { authorization: `Bearer ${b.token}` };
    const payload = { phone: '+51900000099', displayName: 'Contacto DEMO' };
    const create = () => app.inject({ method: 'POST', url: '/chat/conversations', headers, payload });
    const first = await create();
    assert.equal(first.statusCode, 200);
    assert.equal((await create()).json().id, first.json().id);
    assert.equal(fake.conversations.length, 1);
    assert.equal(fake.conversations[0].agent_paused, true);
    assert.equal((await app.inject({ url: `/chat/conversations/${first.json().id}`, headers })).statusCode, 200);
    assert.notEqual((await app.inject({ url: `/chat/conversations/${first.json().id}`, headers: otherHeaders })).statusCode, 200);
    const other = await app.inject({ method: 'POST', url: '/chat/conversations', headers: otherHeaders, payload });
    assert.equal(other.statusCode, 200); assert.notEqual(other.json().id, first.json().id);
    assert.equal((await app.inject({ method: 'POST', url: '/chat/conversations', headers, payload: { ...payload, orgId: b.organizationId } })).statusCode, 400);
    for (const suffix of ['messages', 'agent']) assert.equal((await app.inject({ method: 'POST', url: `/chat/conversations/${first.json().id}/${suffix}`, headers, payload: {} })).statusCode, 403);
    assert.equal(fake.statements.some(sql => /INSERT INTO (jobs|outbound_messages|inbox)\b/.test(sql)), false);
  } finally { await app.close(); if (previous === undefined) delete process.env.DEMO_ACCESS_ENABLED; else process.env.DEMO_ACCESS_ENABLED = previous; }
});

test('Demo per-session limits bound writes and reads, expire, and isolate organizations', () => {
  let now = 0; const limit = createDemoRateLimiter(() => now);
  for (let i = 0; i < 30; i++) assert.equal(limit('a', 'POST'), null);
  assert.equal(limit('a', 'POST'), 60);
  assert.equal(limit('b', 'POST'), null);
  for (let i = 0; i < 90; i++) assert.equal(limit('a', 'GET'), null);
  assert.equal(limit('a', 'GET'), 60);
  now = 59_001; assert.equal(limit('a', 'GET'), 1);
  now = 60_000; assert.equal(limit('a', 'POST'), null);
  for (let i = 0; i < 999; i++) assert.equal(limit(`other-${i}`, 'GET'), null);
  assert.equal(limit('overflow', 'GET'), 60);
  now = 120_000; assert.equal(limit('overflow', 'GET'), null);
});

test('Demo write throttle runs before domain mutations', async () => {
  const previous = process.env.DEMO_ACCESS_ENABLED; process.env.DEMO_ACCESS_ENABLED = 'true';
  const fake = database(), app = buildApp(fake.db);
  try {
    const session = (await app.inject({ method: 'POST', url: '/demo/session', payload: {} })).json();
    const headers = { authorization: `Bearer ${session.token}` };
    for (let i = 0; i < 30; i++) assert.equal((await app.inject({ method: 'POST', url: '/suppliers', headers, payload: { name: 'DEMO' } })).statusCode, 201);
    const blocked = await app.inject({ method: 'POST', url: '/suppliers', headers, payload: { name: 'DEMO' } });
    assert.equal(blocked.statusCode, 429); assert.ok(Number(blocked.headers['retry-after']) > 0);
    assert.equal((await app.inject({ url: '/orders', headers })).statusCode, 200);
  } finally { await app.close(); if (previous === undefined) delete process.env.DEMO_ACCESS_ENABLED; else process.env.DEMO_ACCESS_ENABLED = previous; }
});

test('Automatic bootstrap creates isolated seeded, expiring credentials and leaves ordinary auth intact', async () => {
  const previous = process.env.DEMO_ACCESS_ENABLED;
  process.env.DEMO_ACCESS_ENABLED = 'true';
  const fake = database(); let app = buildApp(fake.db);
  try {
    const issue = () => app.inject({ method: 'POST', url: '/demo/session', payload: {} });
    const first = await issue(), second = await issue();
    assert.equal(first.statusCode, 201); assert.equal(second.statusCode, 201);
    const a = first.json(), b = second.json();
    assert.notEqual(a.organizationId, b.organizationId); assert.notEqual(a.token, b.token);
    assert.match(a.token, /^demo_[a-f0-9]{64}$/); assert.equal(a.demo, true);
    const headers = { authorization: `Bearer ${a.token}` };
    const listed = (await app.inject({ url: '/orders', headers })).json();
    assert.equal(listed.length, 4); assert.ok(listed.every((o: any) => o.title.startsWith('DEMO')));
    assert.notEqual(listed[0].id, fake.orders.find(o => o.org_id === b.organizationId).id);
    assert.equal((await app.inject({ url: '/demo/session', headers })).statusCode, 200);
    assert.equal((await app.inject({ url: '/orders', headers: { authorization: a.token } })).statusCode, 401);
    fake.sessions.get(hash(a.token)).ready = false;
    assert.equal((await app.inject({ url: '/orders', headers })).statusCode, 401);
    fake.sessions.get(hash(a.token)).ready = true;
    for (const url of ['/demo/draft', '/webhooks/wapi', '/orders/123/invitations', '/mcp', '/agents/run']) {
      const response = await app.inject({ method: 'POST', url, headers, payload: {} });
      assert.ok([403, 404].includes(response.statusCode), `${url}: ${response.statusCode}`);
    }
    fake.sessions.get(hash(a.token)).expires_at = new Date(0).toISOString();
    await app.close(); app = buildApp(fake.db); // Durable state, new auth hook.
    assert.equal((await app.inject({ url: '/orders', headers })).statusCode, 401);
    process.env.DEMO_ACCESS_ENABLED = 'false';
    assert.equal((await issue()).statusCode, 403);
    assert.equal((await app.inject({ url: '/orders', headers: { authorization: `Bearer ${b.token}` } })).statusCode, 401);
    assert.equal((await app.inject({ url: '/orders', headers: { authorization: 'Bearer normal-token' } })).statusCode, 200);
  } finally { await app.close(); if (previous === undefined) delete process.env.DEMO_ACCESS_ENABLED; else process.env.DEMO_ACCESS_ENABLED = previous; }
});

test('Demo issuance rejects tenant injection and bounds repeated and global issuance', async () => {
  const previous = process.env.DEMO_ACCESS_ENABLED; process.env.DEMO_ACCESS_ENABLED = 'true';
  const fake = database(), app = buildApp(fake.db);
  try {
    assert.equal((await app.inject({ method: 'POST', url: '/demo/session', payload: { organizationId: 'existing' } })).statusCode, 400);
    fake.setTotal(1000);
    for (let i = 0; i < 6; i++) assert.equal((await app.inject({ method: 'POST', url: '/demo/session', payload: {} })).statusCode, 429);
    assert.equal(fake.sessions.size, 0);
  } finally { await app.close(); if (previous === undefined) delete process.env.DEMO_ACCESS_ENABLED; else process.env.DEMO_ACCESS_ENABLED = previous; }
});
