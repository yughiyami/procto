import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { migration, pool } from '../src/db.js';
import { parseSeedArgs, seedDemo } from '../src/seed-demo.js';
import { verifyEvidence } from '../src/domain.js';

test('Demo CLI requires explicit tenant and defaults to no writes', () => {
  const id = randomUUID();
  assert.throws(() => parseSeedArgs([]));
  assert.throws(() => parseSeedArgs(['--org-id', 'first']));
  assert.throws(() => parseSeedArgs(['--org-id', id, '--all']));
  assert.deepEqual(parseSeedArgs(['--', '--org-id', id]), { orgId: id, apply: false });
  assert.equal(parseSeedArgs(['--org-id', id, '--apply']).apply, true);
});

test('Demo seed is explicit, transactional, isolated and idempotent without external actions', { skip: !process.env.DATABASE_URL }, async () => {
  const db = pool(), org = randomUUID(), other = randomUUID();
  try {
    await db.query(migration);
    for (const id of [org, other]) await db.query('INSERT INTO organizations VALUES($1,$2)', [id, 'Seed test original name']);
    await assert.rejects(seedDemo(db, randomUUID(), true), /does not exist/);
    assert.equal((await seedDemo(db, org)).mode, 'dry-run');
    assert.equal((await db.query('SELECT * FROM orders WHERE org_id=$1', [org])).rowCount, 0);
    const first = await seedDemo(db, org, true);
    assert.deepEqual(first.inserted, { suppliers: 3, companies: 6, opportunities: 4, orders: 4 });
    const before = (await db.query('SELECT data FROM orders WHERE org_id=$1 ORDER BY id', [org])).rows;
    assert.deepEqual(before.map(r => r.data.status).sort(), ['delivered', 'draft', 'fulfilling', 'quoted']);
    for (const { data } of before) assert.ok(verifyEvidence(data.events));
    const second = await seedDemo(db, org, true);
    assert.deepEqual(second.inserted, { suppliers: 0, companies: 0, opportunities: 0, orders: 0 });
    assert.deepEqual((await db.query('SELECT data FROM orders WHERE org_id=$1 ORDER BY id', [org])).rows, before);
    for (const table of ['jobs', 'outbound_messages', 'credentials', 'conversations', 'agent_runs']) {
      assert.equal((await db.query(`SELECT * FROM ${table} WHERE org_id=$1`, [org])).rowCount, 0);
    }
    assert.equal((await db.query('SELECT * FROM orders WHERE org_id=$1', [other])).rowCount, 0);
    // Inject a failure after company/opportunity inserts to verify all earlier writes roll back.
    const failingDb = { connect: async () => {
      const client = await db.connect();
      return { release: () => client.release(), query: async (sql: string, values?: unknown[]) => {
        if (sql.startsWith('INSERT INTO orders')) throw new Error('injected seed failure');
        return client.query(sql, values);
      } };
    } } as unknown as typeof db;
    await assert.rejects(seedDemo(failingDb, other, true), /injected seed failure/);
    for (const table of ['sales_opportunities', 'directory_companies', 'orders', 'suppliers']) {
      assert.equal((await db.query(`SELECT * FROM ${table} WHERE org_id=$1`, [other])).rowCount, 0);
    }
    const companies = (await db.query('SELECT * FROM directory_companies WHERE org_id=$1', [org])).rows;
    assert.ok(companies.every(c => c.source === 'manual' && c.data.notes.includes('SYNTHETIC NEVER SCRAPED') && new URL(c.source_url).hostname.endsWith('.example')));
    assert.equal((await db.query('SELECT name FROM organizations WHERE id=$1', [org])).rows[0].name, 'Seed test original name');
  } finally {
    for (const id of [org, other]) {
      for (const table of ['sales_opportunities', 'directory_companies', 'orders', 'suppliers']) await db.query(`DELETE FROM ${table} WHERE org_id=$1`, [id]);
      await db.query('DELETE FROM organizations WHERE id=$1', [id]);
    }
    await db.end();
  }
});
