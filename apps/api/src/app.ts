import {registerPurchases} from './purchase-demo.js';
import {registerPitchDemo} from './pitch-demo-wiring.js';
import {authenticateDemo,createDemoRateLimiter,demoRouteAllowed,registerDemoSessions} from './demo-session.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import type {Pool,PoolClient} from 'pg';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {z,ZodError} from 'zod';
import {createOrder,addContribution,quoteOrder,acceptOrder,deliverOrder,addMovement,cancelOrder,feasibility,finance,DomainError,type Order} from './domain.js';
import {registerIntegrations} from './integration-wiring.js';
import {registerChat} from './chat-wiring.js';
import {registerAgents} from './agent-wiring.js';
import {registerDirectory} from './directory-wiring.js';
import {registerMcp} from './mcp-wiring.js';
import {registerProfile} from './profile-wiring.js';
import {registerProfileDraft} from './profile-draft-wiring.js';
import {registerFinanceDraft} from './finance-draft-wiring.js';
import {registerOpportunities} from './opportunity-wiring.js';
import {registerDemo} from './demo-wiring.js';

export const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export function buildApp(db:Pool){
 const app=Fastify({disableRequestLogging:true,logger:{redact:['req.headers.authorization','req.headers.x-webhook-signature']},bodyLimit:256*1024});
 app.setErrorHandler((e,req,reply)=>{if(e instanceof ZodError)return reply.code(400).send({error:'Invalid input',issues:e.issues});if(e instanceof DomainError)return reply.code(409).send({error:e.message});req.log.error({code:(e as {code?:string}).code},'Request failed');return reply.code(500).send({error:'Internal error'});});
 // Browser clients live on a different origin. Allowlist is explicit; no wildcard with credentials.
 const webOrigins=(process.env.WEB_ORIGIN??'http://localhost:5173').split(',').map(o=>o.trim()).filter(Boolean);
 app.register(cors,{origin:webOrigins,methods:['GET','POST','OPTIONS'],allowedHeaders:['Authorization','Content-Type','Idempotency-Key'],maxAge:600});
 app.get('/health',async()=>({status:'ok',service:'izumi-backend',integrations:'See /integrations/status (authenticated)'}));
 const limitDemo=createDemoRateLimiter();
 app.addHook('preHandler',async(req,reply)=>{
  const route=req.routeOptions.url??'';
  if(req.method==='POST'&&route==='/demo/session')return;
  const token=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):undefined;
  if(token?.startsWith('demo_')){
   const session=await authenticateDemo(db,token);
   if(!session)return reply.code(401).send({error:'Demo session expired or disabled'});
   if(!demoRouteAllowed(req.method,route))return reply.code(403).send({error:'This action is unavailable in demo mode; no real integrations or messages are executed'});
   const retryAfter=limitDemo(session.org_id,req.method);
   if(retryAfter!==null)return reply.header('Retry-After',String(retryAfter)).code(429).send({error:'Demo request limit reached; retry later'});
   Object.assign(req,{org:session.org_id,demoSession:session});return;
  }
  if(req.url==='/health'||req.url.startsWith('/public/')||req.url==='/webhooks/wapi')return;
  if(!token||token===req.headers.authorization)return reply.code(401).send({error:'Bearer token required'});
  const r=await db.query('SELECT org_id FROM credentials WHERE token_hash=$1',[hash(token)]);
  if(!r.rowCount)return reply.code(401).send({error:'Invalid token'});
  (req as unknown as {org:string}).org=r.rows[0].org_id;
 });
 registerDemoSessions(app,db);
 const org=(req:unknown)=>(req as {org:string}).org;
 async function read(c:Pool|PoolClient,id:string,tenant:string,lock=false):Promise<Order>{z.uuid().parse(id);const r=await c.query(`SELECT data FROM orders WHERE id=$1 AND org_id=$2 ${lock?'FOR UPDATE':''}`,[id,tenant]);if(!r.rowCount)throw new DomainError('Order not found');return r.rows[0].data;}
 app.post('/suppliers',async(req,reply)=>{const body=z.object({name:z.string().trim().min(1).max(200)}).strict().parse(req.body);const id=randomUUID();await db.query('INSERT INTO suppliers VALUES($1,$2,$3)',[id,org(req),body.name]);return reply.code(201).send({id,...body});});
 app.get('/suppliers',async req=>(await db.query('SELECT id,name FROM suppliers WHERE org_id=$1',[org(req)])).rows);
 app.get('/orders',async req=>(await db.query('SELECT data FROM orders WHERE org_id=$1 ORDER BY updated_at DESC LIMIT 100',[org(req)])).rows.map(r=>r.data));
 app.get<{Params:{id:string}}>('/orders/:id',async req=>read(db,req.params.id,org(req)));
 app.get<{Params:{id:string}}>('/orders/:id/feasibility',async req=>feasibility(await read(db,req.params.id,org(req))));
 app.get<{Params:{id:string}}>('/orders/:id/finance',async req=>finance(await read(db,req.params.id,org(req))));
 app.get<{Params:{id:string}}>('/orders/:id/evidence',async req=>({chainStatus:'not_anchored',algorithm:'sha256-json-v1',events:(await read(db,req.params.id,org(req))).events,warning:'Private audit export; not proof of physical fulfillment or blockchain anchoring.'}));
 async function mutation(req:any,reply:any,fn:(c:PoolClient)=>Promise<unknown>){const key=z.string().min(8).max(128).parse(req.headers['idempotency-key']);const tenant=org(req);const fingerprint=hash(req.method+req.url+JSON.stringify(req.body??null));const c=await db.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[tenant+':'+key]);const prior=await c.query('SELECT fingerprint,response FROM operations WHERE org_id=$1 AND key=$2',[tenant,key]);if(prior.rowCount){if(prior.rows[0].fingerprint!==fingerprint)throw new DomainError('Idempotency key reused with different request');await c.query('COMMIT');return reply.send(prior.rows[0].response);}const result=await fn(c);await c.query('INSERT INTO operations VALUES($1,$2,$3,$4)',[tenant,key,fingerprint,JSON.stringify(result)]);await c.query('COMMIT');return reply.send(result);}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 app.post('/orders',(req,reply)=>mutation(req,reply,async c=>{const o=createOrder(req.body,org(req));await c.query('INSERT INTO orders(id,org_id,data) VALUES($1,$2,$3)',[o.id,org(req),JSON.stringify(o)]);return o;}));
 const actions:Record<string,(o:Order,body:unknown,actor:string)=>void>={contributions:addContribution,quote:quoteOrder,accept:(o,b,a)=>acceptOrder(o,z.object({version:z.number().int()}).strict().parse(b).version,a),deliveries:deliverOrder,movements:addMovement,cancel:(o,_b,a)=>cancelOrder(o,a)};
 for(const [action,fn] of Object.entries(actions))app.post<{Params:{id:string}}>(`/orders/:id/${action}`,(req,reply)=>mutation(req,reply,async c=>{const o=await read(c,req.params.id,org(req),true);if(action==='contributions'){const sid=z.object({supplierId:z.uuid()}).parse(req.body).supplierId;const r=await c.query('SELECT id FROM suppliers WHERE id=$1 AND org_id=$2',[sid,org(req)]);if(!r.rowCount)throw new DomainError('Supplier not found');}fn(o,req.body,org(req));await c.query('UPDATE orders SET data=$1,updated_at=now() WHERE id=$2 AND org_id=$3',[JSON.stringify(o),o.id,org(req)]);return o;}));
 app.post<{Params:{id:string}}>('/orders/:id/invitations',(req,reply)=>mutation(req,reply,async c=>{const b=z.object({purpose:z.enum(['supplier','customer']),supplierId:z.uuid().optional(),expiresAt:z.iso.datetime()}).strict().parse(req.body);if(Date.parse(b.expiresAt)<=Date.now()||Date.parse(b.expiresAt)>Date.now()+7*86400_000)throw new DomainError('Invitation expiry must be within seven days');const o=await read(c,req.params.id,org(req),true);if(b.purpose==='customer'&&(o.status!=='quoted'||!o.quote))throw new DomainError('Quote first');if(b.purpose==='supplier'){const r=await c.query('SELECT id FROM suppliers WHERE id=$1 AND org_id=$2',[b.supplierId??null,org(req)]);if(!r.rowCount)throw new DomainError('Supplier not found');}const token=randomBytes(32).toString('hex');await c.query('INSERT INTO invitations(token_hash,org_id,order_id,supplier_id,purpose,quote_version,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[hash(token),org(req),o.id,b.supplierId??null,b.purpose,o.quote?.version??null,b.expiresAt]);return {token,path:`/public/invitations/${token}`,expiresAt:b.expiresAt};}));
 async function invitation(token:string,c:Pool|PoolClient,lock=false){z.string().regex(/^[a-f0-9]{64}$/).parse(token);const r=await c.query(`SELECT * FROM invitations WHERE token_hash=$1 AND expires_at>now() ${lock?'FOR UPDATE':''}`,[hash(token)]);if(!r.rowCount)throw new DomainError('Invitation not found or expired');return r.rows[0];}
 app.get<{Params:{token:string}}>('/public/invitations/:token',async req=>{const i=await invitation(req.params.token,db);const o=await read(db,i.order_id,i.org_id);return {purpose:i.purpose,used:Boolean(i.used_at),title:o.title,specification:o.specification,quantity:o.quantity,dueAt:o.dueAt,...(i.purpose==='customer'?{quote:o.quote?{version:o.quote.version,priceCents:o.quote.priceCents,validUntil:o.quote.validUntil,currency:o.currency}:null}:{})};});
 app.post<{Params:{token:string}}>('/public/invitations/:token',async req=>{const c=await db.connect();try{await c.query('BEGIN');const i=await invitation(req.params.token,c,true);if(i.used_at)throw new DomainError('Invitation already submitted');const o=await read(c,i.order_id,i.org_id,true);if(i.purpose==='customer'){const b=z.object({accept:z.literal(true),version:z.number().int()}).strict().parse(req.body);if(b.version!==i.quote_version)throw new DomainError('Invitation quote changed');acceptOrder(o,b.version,'customer-invitation');}else{const b=z.record(z.string(),z.unknown()).parse(req.body);addContribution(o,{...b,supplierId:i.supplier_id},`supplier:${i.supplier_id}`);}await c.query('UPDATE orders SET data=$1,updated_at=now() WHERE id=$2',[JSON.stringify(o),o.id]);await c.query('UPDATE invitations SET used_at=now() WHERE token_hash=$1',[hash(req.params.token)]);await c.query('COMMIT');return {submitted:true,status:o.status};}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}});
 registerIntegrations(app,db);
 registerChat(app,db);
 registerAgents(app,db);
 registerDirectory(app,db);
 registerMcp(app,db);
 registerProfile(app,db);
 registerProfileDraft(app,db);
 registerFinanceDraft(app,db);
 registerOpportunities(app,db);
 registerDemo(app,db);registerPurchases(app,db);
 registerPitchDemo(app,db);
 return app;
}

