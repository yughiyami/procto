import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { sendWapiMessage, mediaSchema } from '../src/integrations/wapi.js';
import { pool, migration } from '../src/db.js';
import { registerChat } from '../src/chat-wiring.js';
import { upsertConversation, storeInboundMessage, deliverOutbound } from '../src/chat.js';
import { queueAutomaticReply } from '../src/agents/auto-reply.js';

test('Wapi media exact wire contract, HTTPS validation and ambiguous outcomes never retry', async () => {
  const bodies: unknown[] = [];
  const mock = (async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return Response.json({success:true,data:{msgId:42}}); }) as typeof fetch;
  const config = {baseUrl:'https://api.wapi.crafter.run',apiKey:'test-only'};
  assert.equal((await sendWapiMessage(config, {to:'+51999999999',text:'Promo',media:{kind:'image',url:'https://cdn.example.com/promo.jpg'}}, mock)).status,'accepted');
  await sendWapiMessage(config, {to:'+51999999999',text:'label',media:{kind:'sticker',url:'https://cdn.example.com/ok.webp'}}, mock);
  assert.deepEqual(bodies,[{to:'+51999999999',text:'Promo',imageUrl:'https://cdn.example.com/promo.jpg'},{to:'+51999999999',stickerUrl:'https://cdn.example.com/ok.webp'}]);
  for (const url of ['http://example.com/a','https://127.0.0.1/a','https://localhost/a','https://user:pass@example.com/a','file:///a']) assert.equal(mediaSchema.safeParse({kind:'image',url}).success,false);
  let attempts=0; const failed=(async()=>{attempts++;throw new Error('timeout');}) as typeof fetch;
  assert.equal((await sendWapiMessage(config,{to:'+51999999999',media:{kind:'sticker',url:'https://cdn.example.com/ok.webp'}},failed)).status,'unknown');
  assert.equal(attempts,1);
});

test('Media API and scoped auto replies: consent, tenant, dedupe, pause, STOP and daily limit', {skip:!process.env.DATABASE_URL}, async()=>{
  const db=pool(); await db.query(migration); const org=randomUUID();const other=randomUUID();
  await db.query('INSERT INTO organizations VALUES($1,$2),($3,$4)',[org,'Media test',other,'Other']);
  const oldMode=process.env.WAPI_MODE, oldOutgoing=process.env.WAPI_OUTGOING_ENABLED;
  process.env.WAPI_MODE='simulator';process.env.WAPI_OUTGOING_ENABLED='true';
  const app=Fastify(); app.addHook('preHandler',async req=>{(req as unknown as {org:string}).org=org;}); app.setErrorHandler((_e,_req,reply)=>reply.code(400).send({error:'rejected'})); registerChat(app,db);
  try {
    const conv=await upsertConversation(db,{orgId:org,peer:'51999999999@s.whatsapp.net'});
    const headers={'idempotency-key':randomUUID()}; const url=`/chat/conversations/${conv.id}/messages`;
    assert.equal((await app.inject({method:'POST',url,headers,payload:{body:'Promo',promotion:true}})).statusCode,400);
    const payload={body:'Promo DEMO',media:{kind:'image',url:'https://cdn.example.com/promo.jpg'},promotion:true,confirmPromotionConsent:true};
    const first=await app.inject({method:'POST',url,headers,payload});assert.equal(first.statusCode,201);
    assert.equal((await app.inject({method:'POST',url,headers,payload})).json().id,first.json().id);
    const listed=(await app.inject({method:'GET',url:`/chat/conversations/${conv.id}`})).json();assert.deepEqual(listed[0].media,payload.media);assert.equal(listed[0].promotion,true);
    await deliverOutbound(db,first.json().id);
    const inboxId=randomUUID();await db.query('INSERT INTO inbox(id,org_id,payload,conversation_id) VALUES($1,$2,$3,$4)',[inboxId,org,JSON.stringify({text:'Me env�as una promo en imagen?'}),conv.id]);
    const proposalId=randomUUID();await db.query("INSERT INTO agent_proposals(id,org_id,kind,conversation_id,payload) VALUES($1,$2,'message',$3,$4)",[proposalId,org,conv.id,JSON.stringify({body:'Qué cantidad necesitas?'})]);
    const input={orgId:org,conversationId:conv.id,inboxId,proposalId,body:'Qué cantidad necesitas?'};
    assert.equal(await queueAutomaticReply(db,input),false);
    await db.query('UPDATE conversations SET agent_paused=false,auto_reply=true WHERE id=$1',[conv.id]);
    assert.equal(await queueAutomaticReply(db,{...input,orgId:other}),false);
    assert.equal(await queueAutomaticReply(db,input),true);assert.equal(await queueAutomaticReply(db,input),false);
    const outbound=(await db.query('SELECT id,media,promotion,body FROM outbound_messages WHERE source_inbox_id=$1',[inboxId])).rows[0];
    assert.deepEqual(outbound.media,payload.media);assert.equal(outbound.promotion,true);assert.equal(outbound.body,payload.body);
    await db.query('UPDATE conversations SET agent_paused=true WHERE id=$1',[conv.id]);await deliverOutbound(db,outbound.id);
    assert.equal((await db.query('SELECT status FROM outbound_messages WHERE id=$1',[outbound.id])).rows[0].status,'failed');
    await db.query('UPDATE conversations SET agent_paused=false WHERE id=$1',[conv.id]);
    const c=await db.connect();try{await c.query('BEGIN');await storeInboundMessage(c,org,{dedupeKey:randomUUID(),messageId:'stop-test',sessionId:1,sender:conv.peer,text:'STOP'});await c.query('COMMIT');}finally{c.release();}
    const stopped=(await db.query('SELECT auto_reply,agent_paused FROM conversations WHERE id=$1',[conv.id])).rows[0];assert.equal(stopped.auto_reply,false);assert.equal(stopped.agent_paused,true);
    await db.query('UPDATE conversations SET agent_paused=false,auto_reply=true WHERE id=$1',[conv.id]);
    for(let i=0;i<19;i++)await db.query("INSERT INTO outbound_messages(id,org_id,conversation_id,body,approved_by) VALUES($1,$2,$3,'cap','auto:test')",[randomUUID(),org,conv.id]);
    const fresh=randomUUID();await db.query('INSERT INTO inbox(id,org_id,payload,conversation_id) VALUES($1,$2,$3,$4)',[fresh,org,'{}',conv.id]);assert.equal(await queueAutomaticReply(db,{...input,inboxId:fresh}),false);
  } finally {
    await app.close(); for(const table of ['operations','jobs','outbound_messages','agent_proposals','inbox','conversations']) await db.query(`DELETE FROM ${table} WHERE org_id=$1`,[org]);await db.query('DELETE FROM organizations WHERE id=ANY($1::uuid[])',[[org,other]]);await db.end();
    if(oldMode===undefined)delete process.env.WAPI_MODE;else process.env.WAPI_MODE=oldMode;if(oldOutgoing===undefined)delete process.env.WAPI_OUTGOING_ENABLED;else process.env.WAPI_OUTGOING_ENABLED=oldOutgoing;
  }
});
