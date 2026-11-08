import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {pool} from './db.js';
// pnpm forwards a literal `--` separator through workspace scripts; drop it so
// both `npm run admin:create -- "Name"` and the pnpm root script behave alike.
const name=process.argv.slice(2).find(a=>a!=='--');if(!name)throw new Error('Usage: npm run admin:create -- organization-name');const p=pool();const c=await p.connect();try{await c.query('BEGIN');const id=randomUUID();const token=randomBytes(32).toString('hex');await c.query('INSERT INTO organizations VALUES($1,$2)',[id,name]);await c.query('INSERT INTO credentials VALUES($1,$2)',[createHash('sha256').update(token).digest('hex'),id]);await c.query('COMMIT');console.log('Organization:',id);console.log('Store this token privately (displayed only here):',token);}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await p.end();}
