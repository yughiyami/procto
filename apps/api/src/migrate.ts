import {pool,migration} from './db.js';
const p=pool();try{await p.query(migration);console.log('Schema ready');}finally{await p.end();}
