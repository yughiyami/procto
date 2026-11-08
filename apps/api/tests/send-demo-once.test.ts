import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { migration, pool } from '../src/db.js';
import { DEMO_PEER, parseDemoSendArgs, sendDemoOnce } from '../src/send-demo-once.js';

test('Single DEMO send requires explicit flag and dry-run never connects', async () => {
  assert.deepEqual(parseDemoSendArgs([]), { sendReal: false });
  assert.deepEqual(parseDemoSendArgs(['--', '--send-real']), { sendReal: true });
  assert.throws(() => parseDemoSendArgs(['--send-real', '--send-real']));
  assert.throws(() => parseDemoSendArgs(['--to', '+1234']));
  const db = { connect: () => { throw new Error('dry-run touched database'); } } as unknown as ReturnType<typeof pool>;
  assert.equal((await sendDemoOnce(db)).mode, 'dry-run');
});

test('Single DEMO send claims job before transport, preserves conversation and cannot resend', { skip: !process.env.DATABASE_URL }, async () => {
  const db = pool(), org = randomUUID(), conversation = randomUUID();
  const saved = { key: process.env.WAPI_API_KEY, url: process.env.WAPI_BASE_URL, mode: process.env.WAPI_MODE, outgoing: process.env.WAPI_OUTGOING_ENABLED };
  try {
    process.env.WAPI_API_KEY = 'fixture-not-real'; process.env.WAPI_BASE_URL = 'https://fixture.invalid';
    process.env.WAPI_MODE = 'simulator'; process.env.WAPI_OUTGOING_ENABLED = 'false';
    await db.query(migration);
    await db.query('INSERT INTO organizations VALUES($1,$2)', [org, 'DEMO isolated test']);
    await db.query('INSERT INTO conversations(id,org_id,peer,display_name,agent_paused) VALUES($1,$2,$3,$4,true)', [conversation, org, DEMO_PEER, 'Existing name']);
    let calls = 0;
    const deliver = async (_db: typeof db, outboundId: string) => {
      calls++;
      assert.equal(process.env.WAPI_MODE, 'live');
      assert.equal(process.env.WAPI_OUTGOING_ENABLED, 'true');
      const jobs = await db.query('SELECT status,attempts,max_attempts FROM jobs WHERE org_id=$1', [org]);
      assert.deepEqual(jobs.rows, [{ status: 'running', attempts: 1, max_attempts: 1 }]);
      await db.query("UPDATE outbound_messages SET status='accepted' WHERE id=$1", [outboundId]);
    };
    const first = await sendDemoOnce(db, true, deliver, org);
    assert.equal(first.status, 'accepted');
    assert.equal(process.env.WAPI_MODE, 'simulator'); assert.equal(process.env.WAPI_OUTGOING_ENABLED, 'false');
    assert.equal((await sendDemoOnce(db, true, deliver, org)).mode, 'already-reserved');
    assert.equal(calls, 1);
    assert.deepEqual((await db.query('SELECT display_name,agent_paused FROM conversations WHERE id=$1', [conversation])).rows, [{ display_name: 'Existing name', agent_paused: true }]);
    assert.deepEqual((await db.query('SELECT status FROM jobs WHERE org_id=$1', [org])).rows, [{ status: 'done' }]);
    // Even an indeterminate provider result may not be retried by a CLI replay.
    await db.query("UPDATE outbound_messages SET status='unknown' WHERE org_id=$1", [org]);
    await sendDemoOnce(db, true, deliver, org);
    assert.equal(calls, 1);
  } finally {
    for (const table of ['operations', 'jobs', 'outbound_messages', 'conversations', 'organizations']) await db.query(`DELETE FROM ${table} WHERE ${table === 'organizations' ? 'id' : 'org_id'}=$1`, [org]);
    await db.end();
    for (const [key, value] of Object.entries({ WAPI_API_KEY: saved.key, WAPI_BASE_URL: saved.url, WAPI_MODE: saved.mode, WAPI_OUTGOING_ENABLED: saved.outgoing })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
