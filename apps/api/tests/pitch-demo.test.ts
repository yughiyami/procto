import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { createPitchRun, acceptPitchRun, verifyPitchLedger, pitchAcceptance } from '../src/pitch-demo.js';
import { registerPitchDemo } from '../src/pitch-demo-wiring.js';
import { pool, migration } from '../src/db.js';
import { demoRouteAllowed } from '../src/demo-session.js';

test('Pitch waits for explicit DEMO acceptance, preserves source and verifies its simulated ledger', () => {
 const pending = createPitchRun({});
 assert.equal(pending.recipient, '+51953597691');
 assert.equal(pending.status, 'waiting_acceptance');
 assert.equal(pending.events.length, 1);
 assert.equal(pending.order, null);
 for (const input of [{ response: 'sí', demo: true }, { response: 'ACEPTAR', demo: false }, { response: 'ACEPTAR' }, { response: 'ACEPTAR', demo: true, live: true }]) assert.equal(pitchAcceptance.safeParse(input).success, false);
 const done = acceptPitchRun(pending, { response: ' aceptar ', demo: true });
 assert.equal(pending.status, 'waiting_acceptance');
 assert.equal(done.status, 'completed'); assert.equal(done.events.length, 7);
 assert.equal(done.chainStatus, 'not_anchored'); assert.equal(done.messageStatus, 'not_sent');
 assert.equal(done.receipt?.legalValidity, false); assert.equal(done.totalCents, 180000);
 assert.ok(verifyPitchLedger(done));
 assert.deepEqual(acceptPitchRun(done, { response:'ACEPTAR', demo:true }), done);
 done.events[3]!.label = 'tampered'; assert.equal(verifyPitchLedger(done), false);
});
test('Mobile demo sessions allow only the isolated pitch endpoints', () => {
 for(const path of ['/pitch-demo/runs','/pitch-demo/runs/:id']) assert.equal(demoRouteAllowed('GET',path),true);
 for(const path of ['/pitch-demo/runs','/pitch-demo/runs/:id/accept']) assert.equal(demoRouteAllowed('POST',path),true);
 assert.equal(demoRouteAllowed('POST','/pitch-demo/runs/:id/live'),false);
});
test('Pitch API persists and concurrently accepts once, denies other tenants and has zero live effects', { skip: !process.env.DATABASE_URL }, async () => {
 const db = pool(); await db.query(migration);
 const ids: string[] = [randomUUID(), randomUUID()];
 for(const id of ids) await db.query('INSERT INTO organizations VALUES($1,$2)',[id,'Pitch test']);
 const app = Fastify();
 app.setErrorHandler((error,_req,reply)=>reply.code(error instanceof ZodError?400:500).send({error:'Request failed'}));
 app.addHook('preHandler',async(req,reply)=>{const id=req.headers.authorization?.replace(/^Bearer /,''); if(!id||!ids.includes(id))return reply.code(401).send({error:'Unauthorized'});Object.assign(req,{org:id});});
 registerPitchDemo(app,db);
 const headers={authorization:`Bearer ${ids[0]}`}, other={authorization:`Bearer ${ids[1]}`};
 try {
  assert.equal((await app.inject({url:'/pitch-demo/runs'})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/pitch-demo/runs',headers,payload:{recipient:'953597691'}})).statusCode,400);
  const saved=await app.inject({method:'POST',url:'/pitch-demo/runs',headers,payload:{}}); assert.equal(saved.statusCode,201);
  const run=saved.json(); const url=`/pitch-demo/runs/${run.id}`;
  assert.equal(run.status,'waiting_acceptance');
  assert.equal((await app.inject({url,headers:other})).statusCode,404);
  assert.equal((await app.inject({url:'/pitch-demo/runs',headers:other})).json().items.length,0);
  assert.equal((await app.inject({method:'POST',url:`${url}/accept`,headers:other,payload:{response:'ACEPTAR',demo:true}})).statusCode,404);
  assert.equal((await app.inject({method:'POST',url:`${url}/accept`,headers,payload:{response:'ACEPTAR',demo:false}})).statusCode,400);
  const results=await Promise.all(Array.from({length:4},()=>app.inject({method:'POST',url:`${url}/accept`,headers,payload:{response:'ACEPTAR',demo:true}})));
  results.forEach(result=>{assert.equal(result.statusCode,200);assert.deepEqual(result.json(),results[0]!.json());});
  const persisted=(await app.inject({url,headers})).json();assert.equal(persisted.events.length,7);assert.ok(verifyPitchLedger(persisted));
  for(const table of ['orders','outbound_messages','jobs','inbox']) assert.equal(Number((await db.query(`SELECT count(*) FROM ${table} WHERE org_id=$1`,[ids[0]])).rows[0].count),0);
  const second=(await app.inject({method:'POST',url:'/pitch-demo/runs',headers,payload:{agent:'Agente invitado'}})).json(); assert.equal(second.status,'waiting_acceptance'); assert.notEqual(second.id,run.id);
  // Missing UUID remains honest 404.
  assert.equal((await app.inject({method:'POST',url:`/pitch-demo/runs/${randomUUID()}/accept`,headers,payload:{response:'ACEPTAR',demo:true}})).statusCode,404);
 } finally {await app.close();for(const id of ids){await db.query('DELETE FROM pitch_demo_runs WHERE org_id=$1',[id]);await db.query('DELETE FROM organizations WHERE id=$1',[id]);}await db.end();}
});

test('Acceptance storage failure rolls back and never reports completion', async () => {
 const run = createPitchRun({}); const calls: string[] = []; let released = false;
 const client = { query: async (sql: string) => {
  calls.push(sql);
  if(sql.startsWith('SELECT data')) return {rowCount:1,rows:[{data:run}]};
  if(sql.startsWith('UPDATE')) throw new Error('storage unavailable');
  return {rowCount:0,rows:[]};
 }, release:()=>{released=true;} };
 const db = { connect:async()=>client } as unknown as import('pg').Pool;
 const app = Fastify(); app.addHook('preHandler',async req=>{Object.assign(req,{org:randomUUID()});});
 registerPitchDemo(app,db);
 try {
  const result = await app.inject({method:'POST',url:`/pitch-demo/runs/${run.id}/accept`,payload:{response:'ACEPTAR',demo:true}});
  assert.equal(result.statusCode,500); assert.ok(calls.includes('ROLLBACK')); assert.ok(!calls.includes('COMMIT'));assert.ok(released);assert.equal(run.status,'waiting_acceptance');
 } finally {await app.close();}
});
