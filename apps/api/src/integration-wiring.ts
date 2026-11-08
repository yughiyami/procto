import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { normalizeWapiInbound, verifyWapiSignature } from './integrations/wapi.js';
import { extractRequest } from './integrations/deepseek.js';
import { prepareMinkalyTransaction, readMinkalyDeal, type MinkalyConfig } from './integrations/minkaly.js';
import { storeInboundMessage, wapiMode, outgoingEnabled } from './chat.js';
import { readLocalDemo } from './integrations/local-demo.js';

const tenant = (req: unknown) => (req as { org: string }).org;
const minkalyConfig = (): MinkalyConfig => ({ chainId: Number(process.env.MINKALY_CHAIN_ID ?? '11155111'), contractAddress: process.env.MINKALY_CONTRACT_ADDRESS ?? '', rpcUrl: process.env.MINKALY_RPC_URL, demoEnabled: process.env.MINKALY_DEMO_ENABLED === 'true' });

/** Parent authentication hook supplies req.org. Webhook authenticates via HMAC and fixed session binding. */
export function registerIntegrations(app: FastifyInstance, db: Pool): void {
  app.get('/blockchain/demo', async () => readLocalDemo(minkalyConfig()));
  app.get('/integrations/status', async () => ({
    wapi: {
      configured: Boolean(process.env.WAPI_BASE_URL && process.env.WAPI_API_KEY && process.env.WAPI_WEBHOOK_SECRET && process.env.WAPI_ORG_ID && process.env.WAPI_SESSION_ID),
      connected: 'not_verified',
      transport: 'unofficial',
      mode: wapiMode(),
      outgoingEnabled: outgoingEnabled(),
      simulated: wapiMode() === 'simulator',
    },
    deepseek: { configured: Boolean(process.env.DEEPSEEK_API_KEY), connected: 'not_verified', model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash' },
    blockchain: { configured: Boolean(process.env.MINKALY_CONTRACT_ADDRESS), connected: 'not_verified', chainId: Number(process.env.MINKALY_CHAIN_ID ?? '11155111'), signingEnabled: false, evidenceAnchoring: false },
  }));

  // Scoped parser preserves exact signed bytes without changing JSON handling on other routes.
  app.register(async scope => {
    scope.removeContentTypeParser('application/json');
    scope.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 256 * 1024 }, (_req, body, done) => done(null, body));
    scope.post('/webhooks/wapi', async (req, reply) => {
      const secret = process.env.WAPI_WEBHOOK_SECRET;
      const org = z.uuid().safeParse(process.env.WAPI_ORG_ID);
      const sessionId = Number(process.env.WAPI_SESSION_ID);
      if (!secret || !org.success || !Number.isSafeInteger(sessionId) || sessionId <= 0) return reply.code(503).send({ error: 'Webhook integration is not configured' });
      const signature = req.headers['x-webhook-signature'];
      if (!Buffer.isBuffer(req.body) || typeof signature !== 'string' || !verifyWapiSignature(req.body, signature, secret)) return reply.code(401).send({ error: 'Invalid signature' });
      let payload: unknown;
      try { payload = JSON.parse(req.body.toString('utf8')); } catch { return reply.code(400).send({ error: 'Invalid JSON' }); }
      const envelope = z.object({ sessionId: z.literal(sessionId), event: z.string() }).safeParse(payload);
      if (!envelope.success) return reply.code(403).send({ error: 'Session mismatch or invalid envelope' });
      const exists = await db.query('SELECT id FROM organizations WHERE id=$1', [org.data]);
      if (!exists.rowCount) return reply.code(503).send({ error: 'Webhook organization is not provisioned' });
      const message = normalizeWapiInbound(payload);
      if (!message) return { received: true, ignored: true };
      // Conversation upsert and inbox insert happen atomically: if the upsert fails, the
      // whole thing fails and we never acknowledge a message we did not fully store.
      // Conflict on the inbox row is success for provider retries (ON CONFLICT DO NOTHING).
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        const stored = await storeInboundMessage(client, org.data, message);
        await client.query('COMMIT');
        return { received: true, duplicate: stored.duplicate };
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    });
  });

  app.get('/inbox', async req => (await db.query('SELECT id,payload,status,created_at FROM inbox WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100', [tenant(req)])).rows);
  app.get('/drafts', async req => (await db.query('SELECT id,inbox_id,data,created_at FROM drafts WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100', [tenant(req)])).rows);

  app.post<{ Params: { id: string } }>('/inbox/:id/extract', async (req, reply) => {
    const id = z.string().regex(/^[a-f0-9]{64}$/).parse(req.params.id);
    if (!process.env.DEEPSEEK_API_KEY) return reply.code(503).send({ error: 'DeepSeek is not configured; manual order entry remains available' });
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      // NOWAIT avoids charging concurrent requests twice or tying up waiting DB connections.
      const inbox = await client.query('SELECT payload,status FROM inbox WHERE id=$1 AND org_id=$2 FOR UPDATE NOWAIT', [id, tenant(req)]);
      if (!inbox.rowCount) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'Inbox item not found' }); }
      const existing = await client.query('SELECT id,data FROM drafts WHERE inbox_id=$1 AND org_id=$2', [id, tenant(req)]);
      if (existing.rowCount) { await client.query('COMMIT'); return existing.rows[0]; }
      const source = z.object({ text: z.string() }).parse(inbox.rows[0].payload);
      const draft = await extractRequest({ apiKey: process.env.DEEPSEEK_API_KEY, baseUrl: process.env.DEEPSEEK_BASE_URL, model: process.env.DEEPSEEK_MODEL }, source.text);
      const draftId = randomUUID();
      await client.query('INSERT INTO drafts(id,org_id,inbox_id,data) VALUES($1,$2,$3,$4)', [draftId, tenant(req), id, JSON.stringify(draft)]);
      await client.query("UPDATE inbox SET status='extracted' WHERE id=$1 AND org_id=$2", [id, tenant(req)]);
      await client.query('COMMIT');
      return { id: draftId, data: draft };
    } catch (error) {
      await client.query('ROLLBACK');
      if ((error as { code?: string }).code === '55P03') return reply.code(409).send({ error: 'Extraction already in progress' });
      // Transaction rollback leaves the inbox pending. Never persist fabricated fallback output.
      req.log.warn('Draft extraction failed; inbox remains retryable');
      return reply.code(502).send({ error: 'Extraction failed; item remains retryable', requiresHumanConfirmation: true });
    } finally { client.release(); }
  });

  const hash = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
  const actionSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('retain'), orderHash: hash, seller: z.string(), amountBaseUnits: z.string(), releaseAt: z.number().int() }).strict(),
    z.object({ action: z.enum(['release', 'claim', 'settleExpiredClaim']), orderHash: hash }).strict(),
  ]);
  app.post('/blockchain/prepare', async (req, reply) => {
    const input = actionSchema.parse(req.body);
    if (!process.env.MINKALY_CONTRACT_ADDRESS) return reply.code(503).send({ error: 'Minkaly contract is not configured' });
    try { return prepareMinkalyTransaction(minkalyConfig(), input); }
    catch { return reply.code(400).send({ error: 'Invalid testnet transaction parameters' }); }
  });
  app.get<{ Params: { orderHash: string } }>('/blockchain/deals/:orderHash', async (req, reply) => {
    const orderHash = hash.parse(req.params.orderHash);
    if (!process.env.MINKALY_CONTRACT_ADDRESS || !process.env.MINKALY_RPC_URL) return reply.code(503).send({ error: 'Minkaly read-only RPC is not configured' });
    try { return await readMinkalyDeal(minkalyConfig(), orderHash); }
    catch { return reply.code(502).send({ error: 'Unable to verify configured test-chain contract state' }); }
  });
}
