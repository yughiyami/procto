import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { seedDemo } from './seed-demo.js';

// These credentials never enter the ordinary credentials table. Expired sessions
// remain recognizable after restart and cannot acquire normal tenant privileges.
export const demoEnabled = () => process.env.DEMO_ACCESS_ENABLED === 'true';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const ttl = 2 * 60 * 60 * 1000;

const reads = new Set(['/pitch-demo/runs', '/pitch-demo/runs/:id', '/integrations/status', '/blockchain/demo', '/inbox', '/drafts', '/chat/conversations', '/chat/conversations/:id', '/agents/runs', '/agents/runs/:id', '/agents/proposals', '/demo/session', '/orders', '/orders/:id', '/orders/:id/feasibility', '/orders/:id/finance', '/orders/:id/evidence', '/suppliers', '/directory', '/directory/status', '/directory/connections', '/opportunities', '/profile']);
const writes = new Set(['/pitch-demo/runs', '/pitch-demo/runs/:id/accept', '/orders', '/orders/:id/contributions', '/orders/:id/quote', '/orders/:id/accept', '/orders/:id/deliveries', '/orders/:id/movements', '/orders/:id/cancel', '/suppliers', '/directory', '/directory/:id/connect', '/opportunities', '/opportunities/:id/status', '/profile', '/demo/seed']);
// Contact creation only stores a tenant-scoped, paused conversation. Sending and
// agent activation remain excluded; registering a number is not send consent.
writes.add('/chat/conversations');
export function demoRouteAllowed(method: string, route: string) {
  return (method === 'GET' && reads.has(route)) || (method === 'POST' && writes.has(route));
}

/** Per-process windows complement durable session issuance caps. Keys are only
 * authenticated demo organizations, never attacker-controlled arbitrary tokens. */
export function createDemoRateLimiter(clock = Date.now) {
  const windows = new Map<string, { total: number; writes: number; until: number }>();
  return (organizationId: string, method: string): number | null => {
    const now = clock();
    for (const [key, window] of windows) if (window.until <= now) windows.delete(key);
    const prior = windows.get(organizationId);
    if (!prior && windows.size >= 1000) return 60;
    const window = prior ?? { total: 0, writes: 0, until: now + 60_000 };
    const isWrite = method !== 'GET';
    if (window.total >= 120 || (isWrite && window.writes >= 30)) return Math.max(1, Math.ceil((window.until - now) / 1000));
    window.total++; if (isWrite) window.writes++;
    windows.set(organizationId, window);
    return null;
  };
}

export async function authenticateDemo(db: Pool, token: string) {
  if (!demoEnabled() || !/^demo_[a-f0-9]{64}$/.test(token)) return null;
  const result = await db.query('SELECT org_id,expires_at FROM demo_sessions WHERE token_hash=$1 AND ready=true AND expires_at>now()', [digest(token)]);
  return result.rows[0] ?? null;
}

export function registerDemoSessions(app: FastifyInstance, db: Pool) {
  const attempts = new Map<string, { count: number; until: number }>();
  app.post('/demo/session', { bodyLimit: 1024 }, async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!demoEnabled()) return reply.code(403).send({ error: 'Demo access is disabled' });
    if (!z.object({}).strict().safeParse(req.body ?? {}).success) return reply.code(400).send({ error: 'Demo sessions accept no credentials or organization ID' });
    const now = Date.now();
    for (const [ip, value] of attempts) if (value.until <= now) attempts.delete(ip);
    // Fastify does not trust arbitrary forwarded IP headers by default. Behind
    // a tunnel the cap is intentionally shared until a trusted proxy is set up.
    const prior = attempts.get(req.ip) ?? { count: 0, until: now + 15 * 60 * 1000 };
    if (prior.count >= 5 || (!attempts.has(req.ip) && attempts.size >= 1000)) return reply.header('Retry-After', '900').code(429).send({ error: 'Demo session limit reached; retry later' });
    prior.count++; attempts.set(req.ip, prior);
    const token = `demo_${randomBytes(32).toString('hex')}`;
    const organizationId = randomUUID(), expiresAt = new Date(now + ttl).toISOString();
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('demo-session-issuance',0))");
      const counts = (await client.query('SELECT count(*) AS total,count(*) FILTER (WHERE expires_at>now()) AS active FROM demo_sessions')).rows[0];
      if (Number(counts.total) >= 1000 || Number(counts.active) >= 100) {
        await client.query('ROLLBACK');
        return reply.header('Retry-After', '900').code(429).send({ error: 'Demo capacity reached; contact the administrator' });
      }
      await client.query('INSERT INTO organizations(id,name) VALUES($1,$2)', [organizationId, 'DEMO — negocio ficticio']);
      await client.query('INSERT INTO demo_sessions(token_hash,org_id,expires_at) VALUES($1,$2,$3)', [digest(token), organizationId, expiresAt]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    // A failed seed leaves an unready credential, never a usable empty session.
    await seedDemo(db, organizationId, true);
    await db.query('UPDATE demo_sessions SET ready=true WHERE token_hash=$1', [digest(token)]);
    return reply.code(201).send({ token, expiresAt, organizationId, demo: true });
  });
  app.get('/demo/session', async (req: FastifyRequest, reply) => {
    reply.header('Cache-Control', 'no-store');
    const session = (req as unknown as { demoSession?: { org_id: string; expires_at: Date } }).demoSession;
    if (!session) return reply.code(403).send({ error: 'This is not a demo session' });
    return { organizationId: session.org_id, expiresAt: session.expires_at, demo: true };
  });
}
