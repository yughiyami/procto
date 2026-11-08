import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
import {buildApp,hash} from '../src/app.js';
import {pool,migration} from '../src/db.js';
test('PostgreSQL HTTP lifecycle: tenant isolation, idempotency, supplier and customer links',{skip:!process.env.DATABASE_URL},async()=>{
 const db=pool();await db.query(migration);const app=buildApp(db);const a=randomUUID(),b=randomUUID();const ta=randomBytes(32).toString('hex'),tb=randomBytes(32).toString('hex');
 await db.query('INSERT INTO organizations VALUES($1,$2),($3,$4)',[a,'Test A',b,'Test B']);await db.query('INSERT INTO credentials VALUES($1,$2),($3,$4)',[hash(ta),a,hash(tb),b]);
 const headers={authorization:`Bearer ${ta}`};const future=(n:number)=>new Date(Date.now()+86400_000*n).toISOString();
 const post=async(url:string,payload:unknown,key=randomUUID())=>app.inject({method:'POST',url,headers:{...headers,'idempotency-key':key},payload:payload as any});
 try{
 process.env.WAPI_WEBHOOK_SECRET=randomBytes(32).toString('hex');process.env.WAPI_SESSION_ID='123';process.env.WAPI_ORG_ID=a;
 const payload=JSON.stringify({event:'messages.received',sessionId:123,data:{key:{id:'message-1',remoteJid:'51911111111@s.whatsapp.net'},message:{conversation:'Necesito 60 polos'}}});
 const webhook=()=>app.inject({method:'POST',url:'/webhooks/wapi',headers:{'content-type':'application/json','x-webhook-signature':createHmac('sha256',process.env.WAPI_WEBHOOK_SECRET!).update(payload).digest('hex')},payload});
 assert.equal((await webhook()).statusCode,200);assert.equal((await webhook()).json().duplicate,true);
 assert.equal((await app.inject({url:'/inbox',headers})).json().length,1);
 assert.equal((await app.inject({url:'/inbox',headers:{authorization:`Bearer ${tb}`}})).json().length,0);
 assert.equal((await app.inject({method:'POST',url:'/webhooks/wapi',headers:{'content-type':'application/json'},payload})).statusCode,401);
 assert.equal((await app.inject('/orders')).statusCode,401);
 const s=(await post('/suppliers',{name:'Taller'})).json();
 const body={title:'Pedido test',specification:'azul M',quantity:60,ownQuantity:20,ownCostCents:20000,dueAt:future(10)};
 const key=randomUUID();const responses=await Promise.all([post('/orders',body,key),post('/orders',body,key)]);assert.equal(responses[0].statusCode,200);const o=responses[0].json();assert.equal(o.id,responses[1].json().id);
 assert.equal((await post('/orders',{...body,quantity:61},key)).statusCode,409);
 assert.equal((await app.inject({url:`/orders/${o.id}`,headers:{authorization:`Bearer ${tb}`}})).statusCode,409);
 const inv=(await post(`/orders/${o.id}/invitations`,{purpose:'supplier',supplierId:s.id,expiresAt:future(2)})).json();
 const contribution={specification:'azul M',quantity:40,unitCostCents:1000,availableAt:future(4),validUntil:future(3),confirmed:true};
 assert.equal((await app.inject({method:'POST',url:inv.path,payload:contribution})).statusCode,200);
 assert.equal((await app.inject({method:'POST',url:inv.path,payload:contribution})).statusCode,409);
 const q=await post(`/orders/${o.id}/quote`,{priceCents:90000,logisticsCents:1000,coordinationCents:2000,validUntil:future(2)});assert.equal(q.statusCode,200);
 const qi=(await post(`/orders/${o.id}/invitations`,{purpose:'customer',expiresAt:future(2)})).json();const publicView=(await app.inject(qi.path)).json();assert.equal(publicView.quote.costCents,undefined);assert.equal(publicView.events,undefined);
 assert.equal((await app.inject({method:'POST',url:qi.path,payload:{accept:true,version:q.json().quote.version}})).statusCode,200);
 assert.equal((await post(`/orders/${o.id}/deliveries`,{quantity:60,reference:'proof-01'})).json().status,'delivered');
 const evidence=(await app.inject({url:`/orders/${o.id}/evidence`,headers})).json();assert.equal(evidence.chainStatus,'not_anchored');
 }finally{delete process.env.WAPI_WEBHOOK_SECRET;delete process.env.WAPI_SESSION_ID;delete process.env.WAPI_ORG_ID;await app.close();// Foreign keys dictate this order: agent_* → outbound → drafts → inbox →
// conversations → orders. Adding a table without adding it here fails teardown,
// not the test itself, which is a confusing way to find out.
const teardown=['agent_steps','agent_proposals','agent_runs','outbound_messages','drafts','inbox','conversations','invitations','operations','jobs','orders','suppliers','credentials'];
for(const id of [a,b]){await db.query('DELETE FROM agent_steps WHERE run_id IN (SELECT id FROM agent_runs WHERE org_id=$1)',[id]);for(const table of teardown.slice(1))await db.query(`DELETE FROM ${table} WHERE org_id=$1`,[id]);await db.query('DELETE FROM organizations WHERE id=$1',[id]);}await db.end();}
});
