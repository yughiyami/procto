import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';

// URLs are provenance/contact links only: this module never fetches caller URLs.
const httpsUrl = z.url().max(2000).refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password;
}, 'Use an HTTPS URL without embedded credentials');
const country = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/);
const hs = z.string().regex(/^(?:\d{2}|\d{4}|\d{6})$/);
export const companyInput = z.object({
  name: z.string().trim().min(1).max(200), country,
  city: z.string().trim().max(200).default(''),
  role: z.enum(['buyer', 'supplier', 'both']),
  products: z.array(z.string().trim().min(1).max(200)).max(40),
  hsCodes: z.array(hs).max(40),
  website: httpsUrl.optional(), sourceUrl: httpsUrl, contactUrl: httpsUrl.optional(),
  notes: z.string().trim().max(2000).default(''),
}).strict();
export const directoryImportInput = z.object({ authorized: z.literal(true), records: z.array(companyInput).min(1).max(100) }).strict();
type CompanyInput = z.infer<typeof companyInput>;
type Row = Record<string, any>;
const toCompany = (row: Row) => ({ ...row.data, id: row.id, source: row.source, verification: 'unverified', createdAt: row.created_at });
const toConnection = (row: Row) => ({ id: row.id, companyId: row.company_id, purpose: row.purpose, note: row.note, status: 'pending', createdAt: row.created_at });
const org = (req: unknown) => (req as { org: string }).org;

export const directoryMigration = `
CREATE TABLE IF NOT EXISTS directory_companies(
  id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL, source_url text NOT NULL, data jsonb NOT NULL,
  source text NOT NULL CHECK(source IN ('manual','imported_scraping')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,name,source_url), UNIQUE(org_id,id)
);
CREATE TABLE IF NOT EXISTS directory_connections(
  id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id), company_id uuid NOT NULL,
  purpose text NOT NULL CHECK(purpose IN ('supplier','buyer')), note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(org_id,company_id) REFERENCES directory_companies(org_id,id),
  UNIQUE(org_id,company_id,purpose)
);
`;

async function insertCompany(db: Pool | PoolClient, tenant: string, data: CompanyInput, source: 'manual' | 'imported_scraping') {
  const result = await db.query(`INSERT INTO directory_companies(id,org_id,name,source_url,data,source)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(org_id,name,source_url) DO NOTHING RETURNING *`,
  [randomUUID(), tenant, data.name, data.sourceUrl, JSON.stringify(data), source]);
  if (result.rowCount) return { inserted: true, item: toCompany(result.rows[0]) };
  // Separate statement sees a concurrent writer that won the unique constraint.
  const existing = await db.query('SELECT * FROM directory_companies WHERE org_id=$1 AND name=$2 AND source_url=$3', [tenant, data.name, data.sourceUrl]);
  return { inserted: false, item: toCompany(existing.rows[0]) };
}

/** Registered after app.ts installs its organization authentication hook. */
export function registerDirectory(app: FastifyInstance, db: Pool) {
  app.get('/directory/status', async () => ({ scraping: { status: 'awaiting_configuration' }, tradeMap: { status: 'restricted_access' } }));
  app.get('/directory', async req => {
    const q = z.object({ search: z.string().trim().max(200).optional(), country: country.optional(), role: z.enum(['buyer','supplier','both']).optional(), hs: hs.optional() }).strict().parse(req.query);
    const result = await db.query(`SELECT * FROM directory_companies WHERE org_id=$1
      AND ($2::text IS NULL OR strpos(lower(data::text),lower($2))>0)
      AND ($3::text IS NULL OR data->>'country'=$3)
      AND ($4::text IS NULL OR data->>'role'=$4 OR data->>'role'='both')
      AND ($5::text IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(data->'hsCodes') AS code WHERE code LIKE $5||'%'))
      ORDER BY created_at DESC,id LIMIT 1000`, [org(req), q.search ?? null, q.country ?? null, q.role ?? null, q.hs ?? null]);
    return { items: result.rows.map(toCompany) };
  });
  app.post('/directory', async (req, reply) => {
    const result = await insertCompany(db, org(req), companyInput.parse(req.body), 'manual');
    return reply.code(result.inserted ? 201 : 200).send(result.item);
  });
  app.post('/directory/import', async (req, reply) => {
    // authorized is the importer's declaration, not a verified permission/license.
    const body = directoryImportInput.parse(req.body);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      // Serialize overlapping imports per tenant, avoiding opposite-order batch deadlocks.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['directory-import:' + org(req)]);
      const results = [];
      for (const record of body.records) results.push(await insertCompany(client, org(req), record, 'imported_scraping'));
      await client.query('COMMIT');
      return reply.code(200).send({ imported: results.filter(r => r.inserted).length, items: results.map(r => r.item) });
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  });
  app.get('/directory/connections', async req => ({ items: (await db.query('SELECT * FROM directory_connections WHERE org_id=$1 ORDER BY created_at DESC,id LIMIT 1000', [org(req)])).rows.map(toConnection) }));
  app.post<{ Params: { id: string } }>('/directory/:id/connect', async (req, reply) => {
    const id = z.uuid().parse(req.params.id);
    const body = z.object({ purpose: z.enum(['supplier','buyer']), note: z.string().trim().max(2000).default('') }).strict().parse(req.body);
    const tenant = org(req);
    const company = await db.query('SELECT id FROM directory_companies WHERE id=$1 AND org_id=$2', [id, tenant]);
    if (!company.rowCount) return reply.code(404).send({ error: 'Company not found' });
    const inserted = await db.query(`INSERT INTO directory_connections(id,org_id,company_id,purpose,note) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(org_id,company_id,purpose) DO NOTHING RETURNING *`, [randomUUID(),tenant,id,body.purpose,body.note]);
    const row = inserted.rowCount ? inserted.rows[0] : (await db.query('SELECT * FROM directory_connections WHERE org_id=$1 AND company_id=$2 AND purpose=$3', [tenant,id,body.purpose])).rows[0];
    return reply.code(inserted.rowCount ? 201 : 200).send(toConnection(row));
  });
}
