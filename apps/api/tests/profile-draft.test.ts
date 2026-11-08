import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import type {Pool} from 'pg';
import {extractProfileDraft,registerProfileDraft} from '../src/profile-draft-wiring.js';
const output={name:null,city:'Arequipa',activity:'seller',products:['chompas de alpaca']};
const response=(value:unknown)=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
test('Profile draft: bounded nullable extraction, strict fields, no invented verification',async()=>{
  const draft=await extractProfileDraft({apiKey:'fake'},'vendo chompas de alpaca en Arequipa',(async(_url,init)=>{assert.equal(init?.redirect,'error');assert.ok(init?.signal);assert.equal(JSON.parse(String(init?.body)).messages[1].content,'vendo chompas de alpaca en Arequipa');return response(output);}) as typeof fetch);
  assert.equal(draft.name,null);assert.deepEqual(draft.missingFields,['name']);assert.equal(draft.requiresHumanConfirmation,true);
  for(const invalid of [{...output,verified:true},{...output,activity:'admin'},{...output,name:''},{...output,products:[]},{...output,products:['x'.repeat(201)]}])await assert.rejects(()=>extractProfileDraft({apiKey:'fake'},'input',(async()=>response(invalid)) as typeof fetch));
  await assert.rejects(()=>extractProfileDraft({apiKey:'fake'},'input',(async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:JSON.stringify(output)}}]}))) as typeof fetch));
});
test('Profile draft route: authenticated tenant, no writes, config and upstream failures',async()=>{
  const previous=process.env.DEEPSEEK_API_KEY;delete process.env.DEEPSEEK_API_KEY;
  let calls=0,fail=false;
  const db={query:async(sql:string,args:string[])=>{assert.equal(sql,'SELECT id FROM organizations WHERE id=$1');return {rowCount:args[0]==='paco'?1:0};}} as unknown as Pool;
  const app=Fastify();app.addHook('preHandler',async req=>{if(req.headers.authorization)(req as unknown as {org:string}).org=req.headers.authorization;});
  registerProfileDraft(app,db,(async()=>{calls++;if(fail)throw new Error('private upstream data');return response(output);}) as typeof fetch);
  const request=(tenant?:string,text='vendo chompas')=>app.inject({method:'POST',url:'/profile/draft',headers:tenant?{authorization:tenant}:{},payload:{text}});
  try{
    assert.equal((await request()).statusCode,401);assert.equal((await request('other')).statusCode,404);assert.equal((await request('paco')).statusCode,503);assert.equal(calls,0);
    process.env.DEEPSEEK_API_KEY='fake';assert.equal((await request('paco','')).statusCode,400);assert.equal((await request('paco','x'.repeat(8001))).statusCode,400);
    assert.equal((await request('paco')).json().requiresHumanConfirmation,true);assert.equal(calls,1);
    fail=true;const failed=await request('paco');assert.equal(failed.statusCode,502);assert.ok(!failed.body.includes('private upstream'));
  }finally{await app.close();if(previous===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=previous;}
});
