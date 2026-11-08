import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { pool, migration } from '../src/db.js';
import { companyInput, directoryImportInput, directoryMigration, registerDirectory } from '../src/directory-wiring.js';

const record = { name: 'Test company', country: 'pe', role: 'supplier', products: ['Textiles'], hsCodes: ['61','6101','610120'], sourceUrl: 'https://example.com/company' };
test('Directory validation: provenance, HTTPS, HS lengths, authorization and batch limits', () => {
  assert.equal(companyInput.parse(record).country, 'PE');
  assert.equal(companyInput.safeParse({ ...record, sourceUrl: 'javascript:alert(1)' }).success, false);
  assert.equal(companyInput.safeParse({ ...record, sourceUrl: 'https://user:secret@example.com' }).success, false);
  assert.equal(companyInput.safeParse({ ...record, hsCodes: ['123'] }).success, false);
  assert.equal(companyInput.safeParse({ ...record, source: 'verified' }).success, false);
  assert.equal(directoryImportInput.safeParse({ authorized: false, records: [record] }).success, false);
  assert.equal(directoryImportInput.safeParse({ authorized: true, records: [] }).success, false);
  assert.equal(directoryImportInput.safeParse({ authorized: true, records: Array(101).fill(record) }).success, false);
});

test('Directory: filters, tenant isolation, provenance and idempotent import/connections', { skip: !process.env.DATABASE_URL }, async () => {
  const db = pool();
  await db.query(migration);
  await db.query(directoryMigration);
  const orgA = randomUUID(), orgB = randomUUID();
  for (const id of [orgA,orgB]) await db.query('INSERT INTO organizations VALUES($1,$2)', [id,'Directory test']);
  const app = Fastify();
  app.setErrorHandler((e,_req,reply) => reply.code(e instanceof ZodError ? 400 : 500).send({error:e instanceof Error ? e.message : 'Unknown error'}));
  app.addHook('preHandler', async (req,reply) => {
    const token = req.headers.authorization;
    if (token !== `Bearer ${orgA}` && token !== `Bearer ${orgB}`) return reply.code(401).send({error:'Unauthorized'});
    (req as unknown as {org:string}).org = token.slice(7);
  });
  registerDirectory(app,db);
  const headers = {authorization:`Bearer ${orgA}`};
  const other = {authorization:`Bearer ${orgB}`};
  try {
    assert.equal((await app.inject({url:'/directory'})).statusCode,401);
    assert.equal((await app.inject({url:'/directory/status',headers})).json().scraping.status,'awaiting_configuration');
    const created = await app.inject({method:'POST',url:'/directory',headers,payload:record});
    assert.equal(created.statusCode,201);
    const company = created.json();
    assert.equal(company.source,'manual');
    assert.equal(company.verification,'unverified');
    assert.equal((await app.inject({url:'/directory?country=PE&role=supplier&hs=61&search=Textiles',headers})).json().items.length,1);
    assert.equal((await app.inject({url:'/directory?country=CL',headers})).json().items.length,0);
    assert.equal((await app.inject({url:'/directory',headers:other})).json().items.length,0);
    assert.equal((await app.inject({method:'POST',url:`/directory/${company.id}/connect`,headers:other,payload:{purpose:'supplier'}})).statusCode,404);
    const a = await app.inject({method:'POST',url:`/directory/${company.id}/connect`,headers,payload:{purpose:'supplier',note:'Review first'}});
    const b = await app.inject({method:'POST',url:`/directory/${company.id}/connect`,headers,payload:{purpose:'supplier',note:'Do not replace'}});
    assert.equal(a.statusCode,201); assert.equal(b.statusCode,200);
    assert.equal(a.json().id,b.json().id); assert.equal(b.json().note,'Review first');
    assert.equal((await app.inject({url:'/directory/connections',headers:other})).json().items.length,0);
    const payload = {authorized:true,records:[{...record,name:'Imported test'}, {...record,name:'Imported test'}]};
    const imported = await app.inject({method:'POST',url:'/directory/import',headers,payload});
    assert.equal(imported.statusCode,200);
    assert.equal(imported.json().imported,1);
    assert.equal(imported.json().items[0].source,'imported_scraping');
    assert.equal((await app.inject({method:'POST',url:'/directory/import',headers,payload})).json().imported,0);
    assert.equal((await app.inject({method:'POST',url:'/directory/import',headers,payload:{authorized:true,records:[record,{...record,hsCodes:['123']}]}})).statusCode,400);
    assert.equal((await app.inject({url:'/directory',headers})).json().items.length,2);
  } finally {
    await app.close();
    for (const id of [orgA,orgB]) {
      await db.query('DELETE FROM directory_connections WHERE org_id=$1',[id]);
      await db.query('DELETE FROM directory_companies WHERE org_id=$1',[id]);
      await db.query('DELETE FROM organizations WHERE id=$1',[id]);
    }
    await db.end();
  }
});
