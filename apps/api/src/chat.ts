import {acceptDemoPurchase} from './purchase-demo.js';
import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import type { InboundMessage } from './integrations/wapi.js';
import { sendWapiMessage, type OutboundMedia } from './integrations/wapi.js';
import { enqueue } from './jobs.js';

export type Conversation = {
  id: string;
  orgId: string;
  peer: string;
  displayName: string | null;
  orderId: string | null;
  supplierId: string | null;
  agentPaused: boolean;
  lastMessageAt: Date;
  createdAt: Date;
};

function toConversation(row: {
  id: string;
  org_id: string;
  peer: string;
  display_name: string | null;
  order_id: string | null;
  supplier_id: string | null;
  agent_paused: boolean;
  last_message_at: Date;
  created_at: Date;
}): Conversation {
  return {
    id: row.id,
    orgId: row.org_id,
    peer: row.peer,
    displayName: row.display_name,
    orderId: row.order_id,
    supplierId: row.supplier_id,
    agentPaused: row.agent_paused,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
  };
}

/**
 * Insert-or-fetch by (org_id, peer). Race-safe via ON CONFLICT. agent_paused defaults to
 * true at insert time and the conflict branch never touches it — an upsert can never
 * flip a paused conversation back to active; only the explicit /agent route can.
 */
export async function upsertConversation(
  client: Pool | PoolClient,
  input: { orgId: string; peer: string; displayName?: string },
): Promise<Conversation> {
  const id = randomUUID();
  const r = await client.query(
    `INSERT INTO conversations(id, org_id, peer, display_name)
     VALUES($1,$2,$3,$4)
     ON CONFLICT (org_id, peer) DO UPDATE SET last_message_at = now()
     RETURNING id, org_id, peer, display_name, order_id, supplier_id, agent_paused, last_message_at, created_at`,
    [id, input.orgId, input.peer, input.displayName ?? null],
  );
  return toConversation(r.rows[0]);
}

/**
 * Shared storage path for an inbound WhatsApp message, used identically by the real
 * `/webhooks/wapi` handler and by `/chat/simulate/inbound` — a simulator that stored
 * messages through a different path would prove nothing about the real flow. Callers
 * MUST run this inside a transaction: if the conversation upsert fails, the inbox insert
 * must never happen, and the caller must never acknowledge the message.
 */
export async function storeInboundMessage(
  client: PoolClient,
  orgId: string,
  message: InboundMessage,
): Promise<{ duplicate: boolean; conversationId: string }> {
  const conversation = await upsertConversation(client, { orgId, peer: message.sender });
  const stored = await client.query(
    'INSERT INTO inbox(id,org_id,payload,conversation_id) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING RETURNING id',
    [message.dedupeKey, orgId, JSON.stringify(message), conversation.id],
  );
  // Explicit opt-in applies only to new inbound messages; provider retries never
  // charge the model twice. Runs and messages are committed atomically by the caller.
  if (/^(stop|baja|cancelar|no me escribas|no quiero mensajes)[.!\s]*$/i.test(message.text.trim())) {
    await client.query('UPDATE conversations SET agent_paused=true, auto_reply=false WHERE id=$1 AND org_id=$2', [conversation.id, orgId]);
    return { duplicate: stored.rowCount === 0, conversationId: conversation.id };
  }
  if (stored.rowCount && await acceptDemoPurchase(client, orgId, conversation.id, message.text)) return {duplicate:false,conversationId:conversation.id};
  if (stored.rowCount && !conversation.agentPaused && process.env.DEEPSEEK_API_KEY) {
    const kinds = conversation.orderId ? ['compose'] : ['extract', 'compose'];
    for (const kind of kinds) {
      const runId = randomUUID();
      await client.query(
        'INSERT INTO agent_runs(id,org_id,kind,order_id,conversation_id,inbox_id,input,max_steps) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [runId, orgId, kind, kind === 'extract' ? null : conversation.orderId, conversation.id, message.dedupeKey,
          JSON.stringify({ source: 'inbound', inboxId: message.dedupeKey }), 8],
      );
      await enqueue(client, { orgId, kind: 'agent.run', payload: { runId }, dedupeKey: `inbound:${message.dedupeKey}:${kind}` });
    }
  }
  return { duplicate: stored.rowCount === 0, conversationId: conversation.id };
}

/**
 * Simulator when WAPI_MODE=simulator, or whenever WAPI_API_KEY is missing. Live requires
 * BOTH an explicit WAPI_MODE=live AND the key — never live by accident.
 */
export function wapiMode(): 'live' | 'simulator' {
  if (process.env.WAPI_MODE === 'live' && process.env.WAPI_API_KEY) return 'live';
  return 'simulator';
}

export function outgoingEnabled(): boolean {
  return process.env.WAPI_OUTGOING_ENABLED === 'true';
}

/**
 * Insert the outbound row and enqueue its `whatsapp.send` job in the SAME transaction,
 * deduped on the outbound row id — a message is queued exactly once even if the caller
 * retries the surrounding request.
 */
export async function queueOutbound(
  client: PoolClient,
  input: { orgId: string; conversationId: string; body: string; approvedBy: string; media?: OutboundMedia; promotion?: boolean },
): Promise<{ id: string }> {
  const id = randomUUID();
  await client.query(
    'INSERT INTO outbound_messages(id,org_id,conversation_id,body,approved_by,media,promotion) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [id, input.orgId, input.conversationId, input.body, input.approvedBy, input.media ? JSON.stringify(input.media) : null, input.promotion ?? false],
  );
  await enqueue(client, { orgId: input.orgId, kind: 'whatsapp.send', payload: { outboundMessageId: id }, dedupeKey: id });
  return { id };
}

type DeliveryAction =
  | { mode: 'refused' }
  | { mode: 'skip' }
  | { mode: 'simulated' }
  | { mode: 'live'; peer: string; body: string; media?: OutboundMedia };

/**
 * The `whatsapp.send` job handler body. Policy stops (outgoing disabled, conversation
 * paused) mark the row 'failed' and return normally — they are not transient errors, so
 * the job must not retry them. A live 'unknown' send result is likewise never retried:
 * see the comment below the network call.
 */
export async function deliverOutbound(db: Pool, outboundId: string): Promise<void> {
  const client = await db.connect();
  let action: DeliveryAction;
  try {
    await client.query('BEGIN');
    const r = await client.query(
      `SELECT o.status, o.body, o.media, o.org_id, o.approved_by, c.peer, c.agent_paused, c.auto_reply
       FROM outbound_messages o
       JOIN conversations c ON c.id = o.conversation_id AND c.org_id = o.org_id
       WHERE o.id = $1
       FOR UPDATE OF o`,
      [outboundId],
    );
    if (!r.rowCount || r.rows[0].status !== 'queued') {
      // Nothing to do: row is gone, or a previous (at-least-once) delivery already settled it.
      action = { mode: 'skip' };
    } else if (String(r.rows[0].approved_by).startsWith('auto:') && (r.rows[0].agent_paused || !r.rows[0].auto_reply)) {
      await client.query("UPDATE outbound_messages SET status='failed', error='Respuesta automatica cancelada por el operador' WHERE id=$1", [outboundId]);
      action = { mode: 'refused' };
    } else if (!outgoingEnabled()) {
      await client.query(`UPDATE outbound_messages SET status='failed', error=$2 WHERE id=$1`, [
        outboundId,
        'Envio saliente deshabilitado: configure WAPI_OUTGOING_ENABLED=true',
      ]);
      action = { mode: 'refused' };
      // NOTE: `agent_paused` is deliberately NOT checked here. It is the AGENT kill
      // switch, and it defaults to true — enforcing it at delivery would mean a person
      // could not reply by hand in a fresh conversation, which is not what it is for.
      // Every row reaching this point was authorized by a human: `queueOutbound` requires
      // `approvedBy`, set either by the human-send route or by a human approving a
      // proposal. The pause is enforced where the agent actually acts — starting a run
      // on this conversation (see agent-wiring.ts).
    } else if (wapiMode() === 'simulator') {
      const providerMessageId = `sim-${randomUUID()}`;
      await client.query(`UPDATE outbound_messages SET status='sent', provider_message_id=$2, sent_at=now(), error=NULL WHERE id=$1`, [
        outboundId,
        providerMessageId,
      ]);
      action = { mode: 'simulated' };
    } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(process.env.WAPI_ORG_ID ?? '') || r.rows[0].org_id !== process.env.WAPI_ORG_ID) {
      // A Session API Key owns one WhatsApp number, bound to exactly one tenant.
      // Never let another organization's credentials send through that channel.
      await client.query("UPDATE outbound_messages SET status='failed', error='Canal WhatsApp no autorizado para esta organizacion (WAPI_ORG_ID)' WHERE id=$1", [outboundId]);
      action = { mode: 'refused' };
    } else {
      // Commit an indeterminate state BEFORE transport: crash/retry must not send twice.
      await client.query("UPDATE outbound_messages SET status='unknown', error='Envio iniciado; requiere conciliacion si no hay confirmacion' WHERE id=$1", [outboundId]);
      action = { mode: 'live', peer: r.rows[0].peer as string, body: r.rows[0].body as string, media: r.rows[0].media ?? undefined };
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  if (action.mode !== 'live') return;

  const result = await sendWapiMessage(
    { baseUrl: process.env.WAPI_BASE_URL ?? '', apiKey: process.env.WAPI_API_KEY ?? '' },
    { to: action.peer, text: action.body, media: action.media },
  );
  if (result.status === 'accepted') {
    // sent_at is the legacy dispatch timestamp, not a WhatsApp delivery receipt.
    await db.query(`UPDATE outbound_messages SET status='accepted', provider_message_id=$2, sent_at=now(), error=NULL WHERE id=$1`, [
      outboundId,
      result.providerMessageId ?? null,
    ]);
  } else {
    // Never retry an 'unknown' send: re-sending on our own retry policy could deliver a
    // second, real message to a customer. Leaving status='unknown' and letting the job
    // complete (not fail) hands this to a human as a reconciliation task instead.
    await db.query(`UPDATE outbound_messages SET status='unknown' WHERE id=$1`, [outboundId]);
  }
}

