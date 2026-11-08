import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import { z } from 'zod';
import { pool } from './db.js';
import { companyInput } from './directory-wiring.js';
import { createOrder, addContribution, quoteOrder, acceptOrder, addMovement, deliverOrder } from './domain.js';

const LABEL = 'DEMO — DATOS SINTÉTICOS, NO OPERACIONES REALES';
const counts = { suppliers: 3, companies: 6, opportunities: 4, orders: 4 };
function idFor(org: string, key: string) {
  const h = createHash('sha256').update(`izumi-demo-v1:${org}:${key}`).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}

export function parseSeedArgs(args: string[]) {
  const clean = args.filter(a => a !== '--');
  const index = clean.indexOf('--org-id');
  if (index < 0 || !clean[index + 1]) throw new Error('Usage: seed:demo -- --org-id UUID [--apply]; default is dry-run');
  const orgId = z.uuid().parse(clean[index + 1]).toLowerCase();
  const rest = clean.filter((_, i) => i !== index && i !== index + 1);
  if (rest.some(a => a !== '--apply') || rest.length > 1) throw new Error('Unknown or duplicate arguments');
  return { orgId, apply: rest.includes('--apply') };
}

/** Does not select a tenant implicitly, replace existing data, or enqueue external actions. */
export async function seedDemo(db: Pool, orgId: string, apply = false) {
  orgId = z.uuid().parse(orgId).toLowerCase();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const org = await client.query('SELECT id,name FROM organizations WHERE id=$1 FOR UPDATE', [orgId]);
    if (!org.rowCount) throw new Error('Target organization does not exist');
    if (!apply) {
      await client.query('ROLLBACK');
      return { mode: 'dry-run', orgId, label: LABEL, plannedMaximum: counts };
    }
    const inserted = { suppliers: 0, companies: 0, opportunities: 0, orders: 0 };
    const suppliers = ['Textil Misti', 'Confecciones Colca', 'Acabados Sur'];
    for (const [i, name] of suppliers.entries()) {
      const r = await client.query('INSERT INTO suppliers(id,org_id,name) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING', [idFor(orgId, `supplier:${i}`), orgId, `DEMO ${name}`]);
      inserted.suppliers += r.rowCount ?? 0;
    }
    for (const [i, name] of [...suppliers, 'Tienda Arequipa', 'Hotel Valle', 'Distribuidor Lima'].entries()) {
      const data = companyInput.parse({ name: `DEMO ${name}`, country: 'PE', city: i === 5 ? 'Lima' : 'Arequipa', role: i < 3 ? 'supplier' : 'buyer', products: ['Textiles de demostración'], hsCodes: ['61'], sourceUrl: `https://demo.example/companies/${i}`, notes: `${LABEL}. SYNTHETIC NEVER SCRAPED. Empresa ficticia; no contactar.` });
      const r = await client.query("INSERT INTO directory_companies(id,org_id,name,source_url,data,source) VALUES($1,$2,$3,$4,$5,'manual') ON CONFLICT DO NOTHING", [idFor(orgId, `company:${i}`), orgId, data.name, data.sourceUrl, JSON.stringify(data)]);
      inserted.companies += r.rowCount ?? 0;
    }
    for (const [i, status] of ['open', 'quoted', 'won', 'lost'].entries()) {
      const r = await client.query('INSERT INTO sales_opportunities(id,org_id,company_id,title,amount_cents,status,loss_reason) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING', [idFor(orgId, `opportunity:${i}`), orgId, idFor(orgId, `company:${3 + i % 3}`), `DEMO Venta textil ${i + 1} — declaración sintética`, [420000, 360000, 280000, 190000][i], status, status === 'lost' ? 'DEMO: comprador ficticio eligió otra fecha; no es una pérdida real' : null]);
      inserted.opportunities += r.rowCount ?? 0;
    }
    // Dates and random event evidence are generated only for missing fixtures, never rewritten on rerun.
    const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
    for (let i = 0; i < 4; i++) {
      const id = idFor(orgId, `order:${i}`);
      if ((await client.query('SELECT id FROM orders WHERE id=$1', [id])).rowCount) continue;
      const actor = 'DEMO synthetic seed (not a human business event)';
      const o = createOrder({ title: `DEMO Pedido textil ${i + 1}`, specification: LABEL, quantity: 100, ownQuantity: 20, ownCostCents: 30000, dueAt: future(14) }, actor);
      o.id = id;
      addContribution(o, { supplierId: idFor(orgId, `supplier:${i % 3}`), specification: LABEL, quantity: 80, unitCostCents: 1500, availableAt: future(7), validUntil: future(10), confirmed: true }, actor);
      if (i > 0) quoteOrder(o, { priceCents: 240000, logisticsCents: 10000, coordinationCents: 5000, validUntil: future(3) }, actor);
      if (i > 1) {
        acceptOrder(o, o.quote!.version, actor);
        addMovement(o, { kind: 'customer_receipt', amountCents: i === 3 ? 240000 : 120000, reference: `DEMO-RECEIPT-${i}`, counterparty: 'DEMO Cliente ficticio', verification: 'declared', note: LABEL }, actor);
        addMovement(o, { kind: 'supplier_payment', amountCents: 120000, reference: `DEMO-PAYMENT-${i}`, counterparty: `DEMO ${suppliers[i % 3]}`, verification: 'declared', note: LABEL }, actor);
        deliverOrder(o, { quantity: i === 3 ? 100 : 40, reference: `DEMO-DELIVERY-${i}` }, actor);
      }
      await client.query('INSERT INTO orders(id,org_id,data) VALUES($1,$2,$3)', [id, orgId, JSON.stringify(o)]);
      inserted.orders++;
    }
    await client.query('COMMIT');
    return { mode: 'applied', orgId, label: LABEL, inserted };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseSeedArgs(process.argv.slice(2));
  const db = pool();
  try { console.log(JSON.stringify(await seedDemo(db, args.orgId, args.apply), null, 2)); }
  finally { await db.end(); }
}
