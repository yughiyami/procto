import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

export const profileInput = z.object({
  name: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(200),
  activity: z.enum(['seller', 'coordinator', 'both']),
  products: z.array(z.string().trim().min(1).max(200)).min(1).max(40),
}).strict();

export const profileMigration = `
CREATE TABLE IF NOT EXISTS business_profiles(
  org_id uuid PRIMARY KEY REFERENCES organizations(id),
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

/** Profile belongs to the authenticated organization; this is not account registration. */
export function registerProfile(app: FastifyInstance, db: Pool) {
  app.get('/profile', async (req, reply) => {
    const org = (req as unknown as { org: string }).org;
    const result = await db.query(`SELECT o.name,p.data,p.updated_at FROM organizations o
      LEFT JOIN business_profiles p ON p.org_id=o.id WHERE o.id=$1`, [org]);
    if (!result.rowCount) return reply.code(404).send({ error: 'Organization not found' });
    const row = result.rows[0];
    return row.data ? { ...row.data, completed: true, updatedAt: row.updated_at }
      : { name: row.name, city: '', activity: 'seller', products: [], completed: false, updatedAt: null };
  });
  app.post('/profile', async (req, reply) => {
    const data = profileInput.parse(req.body);
    const org = (req as unknown as { org: string }).org;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query('UPDATE organizations SET name=$2 WHERE id=$1 RETURNING id', [org, data.name]);
      if (!updated.rowCount) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Organization not found' });
      }
      const result = await client.query(`INSERT INTO business_profiles(org_id,data) VALUES($1,$2)
        ON CONFLICT(org_id) DO UPDATE SET data=EXCLUDED.data,updated_at=now() RETURNING updated_at`, [org, JSON.stringify(data)]);
      await client.query('COMMIT');
      return { ...data, completed: true, updatedAt: result.rows[0].updated_at };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });
}
