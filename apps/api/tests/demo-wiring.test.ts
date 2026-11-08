import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import type {Pool} from 'pg';
import {pool,migration} from '../src/db.js';
import {registerDemo,importDemoScenario,demoTemplate,scenarioSchema} from '../src/demo-wiring.js';
import {verifyEvidence} from '../src/domain.js';

test('DEMO scenarios reject extra model actions, unbounded amounts and invalid cost',()=>{
  for(const draft of [{...demoTemplate,phone:'123'},{...demoTemplate,sql:'DROP TABLE orders'},{...demoTemplate,quantity:1001},{...demoTemplate,unitCostCents:1800},{...demoTemplate,unitPriceCents:1}])assert.equal(scenarioSchema.safeParse(draft).success,false);
});

test('DEMO routes require authenticated explicit confirmation and label template fallback without writes',async()=>{
  const prior=process.env.DEEPSEEK_API_KEY;delete process.env.DEEPSEEK_API_KEY;
  const app=Fastify();app.addHook('preHandler',async req=>{if(req.headers.authorization)(req as unknown as {org:string}).org=req.headers.authorization;});
  let networkCalls=0,validOutput=false;
  const db={query:async(sql:string,args:unknown[])=>{assert.equal(sql,'SELECT id FROM organizations WHERE id=$1');return {rowCount:args[0]==='paco'?1:0};}} as unknown as Pool;
  registerDemo(app,db,(async(_url,options)=>{networkCalls++;const body=JSON.parse(String(options?.body));assert.match(body.messages[0].content,/json/i);assert.deepEqual(body.thinking,{type:'disabled'});return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(validOutput?demoTemplate:{...demoTemplate,sendMessage:true})}}]}));}) as typeof fetch);
  try{
    for(const url of ['/demo/seed','/demo/draft','/demo/import'])assert.equal((await app.inject({method:'POST',url,payload:{}})).statusCode,401);
    assert.equal((await app.inject({method:'POST',url:'/demo/seed',headers:{authorization:'paco'},payload:{confirmSynthetic:false}})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:'/demo/import',headers:{authorization:'paco'},payload:{confirmSynthetic:true,draft:demoTemplate,org:'other'}})).statusCode,400);
    assert.equal((await app.inject({method:'POST',url:'/demo/draft',headers:{authorization:'other'},payload:{text:'polos'}})).statusCode,404);
    const response=await app.inject({method:'POST',url:'/demo/draft',headers:{authorization:'paco'},payload:{text:'polos'}});
    assert.equal(response.statusCode,200);assert.equal(response.json().source,'template');assert.equal(networkCalls,0);
    process.env.DEEPSEEK_API_KEY='fake';
    assert.equal((await app.inject({method:'POST',url:'/demo/draft',headers:{authorization:'paco'},payload:{text:'polos'}})).statusCode,502);assert.equal(networkCalls,1);
    validOutput=true;
    const generated=await app.inject({method:'POST',url:'/demo/draft',headers:{authorization:'paco'},payload:{text:'polos'}});assert.equal(generated.statusCode,200);assert.equal(generated.json().source,'deepseek');assert.deepEqual(generated.json().draft,demoTemplate);
  }finally{await app.close();if(prior===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=prior;}
});

test('DEMO import is tenant-isolated, concurrent-idempotent and has no external side effects',{skip:!process.env.DATABASE_URL},async()=>{
  const db=pool(),org=randomUUID(),other=randomUUID();
  try{
    await db.query(migration);for(const id of [org,other])await db.query('INSERT INTO organizations VALUES($1,$2)',[id,'Dynamic demo test']);
    const results=await Promise.all([importDemoScenario(db,org,demoTemplate),importDemoScenario(db,org,demoTemplate)]);
    assert.equal(results.filter(r=>r.inserted).length,1);assert.equal(results[0]!.orderId,results[1]!.orderId);
    const records=(await db.query('SELECT data FROM orders WHERE org_id=$1',[org])).rows;assert.equal(records.length,1);
    const order=records[0].data;assert.equal(order.status,'accepted');assert.equal(order.movements.length,2);assert.ok(order.movements.every((m:{verification:string;note:string})=>m.verification==='declared'&&m.note.startsWith('DEMO')));assert.ok(verifyEvidence(order.events));
    assert.equal((await db.query('SELECT * FROM orders WHERE org_id=$1',[other])).rowCount,0);
    for(const table of ['jobs','outbound_messages','conversations','agent_runs'])assert.equal((await db.query(`SELECT * FROM ${table} WHERE org_id=$1`,[org])).rowCount,0);
    assert.equal((await db.query('SELECT * FROM sales_opportunities WHERE org_id=$1',[org])).rows[0].status,'won');
    const repeated=await importDemoScenario(db,org,demoTemplate);assert.equal(repeated.inserted,false);
    assert.deepEqual((await db.query('SELECT data FROM orders WHERE org_id=$1',[org])).rows,records);
    const failingDb={connect:async()=>{const client=await db.connect();return {release:()=>client.release(),query:async(sql:string,args?:unknown[])=>{if(sql.startsWith('INSERT INTO sales_opportunities'))throw new Error('Injected failure');return client.query(sql,args);}};}} as unknown as Pool;
    await assert.rejects(importDemoScenario(failingDb,other,demoTemplate),/Injected failure/);
    for(const table of ['sales_opportunities','orders','suppliers'])assert.equal((await db.query(`SELECT * FROM ${table} WHERE org_id=$1`,[other])).rowCount,0);
  }finally{
    for(const id of [org,other]){for(const table of ['sales_opportunities','orders','suppliers'])await db.query(`DELETE FROM ${table} WHERE org_id=$1`,[id]);await db.query('DELETE FROM organizations WHERE id=$1',[id]);}await db.end();
  }
});
