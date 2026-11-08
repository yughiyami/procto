import {registerProductPhotos} from './product-photos.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DomainError } from './domain.js';
import { normalizeWapiInbound, mediaSchema, type OutboundMedia } from './integrations/wapi.js';
import { storeInboundMessage, queueOutbound, upsertConversation, wapiMode, outgoingEnabled } from './chat.js';

const tenant = (req: unknown) => (req as { org: string }).org;
// Duplicated from app.ts (not exported there) rather than imported, so this module never
// pulls in app.ts's own import graph (which includes agent-wiring.ts).
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Local equivalent of app.ts's `mutation()` helper (not exported from app.ts, so it is
 * reproduced here against the same `operations` table and the same advisory-lock +
 * fingerprint scheme) — approving/sending twice with the same Idempotency-Key is a no-op.
 */
async function mutation(db: Pool, req: FastifyRequest, orgId: string, fn: (c: PoolClient) => Promise<unknown>): Promise<unknown> {
  const key = z.string().min(8).max(128).parse(req.headers['idempotency-key']);
  const fingerprint = hash(req.method + req.url + JSON.stringify(req.body ?? null));
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${orgId}:${key}`]);
    const prior = await c.query('SELECT fingerprint,response FROM operations WHERE org_id=$1 AND key=$2', [orgId, key]);
    if (prior.rowCount) {
      if (prior.rows[0].fingerprint !== fingerprint) throw new DomainError('Idempotency key reused with different request');
      await c.query('COMMIT');
      return prior.rows[0].response;
    }
    const result = await fn(c);
    await c.query('INSERT INTO operations VALUES($1,$2,$3,$4)', [orgId, key, fingerprint, JSON.stringify(result)]);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

async function loadConversation(db: Pool, id: string, orgId: string) {
  z.uuid().parse(id);
  const r = await db.query(
    'SELECT id, org_id, peer, display_name, order_id, supplier_id, agent_paused, last_message_at FROM conversations WHERE id=$1 AND org_id=$2',
    [id, orgId],
  );
  if (!r.rowCount) throw new DomainError('Conversation not found');
  return r.rows[0] as {
    id: string;
    org_id: string;
    peer: string;
    display_name: string | null;
    order_id: string | null;
    supplier_id: string | null;
    agent_paused: boolean;
    last_message_at: Date;
  };
}

type ChatMessage = { id: string; direction: 'in' | 'out'; body: string; at: string; status?: string; simulated: boolean; media: OutboundMedia | null; promotion: boolean };

export function registerChat(app: FastifyInstance, db: Pool): void {
  registerProductPhotos(app, db);
  // Creating a contact never sends a message or enables PACO. Explicit E.164 avoids
  // silently choosing a country, and the existing tenant/peer uniqueness handles retries.
  app.post('/chat/conversations', async (req, reply) => {
    const body = z.object({
      phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Incluye + y código de país, sin espacios'),
      displayName: z.string().trim().min(1).max(120).optional(),
    }).strict().parse(req.body);
    const conversation = await upsertConversation(db, {
      orgId: tenant(req), peer: `${body.phone.slice(1)}@s.whatsapp.net`, displayName: body.displayName,
    });
    return reply.code(200).send({ id: conversation.id, peer: conversation.peer, displayName: conversation.displayName });
  });

  app.get('/chat/conversations', async req => {
    const orgId = tenant(req);
    const r = await db.query(
      `SELECT c.id, c.peer, c.display_name, c.order_id, c.supplier_id, c.agent_paused, c.auto_reply, c.last_message_at,
              (SELECT i.payload->>'text' FROM inbox i WHERE i.conversation_id = c.id ORDER BY i.created_at DESC LIMIT 1) AS last_inbound_text,
              (SELECT i.created_at FROM inbox i WHERE i.conversation_id = c.id ORDER BY i.created_at DESC LIMIT 1) AS last_inbound_at,
              (SELECT o.body FROM outbound_messages o WHERE o.conversation_id = c.id ORDER BY o.created_at DESC LIMIT 1) AS last_outbound_body,
              (SELECT o.created_at FROM outbound_messages o WHERE o.conversation_id = c.id ORDER BY o.created_at DESC LIMIT 1) AS last_outbound_at,
              (SELECT count(*)::int FROM inbox i WHERE i.conversation_id = c.id
                 AND i.created_at > COALESCE((SELECT max(o2.created_at) FROM outbound_messages o2 WHERE o2.conversation_id = c.id), '-infinity')
              ) AS unread_count
       FROM conversations c
       WHERE c.org_id = $1
       ORDER BY c.last_message_at DESC
       LIMIT 100`,
      [orgId],
    );
    return r.rows.map(row => {
      const inboundAt: Date | null = row.last_inbound_at;
      const outboundAt: Date | null = row.last_outbound_at;
      const lastIsInbound = inboundAt && (!outboundAt || inboundAt > outboundAt);
      return {
        id: row.id,
        peer: row.peer,
        displayName: row.display_name,
        orderId: row.order_id,
        supplierId: row.supplier_id,
        agentPaused: row.agent_paused,
        autoReply: row.auto_reply,
        lastMessageAt: row.last_message_at,
        preview: lastIsInbound ? row.last_inbound_text : row.last_outbound_body,
        unreadCount: row.unread_count,
      };
    });
  });

  app.get<{ Params: { id: string } }>('/chat/conversations/:id', async req => {
    const orgId = tenant(req);
    await loadConversation(db, req.params.id, orgId);
    const r = await db.query(
      `SELECT id, direction, body, at, status, provider_message_id, media, promotion FROM (
         SELECT i.id AS id, 'in' AS direction, i.payload->>'text' AS body, i.created_at AS at, NULL::text AS status, NULL::text AS provider_message_id, NULL::jsonb AS media, false AS promotion
         FROM inbox i WHERE i.conversation_id = $1 AND i.org_id = $2
         UNION ALL
         SELECT o.id::text AS id, 'out' AS direction, o.body AS body, COALESCE(o.sent_at, o.created_at) AS at, o.status AS status, o.provider_message_id AS provider_message_id, o.media, o.promotion
         FROM outbound_messages o WHERE o.conversation_id = $1 AND o.org_id = $2
       ) merged
       ORDER BY at
       LIMIT 200`,
      [req.params.id, orgId],
    );
    return r.rows.map((row): ChatMessage => ({
      id: row.id,
      direction: row.direction,
      body: row.body ?? '',
      at: new Date(row.at).toISOString(),
      status: row.status ?? undefined,
      media: row.media ?? null, promotion: row.promotion ?? false,
      simulated: typeof row.provider_message_id === 'string' && row.provider_message_id.startsWith('sim-'),
    }));
  });

  app.post<{ Params: { id: string } }>('/chat/conversations/:id/messages', async (req, reply) => {
    const orgId = tenant(req);
    if (!outgoingEnabled()) return reply.code(409).send({ error: 'Envio saliente deshabilitado: configure WAPI_OUTGOING_ENABLED=true' });
    const body = z.object({ body: z.string().trim().max(4000).default(''), media: mediaSchema.optional(), promotion: z.boolean().default(false), confirmPromotionConsent: z.literal(true).optional() }).strict().refine(v => !!v.body || !!v.media, 'Escribe un mensaje o agrega multimedia').refine(v => !v.promotion || v.confirmPromotionConsent === true, 'Confirma el consentimiento para promociones').parse(req.body);
    const result = await mutation(db, req, orgId, async c => {
      const conversation = await loadConversation(db, req.params.id, orgId);
      const queued = await queueOutbound(c, { orgId, conversationId: conversation.id, body: body.body, media: body.media, promotion: body.promotion, approvedBy: `human:${orgId}` });
      const row = await c.query('SELECT id, conversation_id, body, status, created_at FROM outbound_messages WHERE id=$1', [queued.id]);
      // camelCase on the wire, matching @izumi/contracts. Columns are snake_case.
      const m = row.rows[0];
      return { id: m.id, conversationId: m.conversation_id, body: m.body, status: m.status, createdAt: m.created_at };
    });
    return reply.code(201).send(result);
  });

  app.post<{ Params: { id: string } }>('/chat/conversations/:id/link', async req => {
    const orgId = tenant(req);
    const body = z.object({ orderId: z.uuid().nullable().optional(), supplierId: z.uuid().nullable().optional() }).strict().parse(req.body);
    await loadConversation(db, req.params.id, orgId);
    if (body.orderId) {
      const r = await db.query('SELECT id FROM orders WHERE id=$1 AND org_id=$2', [body.orderId, orgId]);
      if (!r.rowCount) throw new DomainError('Order not found');
    }
    if (body.supplierId) {
      const r = await db.query('SELECT id FROM suppliers WHERE id=$1 AND org_id=$2', [body.supplierId, orgId]);
      if (!r.rowCount) throw new DomainError('Supplier not found');
    }
    const r = await db.query(
      `UPDATE conversations SET
         order_id = CASE WHEN $2::boolean THEN $3::uuid ELSE order_id END,
         supplier_id = CASE WHEN $4::boolean THEN $5::uuid ELSE supplier_id END
       WHERE id=$1 AND org_id=$6
       RETURNING id, order_id, supplier_id`,
      [req.params.id, 'orderId' in body, body.orderId ?? null, 'supplierId' in body, body.supplierId ?? null, orgId],
    );
    const c = r.rows[0];
    return { id: c.id, orderId: c.order_id, supplierId: c.supplier_id };
  });

  app.post<{ Params: { id: string } }>('/chat/conversations/:id/agent', async req => {
    const orgId = tenant(req);
    const body = z.object({ paused: z.boolean(), autoReply: z.boolean().optional() }).strict().parse(req.body);
    await loadConversation(db, req.params.id, orgId);
    const r = await db.query('UPDATE conversations SET agent_paused=$1, auto_reply=COALESCE($4,auto_reply) WHERE id=$2 AND org_id=$3 RETURNING id, agent_paused, auto_reply', [
      body.paused,
      req.params.id,
      orgId, body.autoReply ?? null,
    ]);
    const c = r.rows[0];
    return { id: c.id, agentPaused: c.agent_paused, autoReply: c.auto_reply };
  });

  app.post('/chat/simulate/inbound', async (req, reply) => {
    if (wapiMode() !== 'simulator') return reply.code(409).send({ error: 'El simulador solo esta disponible en modo simulator' });
    const orgId = tenant(req);
    const body = z
      .object({ peer: z.string().regex(/^\d+(?::\d+)?@(s\.whatsapp\.net|lid)$/), text: z.string().trim().min(1).max(4000) })
      .strict()
      .parse(req.body);
    // Deterministic synthetic message id: identical (peer, text) pairs dedupe the same
    // way a real provider retry would, without needing a client-supplied idempotency key.
    const syntheticId = createHash('sha256').update(`${body.peer}:${body.text}`).digest('hex');
    const payload = {
      event: 'messages.received',
      sessionId: 1,
      data: { key: { id: syntheticId, remoteJid: body.peer, fromMe: false }, message: { conversation: body.text } },
    };
    const message = normalizeWapiInbound(payload);
    if (!message) return reply.code(400).send({ error: 'No se pudo normalizar el mensaje simulado' });
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const stored = await storeInboundMessage(client, orgId, message);
      await client.query('COMMIT');
      return reply.code(201).send({ received: true, duplicate: stored.duplicate, conversationId: stored.conversationId });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
}
