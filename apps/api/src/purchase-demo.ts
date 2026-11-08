import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { JsonRpcProvider, ZeroAddress } from 'ethers';
import { createOrder, quoteOrder, acceptOrder, deliverOrder, addMovement, DomainError, type Order } from './domain.js';
import { queueOutbound, upsertConversation } from './chat.js';
import { enqueue } from './jobs.js';
import { isLocalMinkaly } from './integrations/minkaly.js';
import { serviceUrl } from './integrations/wapi.js';

export const purchaseMigration = `CREATE TABLE IF NOT EXISTS demo_purchases(
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), order_id uuid NOT NULL REFERENCES orders(id),
 conversation_id uuid NOT NULL REFERENCES conversations(id), request_key text NOT NULL, acceptance_code text NOT NULL,
 quote_version integer NOT NULL, status text NOT NULL DEFAULT 'awaiting_acceptance', evidence_hash text,
 tx_hash text, block_number integer, anchor_error text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,request_key));`;
const inputSchema=z.object({confirmSynthetic:z.literal(true),confirmBuyer:z.literal(true),idempotencyKey:z.string().min(8).max(100),buyerPeer:z.string().regex(/^\d+(?::\d+)?@lid$/).optional()}).strict();
export async function startDemoPurchase(db:Pool,org:string,raw:unknown){
 const input=inputSchema.parse(raw),c=await db.connect();
 try{await c.query('BEGIN');await c.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE',[org]);
 const prior=await c.query('SELECT * FROM demo_purchases WHERE org_id=$1 AND request_key=$2',[org,input.idempotencyKey]);
 if(prior.rowCount){await c.query('COMMIT');return {...prior.rows[0],reused:true};}
 let peer=input.buyerPeer??'51953597691@s.whatsapp.net';
 if(!input.buyerPeer&&process.env.WAPI_MODE==='live'){
  if(!process.env.WAPI_API_KEY)throw new DomainError('Wapi key required to verify buyer');
  const response=await fetch(serviceUrl(process.env.WAPI_BASE_URL??'https://api.wapi.crafter.run','api/lid-from-pn/51953597691'),{headers:{Authorization:`Bearer ${process.env.WAPI_API_KEY}`},signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!response.ok)throw new DomainError('No se pudo verificar el comprador en Wapi');
  peer=z.object({success:z.literal(true),data:z.object({lid:z.string().regex(/^\d+(?::\d+)?@lid$/)})}).parse(await response.json()).data.lid;
 }
 const conversation=await upsertConversation(c,{orgId:org,peer});
 // A refreshed page has a new request key. Recover the buyer's existing purchase
 // instead of rejecting it or enqueueing another offer. This never resumes BAJA.
 const active=await c.query("SELECT * FROM demo_purchases WHERE org_id=$1 AND conversation_id=$2 AND status IN ('awaiting_acceptance','anchor_pending') ORDER BY created_at DESC LIMIT 1",[org,conversation.id]);
 if(active.rowCount){await c.query('COMMIT');return {...active.rows[0],reused:true};}
 const enabled=(await c.query('SELECT auto_reply FROM conversations WHERE id=$1 AND org_id=$2',[conversation.id,org])).rows[0]?.auto_reply;
 if(conversation.agentPaused||!enabled)throw new DomainError('Activa explícitamente el agente y las respuestas automáticas para este comprador antes de iniciar; no se ignora BAJA.');
 const future=(d:number)=>new Date(Date.now()+d*86400000).toISOString();
 const order=createOrder({title:'DEMO 100 polos de algodón',specification:'DEMO: venta, pago y entrega ficticios, sin dinero real',quantity:100,ownQuantity:100,ownCostCents:90000,dueAt:future(7)},'DEMO operator');
 quoteOrder(order,{priceCents:180000,logisticsCents:0,coordinationCents:0,validUntil:future(1)},'DEMO operator');
 await c.query('INSERT INTO orders(id,org_id,data) VALUES($1,$2,$3)',[order.id,org,JSON.stringify(order)]);
 const id=randomUUID(),code=`COMPRAR DEMO ${id.slice(0,8).toUpperCase()}`;
 const row=(await c.query('INSERT INTO demo_purchases(id,org_id,order_id,conversation_id,request_key,acceptance_code,quote_version) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[id,org,order.id,conversation.id,input.idempotencyKey,code,order.quote!.version])).rows[0];
 await c.query('UPDATE conversations SET order_id=$1 WHERE id=$2 AND org_id=$3',[order.id,conversation.id,org]);
 await queueOutbound(c,{orgId:org,conversationId:conversation.id,approvedBy:'auto:demo-purchase',body:`PACO · PRUEBA DEMO. Cotización: 100 polos de algodón a S/18 = S/1,800. Pedido ${order.id}, versión ${order.quote!.version}; válida 24 horas. No hay cobro ni envío real. Si deseas completar la COMPRA SIMULADA (pago y entrega ficticios) y registrar su huella en blockchain LOCAL, responde exactamente: ${code}. Puedes escribir BAJA para detener mensajes.`});
 await c.query('COMMIT');return row;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}

/** Invoked inside the inbound transaction. Never interpret natural language as consent. */
export async function acceptDemoPurchase(c:PoolClient,org:string,conversationId:string,text:string):Promise<boolean>{
 if(!/^COMPRAR DEMO [A-F0-9]{8}$/i.test(text.trim()))return false;
 const r=await c.query('SELECT p.* FROM demo_purchases p JOIN conversations c ON c.id=p.conversation_id AND c.org_id=p.org_id WHERE p.org_id=$1 AND p.conversation_id=$2 AND p.acceptance_code=$3 AND c.agent_paused=false FOR UPDATE OF p',[org,conversationId,text.trim().toUpperCase()]);
 if(!r.rowCount)return true;
 const p=r.rows[0];if(p.status!=='awaiting_acceptance')return true;
 const o=(await c.query('SELECT data FROM orders WHERE id=$1 AND org_id=$2 FOR UPDATE',[p.order_id,org])).rows[0].data as Order;
 if(o.status!=='quoted'||!o.quote||o.quote.version!==p.quote_version||Date.parse(o.quote.validUntil)<=Date.now()){
  await c.query("UPDATE demo_purchases SET status='quote_invalid',anchor_error='Cotización vencida o modificada; requiere nueva aprobación' WHERE id=$1",[p.id]);return true;
 }
 acceptOrder(o,p.quote_version,'DEMO buyer explicit WhatsApp acceptance');
 addMovement(o,{kind:'customer_receipt',amountCents:o.quote.priceCents,reference:`DEMO-PAGO-${p.id}`,counterparty:'DEMO comprador',verification:'declared',note:'Pago SINTÉTICO, no transferencia bancaria'},'DEMO simulation');
 deliverOrder(o,{quantity:o.quantity,reference:`DEMO-ENTREGA-${p.id}`},'DEMO simulation');
 const digest=createHash('sha256').update(JSON.stringify({scope:'IZUMI-DEMO-PURCHASE-V1',purchaseId:p.id,orderId:o.id,quoteVersion:p.quote_version,eventHash:o.events.at(-1)!.hash})).digest('hex');
 await c.query('UPDATE orders SET data=$1,updated_at=now() WHERE id=$2 AND org_id=$3',[JSON.stringify(o),o.id,org]);
 await c.query("UPDATE demo_purchases SET status='anchor_pending',evidence_hash=$1 WHERE id=$2",[digest,p.id]);
 await enqueue(c,{orgId:org,kind:'blockchain.anchor',payload:{purchaseId:p.id},dedupeKey:`purchase-anchor:${p.id}`});
 await queueOutbound(c,{orgId:org,conversationId,approvedBy:'auto:demo-purchase',body:`Compra DEMO aceptada: 100 polos, S/1,800. Pago y entrega SIMULADOS registrados. Pedido ${o.id}. La huella blockchain LOCAL está pendiente; todavía no está confirmada. No envíes dinero real.`});
 return true;
}

/** Zero-value hash-only anchoring, deliberately NOT a Minkaly escrow payment. */
export async function anchorLocalHash(hash:string):Promise<{txHash:string;blockNumber:number}>{
 if(!/^[a-f0-9]{64}$/.test(hash)||!isLocalMinkaly({demoEnabled:process.env.MINKALY_DEMO_ENABLED==='true',chainId:Number(process.env.MINKALY_CHAIN_ID),rpcUrl:process.env.MINKALY_RPC_URL,contractAddress:ZeroAddress}))throw new Error('Local DEMO blockchain only');
 const provider=new JsonRpcProvider('http://127.0.0.1:8547');
 try{
 if((await provider.getNetwork()).chainId!==31337n)throw new Error('Unexpected chain');
 const latest=await provider.getBlockNumber();if(latest>10000)throw new Error('Local demo scan limit reached');
 const data=`0x${hash}`,signer=await provider.getSigner(0),from=await signer.getAddress();
 // Recover the receipt if broadcast succeeded but the database commit was interrupted.
 for(let n=0;n<=latest;n++){
  const b=await provider.send('eth_getBlockByNumber',[`0x${n.toString(16)}`,true]);
  for(const tx of b.transactions){if(tx.input===data&&tx.from.toLowerCase()===from.toLowerCase()&&tx.to?.toLowerCase()===from.toLowerCase()&&BigInt(tx.value)===0n){const receipt=await provider.getTransactionReceipt(tx.hash);if(receipt?.status===1)return {txHash:receipt.hash,blockNumber:receipt.blockNumber};}}
 }
 const tx=await signer.sendTransaction({to:from,value:0n,data});const receipt=await tx.wait(1,20000);
 if(!receipt||receipt.status!==1)throw new Error('Local anchor receipt not confirmed');
 return {txHash:receipt.hash,blockNumber:receipt.blockNumber};
 }finally{provider.destroy();}
}
export async function anchorDemoPurchase(db:Pool,org:string,id:string,anchor=anchorLocalHash){
 const c=await db.connect();
 try{await c.query('BEGIN');
 // Serialize chain broadcasts as well as purchase retries, including multiple workers.
 await c.query("SELECT pg_advisory_xact_lock(hashtext('izumi-local-purchase-anchor'))");
 const p=(await c.query('SELECT * FROM demo_purchases WHERE id=$1 AND org_id=$2 FOR UPDATE',[id,org])).rows[0];
 if(!p||p.status!=='anchor_pending'){await c.query('COMMIT');return;}
 const receipt=await anchor(p.evidence_hash);
 await c.query("UPDATE demo_purchases SET status='anchored',tx_hash=$1,block_number=$2,anchor_error=null WHERE id=$3",[receipt.txHash,receipt.blockNumber,id]);
 await queueOutbound(c,{orgId:org,conversationId:p.conversation_id,approvedBy:'auto:demo-purchase',body:`Compra DEMO ${p.order_id}: huella confirmada en blockchain LOCAL 31337. Tx: ${receipt.txHash}. Bloque: ${receipt.blockNumber}. No es pago cripto ni red pública; no contiene tus datos personales.`});
 await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');await db.query('UPDATE demo_purchases SET anchor_error=$1 WHERE id=$2 AND org_id=$3',[e instanceof Error?e.message.slice(0,300):'Anchor failure',id,org]);throw e;}finally{c.release();}
}
export function registerPurchases(app:FastifyInstance,db:Pool){
 app.post('/demo/purchase/start',async(req,reply)=>{const org=(req as unknown as {org?:string}).org;if(!org)return reply.code(401).send({error:'Authentication required'});return startDemoPurchase(db,org,req.body);});
 app.get('/demo/purchases',async(req,reply)=>{const org=(req as unknown as {org?:string}).org;if(!org)return reply.code(401).send({error:'Authentication required'});return {demo:true,chainId:31337,items:(await db.query('SELECT * FROM demo_purchases WHERE org_id=$1 ORDER BY created_at DESC LIMIT 30',[org])).rows};});
}

