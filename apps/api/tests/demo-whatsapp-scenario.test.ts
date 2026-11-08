import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { migration, pool } from '../src/db.js';
import { finance, verifyEvidence } from '../src/domain.js';
import { parseScenarioArgs, seedWhatsAppScenario } from '../src/demo-whatsapp-scenario.js';

test('WhatsApp scenario requires explicit tenant and international phone and defaults dry-run', () => {
  const orgId = randomUUID();
  assert.deepEqual(parseScenarioArgs(['--org-id',orgId,'--phone','+51953597691']),{orgId,phone:'+51953597691',apply:false});
  assert.throws(() => parseScenarioArgs(['--org-id',orgId,'--phone','953597691']));
  assert.throws(() => parseScenarioArgs(['--org-id',orgId,'--phone','+51953597691','--apply','--apply']));
});

test('WhatsApp fixtures are coherent, isolated, idempotent and never create messages or jobs', { skip: !process.env.DATABASE_URL }, async () => {
  const db = pool(), org = randomUUID();
  try {
    await db.query(migration);
    await db.query('INSERT INTO organizations VALUES($1,$2)',[org,'Scenario test']);
    await assert.rejects(seedWhatsAppScenario(db,randomUUID(),'+51953597691',true),/does not exist/);
    assert.equal((await seedWhatsAppScenario(db,org,'+51953597691')).mode,'dry-run');
    assert.equal((await db.query('SELECT id FROM orders WHERE org_id=$1',[org])).rowCount,0);
    const result = await seedWhatsAppScenario(db,org,'+51953597691',true);
    assert.deepEqual(result.inserted,{suppliers:1,orders:1,opportunities:1,conversations:1});
    assert.equal(result.conversationLinkedToDemoOrder,true);
    const before = (await db.query('SELECT data FROM orders WHERE org_id=$1',[org])).rows[0].data;
    assert.equal(before.status,'accepted');
    assert.ok(verifyEvidence(before.events));
    assert.equal(finance(before).customerBalanceCents,90000);
    assert.equal(finance(before).cashDifferenceCents,60000);
    assert.ok(before.movements.every((m:{verification:string;note:string}) => m.verification==='declared' && m.note.includes('DEMO')));
    // A rerun must preserve an operator-edited conversation, not relink or pause it.
    await db.query('UPDATE conversations SET display_name=$1,agent_paused=false,order_id=null WHERE org_id=$2',['Edited',org]);
    assert.deepEqual((await seedWhatsAppScenario(db,org,'+51953597691',true)).inserted,{suppliers:0,orders:0,opportunities:0,conversations:0});
    assert.deepEqual((await db.query('SELECT data FROM orders WHERE org_id=$1',[org])).rows[0].data,before);
    const conversation = (await db.query('SELECT * FROM conversations WHERE org_id=$1',[org])).rows[0];
    assert.equal(conversation.display_name,'Edited');
    assert.equal(conversation.agent_paused,false);
    assert.equal(conversation.order_id,null);
    for (const table of ['inbox','outbound_messages','jobs','agent_runs']) assert.equal((await db.query(`SELECT * FROM ${table} WHERE org_id=$1`,[org])).rowCount,0);
  } finally {
    for (const table of ['conversations','sales_opportunities','orders','suppliers','organizations']) await db.query(`DELETE FROM ${table} WHERE ${table==='organizations'?'id':'org_id'}=$1`,[org]);
    await db.end();
  }
});
