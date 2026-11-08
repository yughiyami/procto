import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callModel } from '../src/agents/model-client.js';

test('DeepSeek tool-call index metadata is stripped without relaxing function validation', async () => {
  const call = { index: 0, id: 'call-1', type: 'function', function: { name: 'get_conversation', arguments: '{"conversationId":"00000000-0000-4000-8000-000000000000"}' } };
  const envelope = (tool: unknown) => ({ choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: '', reasoning_content: 'provider metadata', tool_calls: [tool] } }], usage: { total_tokens: 123 } });
  const result = await callModel({ apiKey: 'fixture' }, [], [], async () => Response.json(envelope(call)));
  assert.equal(result.totalTokens, 123);
  assert.deepEqual(result.message.tool_calls, [{ id: call.id, type: call.type, function: call.function }]);
  assert.equal('reasoning_content' in result.message, false);
  await assert.rejects(callModel({ apiKey: 'fixture' }, [], [], async () => Response.json(envelope({ ...call, function: { ...call.function, execute: true } }))));
  await assert.rejects(callModel({ apiKey: 'fixture' }, [], [], async () => Response.json(envelope({ ...call, function: { name: 'get_conversation', arguments: {} } }))));
});

test('DeepSeek bounded replies disable reasoning and require complete JSON output', async () => {
  const config={apiKey:'fixture'};
  const messages=[{role:'system' as const,content:'Return one JSON object.'}];
  const response=(content:string,finish_reason='stop')=>Response.json({choices:[{finish_reason,message:{content}}]});
  const result=await callModel(config,messages,[],async(_url,init)=>{
    const payload=JSON.parse(String(init?.body));
    assert.deepEqual(payload.thinking,{type:'disabled'});
    assert.deepEqual(payload.response_format,{type:'json_object'});
    assert.equal(payload.max_tokens,1200);
    return response('{"proposals":[]}');
  });
  assert.equal(result.message.content,'{"proposals":[]}');
  await assert.rejects(callModel(config,messages,[],async()=>response('', 'length')),/incomplete/);
  await assert.rejects(callModel(config,messages,[],async()=>response('')),/empty/);
});
