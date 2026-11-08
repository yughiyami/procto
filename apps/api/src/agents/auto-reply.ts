import {selectProductPhoto} from '../product-photos.js';
import type { Pool } from 'pg';
import { queueOutbound } from '../chat.js';

/** Opt-in replies only: transaction serializes consent, daily cap and inbox dedupe.
 * No order/payment changes; no cold outreach; old queued inbound expires after 24h. */
export async function queueAutomaticReply(db: Pool, input: { orgId: string; conversationId: string; inboxId: string; proposalId: string; body: string }): Promise<boolean> {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const consent = await c.query('SELECT agent_paused,auto_reply FROM conversations WHERE id=$1 AND org_id=$2 FOR UPDATE', [input.conversationId, input.orgId]);
    const inbound = await c.query("SELECT id,payload FROM inbox WHERE id=$1 AND org_id=$2 AND conversation_id=$3 AND created_at > now()-interval '24 hours'", [input.inboxId, input.orgId, input.conversationId]);
    const counts = await c.query("SELECT count(*) FILTER (WHERE created_at > now()-interval '24 hours')::int AS daily, count(*) FILTER (WHERE source_inbox_id=$3)::int AS duplicate FROM outbound_messages WHERE org_id=$1 AND conversation_id=$2 AND approved_by LIKE 'auto:%'", [input.orgId, input.conversationId, input.inboxId]);
    if (!consent.rowCount || consent.rows[0].agent_paused || !consent.rows[0].auto_reply || !inbound.rowCount || counts.rows[0].daily >= 20 || counts.rows[0].duplicate > 0) {
      await c.query('COMMIT'); return false;
    }
    // Only reuse an operator-approved asset from this same customer's conversation,
    // and only in direct response to an explicit media request. Never scrape/invent URLs.
    const text = String(inbound.rows[0].payload?.text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const requestedKind = /\b(no|sin|nunca)\b/i.test(text) ? null : /\b(sticker|stickers|stiker|stikers)\b/i.test(text) ? 'sticker' : /\b(foto|fotos|imagen|imagenes|promo|promos|promocion|oferta|ofertas|catalogo)\b/i.test(text) ? 'image' : null;
    const wantsPromotion = /\b(promo|promos|promocion|oferta|ofertas)\b/i.test(text);
    const asset = requestedKind ? await c.query("SELECT media,promotion,body FROM outbound_messages WHERE org_id=$1 AND conversation_id=$2 AND media->>'kind'=$3 AND approved_by NOT LIKE 'auto:%' AND status IN ('accepted','sent') AND created_at > now()-interval '24 hours' AND (promotion=false OR $4) ORDER BY created_at DESC LIMIT 1", [input.orgId,input.conversationId,requestedKind,wantsPromotion]) : null;
    const photo = requestedKind === 'image' && !wantsPromotion ? await selectProductPhoto(c,input.orgId,text) : null;
    const selected = photo ? {kind:'image' as const,url:photo.url} : asset?.rows[0]?.media;
    // Deterministic captions mean the model cannot falsely claim an attachment or invent a promotion.
    const body = requestedKind ? selected ? selected.kind === 'sticker' ? '' : photo ? `Aquí tienes la foto de ${photo.label}. ¿Qué te gustaría saber del producto?` : asset?.rows[0]?.promotion ? asset.rows[0].body : 'Aquí tienes la imagen disponible. ¿Qué te gustaría saber?' : 'Todavía no tengo una imagen aprobada para ese producto o promoción. ¿De qué producto necesitas la foto?' : input.body;
    const outbound = await queueOutbound(c, { media: selected ?? undefined, promotion: photo ? false : asset?.rows[0]?.promotion ?? false, orgId: input.orgId, conversationId: input.conversationId, body, approvedBy: `auto:${input.orgId}` });
    await c.query('UPDATE outbound_messages SET source_inbox_id=$2 WHERE id=$1', [outbound.id, input.inboxId]);
    await c.query("UPDATE agent_proposals SET status='applied', decided_by=$3, decided_at=now(), operation_key=$4 WHERE id=$1 AND org_id=$2", [input.proposalId, input.orgId, `auto:${input.orgId}`, `inbound:${input.inboxId}`]);
    await c.query('COMMIT'); return true;
  } catch (error) { await c.query('ROLLBACK'); throw error; }
  finally { c.release(); }
}
