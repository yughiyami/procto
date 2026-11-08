import {pool} from './db.js';
import {buildApp} from './app.js';
const db=pool();const app=buildApp(db);
await app.listen({port:Number(process.env.PORT??3017),host:process.env.HOST??'127.0.0.1'});
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,async()=>{await app.close();await db.end();process.exit(0);});
