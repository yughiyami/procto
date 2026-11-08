import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import { acceptPitchRun, createPitchRun, pitchAcceptance, type PitchRun } from './pitch-demo.js';

export const pitchDemoMigration = `
CREATE TABLE IF NOT EXISTS pitch_demo_runs (
 id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pitch_demo_runs_org ON pitch_demo_runs(org_id, created_at DESC);
`;
const tenant = (req: unknown) => (req as { org: string }).org;
export function registerPitchDemo(app: FastifyInstance, db: Pool) {
  app.get('/pitch-demo/runs', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { items: (await db.query('SELECT data FROM pitch_demo_runs WHERE org_id=$1 ORDER BY created_at DESC,id DESC LIMIT 30', [tenant(req)])).rows.map(r => r.data) };
  });
  app.post('/pitch-demo/runs', async (req, reply) => {
    const run = createPitchRun(req.body);
    await db.query('INSERT INTO pitch_demo_runs(id,org_id,data) VALUES($1,$2,$3)', [run.id, tenant(req), JSON.stringify(run)]);
    return reply.code(201).send(run);
  });
  app.get<{ Params: { id: string } }>('/pitch-demo/runs/:id', async (req, reply) => {
    const id = z.uuid().parse(req.params.id);
    reply.header('Cache-Control', 'no-store');
    const found = await db.query('SELECT data FROM pitch_demo_runs WHERE id=$1 AND org_id=$2', [id, tenant(req)]);
    return found.rowCount ? found.rows[0].data : reply.code(404).send({ error: 'Demo not found' });
  });
  app.post<{ Params: { id: string } }>('/pitch-demo/runs/:id/accept', async (req, reply) => {
    const id = z.uuid().parse(req.params.id);
    const input = pitchAcceptance.parse(req.body);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      // The row lock serializes concurrent acceptance, regardless of retry key.
      const found = await client.query('SELECT data FROM pitch_demo_runs WHERE id=$1 AND org_id=$2 FOR UPDATE', [id, tenant(req)]);
      if (!found.rowCount) { await client.query('ROLLBACK'); return reply.code(404).send({ error: 'Demo not found' }); }
      const current = found.rows[0].data as PitchRun;
      const result = acceptPitchRun(current, input);
      if (current.status !== 'completed') await client.query('UPDATE pitch_demo_runs SET data=$3 WHERE id=$1 AND org_id=$2', [id, tenant(req), JSON.stringify(result)]);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });
}
