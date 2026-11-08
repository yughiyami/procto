import type { FastifyInstance } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { mediaSchema, serviceUrl } from './integrations/wapi.js';

export const photoMigration = `CREATE TABLE IF NOT EXISTS product_photos(id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, label text NOT NULL, url text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,url));`;
const label = z.string().trim().min(1).max(120);
const photoInput = z.object({ label, url: mediaSchema.shape.url, confirmPublic: z.literal(true) }).strict();
const uploadInput = z.object({ label, base64: z.string().min(4).max(2796204), mimetype: z.enum(['image/png','image/jpeg','image/webp']), confirmPublic: z.literal(true) }).strict();
export function validatePhotoBytes(base64: string, mime: string): boolean {
  if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return false;
  const bytes = Buffer.from(base64,'base64');
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) return false;
  return mime === 'image/png' ? bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')) : mime === 'image/jpeg' ? bytes.subarray(0,3).equals(Buffer.from('ffd8ff','hex')) : mime === 'image/webp' && bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
}
export function registerProductPhotos(app: FastifyInstance, db: Pool, fetchImpl: typeof fetch = fetch) {
  const save = async (org: string, name: string, url: string) => (await db.query('INSERT INTO product_photos(id,org_id,label,url) VALUES($1,$2,$3,$4) ON CONFLICT(org_id,url) DO UPDATE SET label=EXCLUDED.label RETURNING id,label,url,created_at AS "createdAt"',[randomUUID(),org,name,url])).rows[0];
  app.get('/chat/photos', async req => ({items:(await db.query('SELECT id,label,url,created_at AS "createdAt" FROM product_photos WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100',[(req as unknown as {org:string}).org])).rows}));
  app.post('/chat/photos',async req => {const body=photoInput.parse(req.body);return save((req as unknown as {org:string}).org,body.label,body.url);});
  app.post('/chat/photos/upload',{bodyLimit:3*1024*1024},async (req,reply) => {
    const org=(req as unknown as {org:string}).org;
    const body=uploadInput.parse(req.body);
    if (!validatePhotoBytes(body.base64,body.mimetype)) return reply.code(400).send({error:'Imagen inválida. Usa PNG, JPEG o WebP de hasta 2 MB.'});
    if (process.env.WAPI_MODE !== 'live' || !process.env.WAPI_API_KEY || org !== process.env.WAPI_ORG_ID) return reply.code(409).send({error:'La carga requiere el canal Wapi real de esta organización; puedes aprobar una URL pública.'});
    try {
      const response=await fetchImpl(serviceUrl(process.env.WAPI_BASE_URL ?? '', 'api/upload'),{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${process.env.WAPI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({base64:body.base64,mimetype:body.mimetype})});
      if (!response.ok) throw new Error('upload');
      const result=z.object({success:z.literal(true),publicUrl:mediaSchema.shape.url}).parse(await response.json());
      return save(org,body.label,result.publicUrl);
    } catch { return reply.code(502).send({error:'No se pudo verificar la carga en Wapi. No se envió ningún mensaje.'}); }
  });
  app.delete<{Params:{id:string}}>('/chat/photos/:id',async req => {z.uuid().parse(req.params.id);await db.query('DELETE FROM product_photos WHERE id=$1 AND org_id=$2',[req.params.id,(req as unknown as {org:string}).org]);return {revoked:true};});
}
const normalized = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
/** No cross-product guess: multiple unmatched photos require the customer's choice. */
export async function selectProductPhoto(db: Pool | PoolClient, org: string, text: string) {
  const rows=(await db.query('SELECT id,label,url FROM product_photos WHERE org_id=$1 ORDER BY created_at DESC LIMIT 100',[org])).rows as {id:string;label:string;url:string}[];
  const tokens=normalized(text).split(/\W+/).filter(t=>t.length>3);
  const matches=rows.filter(row=>tokens.some(t=>normalized(row.label).split(/\W+/).includes(t)));
  return matches.length===1 ? matches[0] : rows.length===1 ? rows[0] : null;
}
