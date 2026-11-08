import {test} from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import type {Pool} from 'pg';
import {registerMcp} from '../src/mcp-wiring.js';
const orderId = '12345678-1234-4234-9234-123456789012';

test('MCP JSON subset: initialization, errors, read-only tools, authentication and tenant boundaries',async()=>{
  const previousOrigin = process.env.WEB_ORIGIN;
  process.env.WEB_ORIGIN = 'http://localhost:5173, https://allowed.example';
  const queries: {sql:string;args:unknown[]}[] = [];
  const db = {query:async(sql:string,args:unknown[])=>{
    queries.push({sql,args});
    assert.match(sql,/^SELECT /);
    if(sql.includes('directory_companies')) {
      assert.match(sql,/org_id=\$1/);
      return {rowCount:args[0]==='a'?1:0,rows:args[0]==='a'?[{id:'company',data:{name:'Untrusted company'},source:'manual'}]:[]};
    }
    assert.match(sql,/id=\$1 AND org_id=\$2/);
    return {rowCount:args[1]==='a'?1:0,rows:args[1]==='a'?[{data:{id:orderId,events:[]}}]:[]};
  }} as unknown as Pool;
  const app = Fastify();
  app.addHook('preHandler',async(req,reply)=>{
    if(!['Bearer a','Bearer b'].includes(req.headers.authorization??'')) return reply.code(401).send();
    (req as unknown as {org:string}).org=req.headers.authorization!.slice(7);
  });
  registerMcp(app,db);
  const headers = {authorization:'Bearer a',accept:'application/json, text/event-stream'};
  const rpc = (method:string,params?:unknown,extraHeaders={}) => app.inject({method:'POST',url:'/mcp',headers:{...headers,...extraHeaders},payload:{jsonrpc:'2.0',id:1,method,...(params===undefined?{}:{params})}});
  try {
    assert.equal((await app.inject({method:'POST',url:'/mcp',payload:{}})).statusCode,401);
    assert.equal((await rpc('ping',undefined,{origin:'https://evil.example'})).statusCode,403);
    assert.equal((await rpc('ping',undefined,{'mcp-protocol-version':'invalid'})).statusCode,400);
    const init = (await rpc('initialize',{protocolVersion:'2030-01-01',capabilities:{},clientInfo:{name:'test',version:'1'}})).json();
    assert.equal(init.result.protocolVersion,'2025-06-18');
    assert.equal(init.result.capabilities.tools.listChanged,false);
    assert.deepEqual((await rpc('ping')).json().result,{});
    for (const origin of ['http://localhost:5173','https://allowed.example']) assert.equal((await rpc('ping',undefined,{origin})).statusCode,200);
    const list = (await rpc('tools/list')).json().result.tools;
    assert.deepEqual(list.map((t:any)=>t.name),['directory.search','orders.get','evidence.get']);
    assert.ok(list.every((t:any)=>t.annotations.readOnlyHint));
    assert.equal((await rpc('tools/call',{name:'orders.get',arguments:{orderId}})).json().result.content[0].type,'text');
    assert.equal((await rpc('tools/call',{name:'orders.get',arguments:{orderId}},{authorization:'Bearer b'})).json().result.isError,true);
    assert.equal(JSON.parse((await rpc('tools/call',{name:'directory.search',arguments:{country:'PE',search:'textiles',limit:3}})).json().result.content[0].text).items[0].verification,'unverified');
    assert.equal(JSON.parse((await rpc('tools/call',{name:'directory.search'},{authorization:'Bearer b'})).json().result.content[0].text).items.length,0);
    const evidence=JSON.parse((await rpc('tools/call',{name:'evidence.get',arguments:{orderId}})).json().result.content[0].text);
    assert.deepEqual(evidence.events,[]);
    for (const call of [{name:'orders.write'},{name:'orders.get',arguments:{orderId:'invalid'}},{name:'orders.get',arguments:{orderId,org:'b'}},{name:'directory.search',arguments:{limit:101}}]) assert.equal((await rpc('tools/call',call)).json().error.code,-32602);
    assert.equal((await rpc('unknown')).json().error.code,-32601);
    const before=queries.length;
    const notification=await app.inject({method:'POST',url:'/mcp',headers,payload:{jsonrpc:'2.0',method:'tools/call',params:{name:'orders.get',arguments:{orderId}}}});
    assert.equal(notification.statusCode,202); assert.equal(notification.body,''); assert.equal(queries.length,before);
    assert.equal((await app.inject({method:'GET',url:'/mcp',headers})).statusCode,405);
    assert.equal((await app.inject({method:'POST',url:'/mcp',headers,payload:[]})).json().error.code,-32600);
    assert.equal((await app.inject({method:'POST',url:'/mcp',headers:{...headers,'content-type':'application/json'},payload:'{bad'})).json().error.code,-32700);
  } finally {await app.close(); if(previousOrigin === undefined) delete process.env.WEB_ORIGIN; else process.env.WEB_ORIGIN = previousOrigin;}
});


