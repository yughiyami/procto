import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,migration} from '../src/db.js';
import {startDemoPurchase,anchorDemoPurchase,anchorLocalHash} from '../src/purchase-demo.js';
import {storeInboundMessage,upsertConversation} from '../src/chat.js';
import type {Pool} from 'pg';

for(const status of ['awaiting_acceptance','anchor_pending'])test(`a new request key recovers ${status} without sending or resuming BAJA`,async()=>{
 const org=randomUUID(),conversation=randomUUID(),purchase={id:randomUUID(),org_id:org,status};
 const statements:string[]=[];
 let released=false;
 const client={release(){released=true;},async query(sql:string,params?:unknown[]){
  statements.push(sql);
  if(['BEGIN','COMMIT','ROLLBACK'].includes(sql))return {rowCount:0,rows:[]};
  if(sql.startsWith('SELECT id FROM organizations')){assert.equal(params?.[0],org);return {rowCount:1,rows:[{id:org}]};}
  if(sql.includes('request_key=$2')){assert.equal(params?.[0],org);return {rowCount:0,rows:[]};}
  if(sql.includes('INSERT INTO conversations'))return {rowCount:1,rows:[{id:conversation,org_id:org,peer:'999999999999@lid',agent_paused:true}]};
  if(sql.includes("status IN ('awaiting_acceptance','anchor_pending')")){
   assert.deepEqual(params,[org,conversation]);return {rowCount:1,rows:[purchase]};
  }
  throw new Error(`Unexpected SQL during recovery: ${sql}`);
 }};
 const db={connect:async()=>client} as unknown as Pool;
 const result=await startDemoPurchase(db,org,{confirmSynthetic:true,confirmBuyer:true,idempotencyKey:'new-tab-request',buyerPeer:'999999999999@lid'});
 assert.equal(result.id,purchase.id);assert.equal(result.reused,true);assert.equal(released,true);
 assert.equal(statements.at(-1),'COMMIT');
 assert.equal(statements.some(sql=>/outbound_messages|INSERT INTO orders|UPDATE conversations|INSERT INTO jobs/.test(sql)),false);
});

test('purchase anchor refuses nonlocal configuration before any network IO',async()=>{
 const old=process.env.MINKALY_DEMO_ENABLED;process.env.MINKALY_DEMO_ENABLED='false';
 try{await assert.rejects(anchorLocalHash('a'.repeat(64)),/Local DEMO/);}finally{process.env.MINKALY_DEMO_ENABLED=old;}
});
test('explicit DEMO buyer purchase is isolated, exact-code, idempotent and anchors after completion only',{skip:!process.env.DATABASE_URL},async()=>{
 const db=pool(),org=randomUUID(),other=randomUUID(),peer='999999999999@lid';
 const inbound=async(organization:string,sender:string,text:string,key=randomUUID())=>{const c=await db.connect();try{await c.query('BEGIN');await storeInboundMessage(c,organization,{sender,text,dedupeKey:key,messageId:key,sessionId:58});await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
 const priorKey=process.env.DEEPSEEK_API_KEY;delete process.env.DEEPSEEK_API_KEY;
 try{
 await db.query(migration);for(const id of [org,other])await db.query('INSERT INTO organizations VALUES($1,$2)',[id,'TEST purchase']);
 const conversation=await upsertConversation(db,{orgId:org,peer});
 const input={confirmSynthetic:true,confirmBuyer:true,idempotencyKey:'test-purchase-1',buyerPeer:peer};
 await assert.rejects(startDemoPurchase(db,org,input),/Activa/);
 await db.query('UPDATE conversations SET agent_paused=false,auto_reply=true WHERE id=$1',[conversation.id]);
 const p=await startDemoPurchase(db,org,input),repeat=await startDemoPurchase(db,org,input);assert.equal(p.id,repeat.id);
 assert.equal((await db.query('SELECT * FROM outbound_messages WHERE org_id=$1',[org])).rowCount,1);
 await inbound(other,peer,p.acceptance_code);await inbound(org,'88888888888@lid',p.acceptance_code);await inbound(org,peer,'si comprar');
 const status=async()=>(await db.query('SELECT * FROM demo_purchases WHERE id=$1',[p.id])).rows[0];
 assert.equal((await status()).status,'awaiting_acceptance');
 let anchorCalls=0;const anchor=async(hash:string)=>{anchorCalls++;assert.match(hash,/^[a-f0-9]{64}$/);return {txHash:'0x'+'b'.repeat(64),blockNumber:17};};
 await anchorDemoPurchase(db,org,p.id,anchor);assert.equal(anchorCalls,0);
 await inbound(org,peer,'BAJA');await inbound(org,peer,p.acceptance_code);assert.equal((await status()).status,'awaiting_acceptance');
 await db.query('UPDATE conversations SET agent_paused=false,auto_reply=true WHERE id=$1',[conversation.id]);
 const key=randomUUID();await inbound(org,peer,p.acceptance_code,key);await inbound(org,peer,p.acceptance_code,key);await inbound(org,peer,p.acceptance_code);
 assert.equal((await status()).status,'anchor_pending');
 const order=(await db.query('SELECT data FROM orders WHERE id=$1',[p.order_id])).rows[0].data;
 assert.equal(order.status,'delivered');assert.equal(order.movements.length,1);assert.equal(order.movements[0].verification,'declared');
 await assert.rejects(anchorDemoPurchase(db,org,p.id,async()=>{throw new Error('offline');}),/offline/);assert.equal((await status()).status,'anchor_pending');assert.equal((await status()).anchor_error,'offline');
 await anchorDemoPurchase(db,org,p.id,anchor);await anchorDemoPurchase(db,org,p.id,anchor);assert.equal(anchorCalls,1);assert.equal((await status()).status,'anchored');
 assert.equal((await db.query("SELECT * FROM jobs WHERE org_id=$1 AND kind='blockchain.anchor'",[org])).rowCount,1);
 assert.equal((await db.query('SELECT * FROM outbound_messages WHERE org_id=$1',[org])).rowCount,3);
 }finally{
 if(priorKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=priorKey;
 for(const id of [org,other]){for(const table of ['jobs','demo_purchases','outbound_messages','inbox','conversations','orders'])await db.query(`DELETE FROM ${table} WHERE org_id=$1`,[id]);await db.query('DELETE FROM organizations WHERE id=$1',[id]);}await db.end();
 }
});
