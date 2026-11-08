import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import { z } from 'zod';
import { pool } from './db.js';
import { createOrder, addContribution, quoteOrder, acceptOrder, addMovement } from './domain.js';

const LABEL = 'DEMO — venta sintética, sin cobros, pagos ni entrega reales';
function fixtureId(org: string, peer: string, kind: string) {
  const h = createHash('sha256').update(`izumi-whatsapp-demo-v1:${org}:${peer}:${kind}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}

export function parseScenarioArgs(args: string[]) {
  const clean = args.filter(a => a !== '--');
  const values: Record<string,string> = {};
  let apply = false;
  for (let i = 0; i < clean.length; i++) {
    const key = clean[i]!;
    if (key === '--apply' && !apply) { apply = true; continue; }
    if (!['--org-id', '--phone'].includes(key) || values[key] || !clean[i+1]) throw new Error('Usage: --org-id UUID --phone +E164 [--apply]');
    values[key] = clean[++i]!;
  }
  return { orgId: z.uuid().parse(values['--org-id']).toLowerCase(), phone: z.string().regex(/^\+[1-9]\d{7,14}$/).parse(values['--phone']), apply };
}

/** Local fixtures only. Never fabricates inbound messages or enqueues external actions. */
export async function seedWhatsAppScenario(db: Pool, orgId: string, phone: string, apply = false) {
  orgId = z.uuid().parse(orgId).toLowerCase();
  phone = z.string().regex(/^\+[1-9]\d{7,14}$/).parse(phone);
  const peer = `${phone.slice(1)}@s.whatsapp.net`;
  const ids = Object.fromEntries(['supplier','order','opportunity','conversation'].map(k => [k, fixtureId(orgId, peer, k)])) as Record<'supplier'|'order'|'opportunity'|'conversation',string>;
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    if (!(await c.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [orgId])).rowCount) throw new Error('Target organization does not exist');
    if (!apply) { await c.query('ROLLBACK'); return { mode: 'dry-run', ids, label: LABEL, planned: { suppliers: 1, orders: 1, opportunities: 1, conversations: 1 }, inserted: null }; }
    const inserted = { suppliers: 0, orders: 0, opportunities: 0, conversations: 0 };
    inserted.suppliers = (await c.query('INSERT INTO suppliers(id,org_id,name) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING', [ids.supplier,orgId,'DEMO Taller de polos Misti'])).rowCount ?? 0;
    if (!(await c.query('SELECT id FROM orders WHERE id=$1',[ids.order])).rowCount) {
      const actor = 'DEMO scenario seed — not a customer confirmation';
      const future = (days: number) => new Date(Date.now()+days*86400000).toISOString();
      const order = createOrder({ title: 'DEMO WhatsApp: 100 polos algodón', specification: `${LABEL}. 100 polos algodón azul, talla M.`, quantity: 100, ownQuantity: 20, ownCostCents: 20000, dueAt: future(14) }, actor);
      order.id = ids.order;
      addContribution(order, { supplierId: ids.supplier, specification: order.specification, quantity: 80, unitCostCents: 1000, availableAt: future(7), validUntil: future(10), confirmed: true }, actor);
      quoteOrder(order, { priceCents: 180000, logisticsCents: 10000, coordinationCents: 5000, validUntil: future(3) }, actor);
      acceptOrder(order, order.quote!.version, actor);
      addMovement(order, { kind: 'customer_receipt', amountCents: 90000, reference: 'DEMO-ANTICIPO-WHATSAPP', counterparty: 'DEMO Cliente de prueba', verification: 'declared', note: LABEL }, actor);
      addMovement(order, { kind: 'supplier_payment', amountCents: 30000, reference: 'DEMO-COSTO-WHATSAPP', counterparty: 'DEMO Taller Misti', verification: 'declared', note: LABEL }, actor);
      await c.query('INSERT INTO orders(id,org_id,data) VALUES($1,$2,$3)',[ids.order,orgId,JSON.stringify(order)]);
      inserted.orders++;
    }
    inserted.opportunities = (await c.query("INSERT INTO sales_opportunities(id,org_id,title,amount_cents,status) VALUES($1,$2,$3,$4,'won') ON CONFLICT(id) DO NOTHING",[ids.opportunity,orgId,'DEMO WhatsApp: 100 polos algodón — venta ficticia declarada',180000])).rowCount ?? 0;
    inserted.conversations = (await c.query('INSERT INTO conversations(id,org_id,peer,display_name,order_id,agent_paused) VALUES($1,$2,$3,$4,$5,true) ON CONFLICT DO NOTHING',[ids.conversation,orgId,peer,'DEMO Cliente de prueba (contacto autorizado)',ids.order])).rowCount ?? 0;
    const existing = (await c.query('SELECT id,order_id FROM conversations WHERE org_id=$1 AND peer=$2',[orgId,peer])).rows[0];
    await c.query('COMMIT');
    return { mode: 'applied', ids: { ...ids, conversation: existing.id }, label: LABEL, inserted, conversationLinkedToDemoOrder: existing.order_id === ids.order, warning: 'Existing conversation preserved; no inbound messages invented. Agent remains unchanged/paused; no external actions.' };
  } catch (error) { await c.query('ROLLBACK'); throw error; }
  finally { c.release(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseScenarioArgs(process.argv.slice(2));
  const db = pool();
  try { console.log(JSON.stringify(await seedWhatsAppScenario(db,args.orgId,args.phone,args.apply),null,2)); }
  finally { await db.end(); }
}
