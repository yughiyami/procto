import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import type { Pool } from 'pg';
import { pool } from './db.js';
import { deliverOutbound, queueOutbound, upsertConversation } from './chat.js';

export const DEMO_ORG = '19daab7c-e40a-4f7b-9305-1d6974493333';
export const DEMO_PEER = '51953597691@s.whatsapp.net';
export const DEMO_TEXT = 'Hola, soy PACO de Izumi. Esta es una prueba DEMO solicitada por el responsable de la plataforma: todos los productos, precios y pedidos son ficticios; no debes pagar nada. Ejemplo de venta: 100 polos de algodón DEMO a S/ 18 cada uno (total ficticio S/ 1800). Si deseas participar, responde con la cantidad y ciudad de entrega para simular una cotización. La conexión de recepción está pendiente de validación: no prometemos respuesta automática. Puedes ignorar este mensaje si no deseas participar.';
const KEY = 'demo-whatsapp-initial:51953597691:v1';
const fingerprint = createHash('sha256').update(DEMO_TEXT).digest('hex');

export function parseDemoSendArgs(args: string[]) {
  const clean = args.filter(arg => arg !== '--');
  if (clean.length > 1 || clean.some(arg => arg !== '--send-real')) throw new Error('Usage: send-demo-once.ts [--send-real]; defaults to dry-run');
  return { sendReal: clean.includes('--send-real') };
}

/** One authorized recipient and one stable operation. Never drains the worker queue. */
export async function sendDemoOnce(db: Pool, sendReal = false, deliver = deliverOutbound, orgId = DEMO_ORG) {
  if (!sendReal) return { mode: 'dry-run', orgId, peer: DEMO_PEER, text: DEMO_TEXT };
  if (!process.env.WAPI_API_KEY || !process.env.WAPI_BASE_URL) throw new Error('Configure WAPI_API_KEY and WAPI_BASE_URL privately before sending');
  const client = await db.connect();
  let outboundId = '', jobId = '';
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${orgId}:${KEY}`]);
    const existing = await client.query('SELECT fingerprint,response FROM operations WHERE org_id=$1 AND key=$2', [orgId, KEY]);
    if (existing.rowCount) {
      if (existing.rows[0].fingerprint !== fingerprint) throw new Error('Existing demo operation differs; manual reconciliation required');
      await client.query('COMMIT');
      return { mode: 'already-reserved', ...existing.rows[0].response, note: 'Never resent; inspect the existing outbound status.' };
    }
    if (!(await client.query('SELECT id FROM organizations WHERE id=$1', [orgId])).rowCount) throw new Error('Target organization does not exist');
    const conversation = await upsertConversation(client, { orgId, peer: DEMO_PEER, displayName: 'DEMO venta autorizada' });
    const outbound = await queueOutbound(client, { orgId, conversationId: conversation.id, body: DEMO_TEXT, approvedBy: 'human:explicit-user-demo-request' });
    outboundId = outbound.id;
    // Claim before commit: another worker must never see this message as pending.
    const job = await client.query("UPDATE jobs SET status='running', attempts=1, max_attempts=1, updated_at=now() WHERE org_id=$1 AND dedupe_key=$2 AND kind='whatsapp.send' AND status='pending' RETURNING id", [orgId, outboundId]);
    if (job.rowCount !== 1) throw new Error('Could not reserve the single demo job');
    jobId = job.rows[0].id;
    await client.query('INSERT INTO operations(org_id,key,fingerprint,response) VALUES($1,$2,$3,$4)', [orgId, KEY, fingerprint, JSON.stringify({ outboundId, conversationId: conversation.id, jobId })]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }

  const previousMode = process.env.WAPI_MODE, previousOutgoing = process.env.WAPI_OUTGOING_ENABLED;
  try {
    process.env.WAPI_MODE = 'live';
    process.env.WAPI_OUTGOING_ENABLED = 'true';
    await deliver(db, outboundId);
    await db.query("UPDATE jobs SET status='done', updated_at=now() WHERE id=$1", [jobId]);
    const result = await db.query('SELECT status FROM outbound_messages WHERE id=$1', [outboundId]);
    return { mode: 'attempted', outboundId, status: result.rows[0]?.status, note: 'Provider acceptance is not proof of delivery.' };
  } catch {
    // A timeout/crash is not permission to resend. Preserve indeterminate evidence.
    await db.query("UPDATE jobs SET status='failed', last_error='Single demo attempt interrupted; reconcile manually, do not resend', updated_at=now() WHERE id=$1", [jobId]);
    throw new Error('Demo attempt interrupted; inspect outbound status manually. Do not resend.');
  } finally {
    if (previousMode === undefined) delete process.env.WAPI_MODE; else process.env.WAPI_MODE = previousMode;
    if (previousOutgoing === undefined) delete process.env.WAPI_OUTGOING_ENABLED; else process.env.WAPI_OUTGOING_ENABLED = previousOutgoing;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let db: Pool | undefined;
  try {
    const args = parseDemoSendArgs(process.argv.slice(2));
    db = pool();
    console.log(JSON.stringify(await sendDemoOnce(db, args.sendReal), null, 2));
  } catch { console.error('Demo send failed. Check configuration and stored outbound status privately; no automatic retry.'); process.exitCode = 1; }
  finally { await db?.end(); }
}
