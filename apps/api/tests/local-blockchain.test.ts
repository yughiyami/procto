import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalMinkaly, prepareMinkalyTransaction } from '../src/integrations/minkaly.js';
import { readLocalDemo, localDemoManifestPath } from '../src/integrations/local-demo.js';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const config = {chainId:31337,contractAddress:'0x1111111111111111111111111111111111111111',rpcUrl:'http://127.0.0.1:8547',demoEnabled:true};
test('local blockchain accepts only explicit fixed loopback DEMO and remains unsigned',()=>{
 assert.equal(isLocalMinkaly(config),true);
 for (const overrides of [{demoEnabled:false},{chainId:1},{rpcUrl:'https://example.org'},{rpcUrl:'http://localhost:8547'},{rpcUrl:'http://127.0.0.1:8547@evil.com'},{rpcUrl:'http://127.0.0.1:8547/private'},{rpcUrl:'http://127.0.0.1:8547?x=1'}]) {
   assert.equal(isLocalMinkaly({...config,...overrides}),false);
   assert.throws(()=>prepareMinkalyTransaction({...config,...overrides},{action:'claim',orderHash:`0x${'ab'.repeat(32)}`}));
 }
 const prepared=prepareMinkalyTransaction(config,{action:'claim',orderHash:`0x${'ab'.repeat(32)}`});
 assert.equal(prepared.chainId,31337);assert.equal(prepared.requiresWalletSignature,true);
});
test('local demo status disabled without explicit loopback configuration',async()=>{
 const result=await readLocalDemo({...config,demoEnabled:false});
 assert.equal(result.enabled,false);assert.equal(result.connected,false);assert.equal('deployment' in result,false);
});
test('local manifest path supports source and compiled output depths',async()=>{
 const source = await localDemoManifestPath(pathToFileURL(resolve('src/integrations/local-demo.ts')).href);
 const compiled = await localDemoManifestPath(pathToFileURL(resolve('dist/src/integrations/local-demo.js')).href);
 assert.equal(source, compiled);
 assert.ok(source.endsWith(['scripts','contracts','dist','local-demo.json'].join(process.platform === 'win32' ? '\\' : '/')));
});
