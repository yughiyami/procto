import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import Fastify from 'fastify';
import {registerProductPhotos,validatePhotoBytes} from '../src/product-photos.js';
import {pool,migration} from '../src/db.js';
import {upsertConversation} from '../src/chat.js';
import {queueAutomaticReply} from '../src/agents/auto-reply.js';
import {runAgent} from '../src/agents/runtime.js';

test('Photo bytes reject SVG, forged MIME, invalid base64 and oversized files',()=>{
  assert.equal(validatePhotoBytes(Buffer.from('<svg/>').toString('base64'),'image/png'),false);
  const png=Buffer.from('89504e470d0a1a0a','hex').toString('base64');
  assert.equal(validatePhotoBytes(png,'image/png'),true);
  assert.equal(validatePhotoBytes(png,'image/jpeg'),false);
  assert.equal(validatePhotoBytes('!!==','image/png'),false);
  assert.equal(validatePhotoBytes(Buffer.alloc(2*1024*1024+1).toString('base64'),'image/png'),false);
});

test('Approved photos scoped to tenant, public consent, upload contract, revoke, requested-only honest replies and history', {skip:!process.env.DATABASE_URL},async()=>{
  const db=pool();await db.query(migration);const org=randomUUID(),other=randomUUID();
  await db.query('INSERT INTO organizations VALUES($1,$2),($3,$4)',[org,'Photos test',other,'Other photos']);
  const keys=['WAPI_MODE','WAPI_ORG_ID','WAPI_API_KEY','DEEPSEEK_API_KEY'] as const;
  const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{WAPI_MODE:'live',WAPI_ORG_ID:org,WAPI_API_KEY:'test-only',DEEPSEEK_API_KEY:'mock-only'});
  let uploads=0;
  const app=Fastify();app.addHook('preHandler',async(req,reply)=>{
    if (!req.headers.authorization) return reply.code(401).send({error:'auth'});
    (req as unknown as {org:string}).org=req.headers.authorization==='other'?other:org;
  });app.setErrorHandler((_e,_req,reply)=>reply.code(400).send({error:'invalid'}));
  registerProductPhotos(app,db,(async(_url,init)=>{uploads++;assert.deepEqual(Object.keys(JSON.parse(String(init?.body))).sort(),['base64','mimetype']);return Response.json({success:true,publicUrl:'https://cdn.example.com/polos.png'});}) as typeof fetch);
  const headers={authorization:'owner'};
  try {
    assert.equal((await app.inject('/chat/photos')).statusCode,401);
    assert.equal((await app.inject({method:'POST',url:'/chat/photos',headers,payload:{label:'Polos',url:'https://cdn.example.com/polos.png'}})).statusCode,400);
    const upload={label:'Polos',base64:Buffer.from('89504e470d0a1a0a','hex').toString('base64'),mimetype:'image/png',confirmPublic:true};
    assert.equal((await app.inject({method:'POST',url:'/chat/photos/upload',headers:{authorization:'other'},payload:upload})).statusCode,409);assert.equal(uploads,0);
    const photo=(await app.inject({method:'POST',url:'/chat/photos/upload',headers,payload:upload})).json();assert.ok(photo.id);assert.equal(uploads,1);
    assert.equal((await app.inject({url:'/chat/photos',headers:{authorization:'other'}})).json().items.length,0);
    const conv=await upsertConversation(db,{orgId:org,peer:'51900000111@s.whatsapp.net'});
    await db.query('UPDATE conversations SET agent_paused=false,auto_reply=true WHERE id=$1',[conv.id]);
    async function reply(text:string) {
      const inboxId=randomUUID(),proposalId=randomUUID();
      await db.query('INSERT INTO inbox(id,org_id,payload,conversation_id) VALUES($1,$2,$3,$4)',[inboxId,org,JSON.stringify({text}),conv.id]);
      await db.query("INSERT INTO agent_proposals(id,org_id,kind,conversation_id,payload) VALUES($1,$2,'message',$3,'{}')",[proposalId,org,conv.id]);
      await queueAutomaticReply(db,{orgId:org,conversationId:conv.id,inboxId,proposalId,body:'Te adjunto una foto inventada'});
      return (await db.query('SELECT media,body FROM outbound_messages WHERE source_inbox_id=$1',[inboxId])).rows[0];
    }
    assert.equal((await reply('Mándame fotos de polos')).media.url,photo.url);
    assert.equal((await reply('Hola')).media,null);
    assert.equal((await reply('No me envíes fotos')).media,null);
    await app.inject({method:'DELETE',url:`/chat/photos/${photo.id}`,headers:{authorization:'other'}});
    assert.equal((await app.inject({url:'/chat/photos',headers})).json().items.length,1);
    await app.inject({method:'DELETE',url:`/chat/photos/${photo.id}`,headers});
    const missing=await reply('Quiero fotos');assert.equal(missing.media,null);assert.match(missing.body,/no tengo una imagen aprobada/);assert.doesNotMatch(missing.body,/adjunto/);
    const run=randomUUID();await db.query("INSERT INTO agent_runs(id,org_id,kind,conversation_id,input) VALUES($1,$2,'compose',$3,'{}')",[run,org,conv.id]);
    await runAgent(db,run,{fetchImpl:(async(_url,init)=>{
      const request=JSON.parse(String(init?.body));const context=JSON.parse(request.messages[1].content).context;
      assert.ok(context.conversation.messages.some((m:{body:string})=>m.body==='Mándame fotos de polos'));
      assert.match(request.messages[0].content,/at most ONE short question/);
      return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({proposals:[{rationale:'greeting',payload:{body:'¡Hola! ¿En qué producto te ayudo?'}}]})}}],usage:{total_tokens:20}});
    }) as typeof fetch});
    assert.equal((await db.query('SELECT status FROM agent_runs WHERE id=$1',[run])).rows[0].status,'succeeded');
  } finally {
    await app.close();for(const table of ['agent_proposals','agent_runs','jobs','outbound_messages','inbox','conversations'])await db.query(`DELETE FROM ${table} WHERE org_id=$1`,[org]);
    await db.query('DELETE FROM organizations WHERE id=ANY($1::uuid[])',[[org,other]]);await db.end();
    for(const k of keys)if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];
  }
});
