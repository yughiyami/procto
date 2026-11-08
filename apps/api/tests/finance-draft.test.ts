import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import type {Pool} from 'pg';
import {extractFinancialDraft,registerFinanceDraft} from '../src/finance-draft-wiring.js';
const id='12345678-1234-4234-9234-123456789012';
const output={kind:'customer_receipt',amountCents:12000,counterparty:'Cliente',note:null,missingFields:[]};
const reply=(value:unknown)=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}),{status:200});
test('Financial extraction returns review draft, never references/verification; malformed and malicious output rejected',async()=>{
  let calls=0;
  const fake=async(_url:unknown,init?:RequestInit)=>{calls++;assert.ok(init?.signal);assert.equal(init?.redirect,'error');const body=JSON.parse(String(init?.body));assert.equal(body.messages[1].content,'Cobré 120 soles');return reply(output);};
  const result=await extractFinancialDraft({apiKey:'fake'},'Cobré 120 soles',fake as typeof fetch);
  assert.equal(calls,1);assert.equal(result.amountCents,12000);assert.equal(result.requiresHumanConfirmation,true);assert.ok(result.missingFields.includes('reference'));
  assert.ok(!('reference' in result));assert.ok(!('verification' in result));
  for(const bad of [{...output,verification:'manually_verified'},{...output,reference:'invented'},{...output,amountCents:-1},{...output,amountCents:1.5},{...output,kind:'transfer'}]) await assert.rejects(()=>extractFinancialDraft({apiKey:'fake'},'input',(async()=>reply(bad)) as typeof fetch));
  const missing=await extractFinancialDraft({apiKey:'fake'},'ambiguous',(async()=>reply({...output,amountCents:null})) as typeof fetch);
  assert.ok(missing.missingFields.includes('amountCents'));
});
test('Finance draft endpoint: tenant check before model, missing config and model failure; no mutations',async()=>{
  const previous=process.env.DEEPSEEK_API_KEY;delete process.env.DEEPSEEK_API_KEY;
  let modelCalls=0;let fail=false;const queries:string[]=[];
  const db={query:async(sql:string,args:unknown[])=>{queries.push(sql);assert.match(sql,/^SELECT id FROM orders WHERE id=\$1 AND org_id=\$2$/);return {rowCount:args[1]==='a'?1:0,rows:args[1]==='a'?[{id}]:[]};}} as unknown as Pool;
  const app=Fastify();app.addHook('preHandler',async(req)=>{if(req.headers.authorization)(req as unknown as {org:string}).org=req.headers.authorization;});
  registerFinanceDraft(app,db,(async()=>{modelCalls++;if(fail)throw new Error('private upstream error');return reply(output);}) as typeof fetch);
  const request=(tenant?:string,text='Cobré 120 soles')=>app.inject({method:'POST',url:`/orders/${id}/finance-draft`,headers:tenant?{authorization:tenant}:{},payload:{text}});
  try {
    assert.equal((await request()).statusCode,401);assert.equal((await request('b')).statusCode,404);assert.equal(modelCalls,0);
    assert.equal((await request('a')).statusCode,503);assert.equal(modelCalls,0);
    process.env.DEEPSEEK_API_KEY='fake';assert.equal((await request('a')).json().requiresHumanConfirmation,true);assert.equal(modelCalls,1);
    assert.equal((await request('a','')).statusCode,400);assert.equal(modelCalls,1);
    fail=true;const failed=await request('a');assert.equal(failed.statusCode,502);assert.ok(!failed.body.includes('private upstream'));
    assert.ok(queries.every(sql=>sql.startsWith('SELECT')));
  }finally{await app.close();if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;}
});
