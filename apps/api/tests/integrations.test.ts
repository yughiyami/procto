import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Interface } from 'ethers';
import { normalizeWapiInbound, sendWapiText, verifyWapiSignature } from '../src/integrations/wapi.js';
import { extractRequest } from '../src/integrations/deepseek.js';
import { MINKALY_ABI, prepareMinkalyTransaction } from '../src/integrations/minkaly.js';

test('Wapi raw HMAC fails closed for missing, plain secret and modified payload', () => {
  const raw = '{"x":1}', secret = 'a-secret';
  const sig = createHmac('sha256', secret).update(raw).digest('hex');
  assert.equal(verifyWapiSignature(raw, sig, secret), true);
  assert.equal(verifyWapiSignature(raw + ' ', sig, secret), false);
  assert.equal(verifyWapiSignature(raw, secret, secret), false);
  assert.equal(verifyWapiSignature(raw, undefined, ''), false);
});
test('Wapi stable dedupe across retries and event aliases; ignores groups and malformed', () => {
  const body = { event: 'messages.received', sessionId: 1, timestamp: 1, data: { key: { id: 'abc', remoteJid: '51987654321@s.whatsapp.net', fromMe: false }, message: { conversation: '20 prendas' } } };
  const first = normalizeWapiInbound(body)!;
  assert.equal(first.text, '20 prendas');
  assert.equal(first.dedupeKey, normalizeWapiInbound({ ...body, timestamp: 999, event: 'messages-personal.received' })!.dedupeKey);
  assert.notEqual(first.dedupeKey, normalizeWapiInbound({ ...body, sessionId: 2 })!.dedupeKey);
  assert.equal(normalizeWapiInbound({ ...body, data: { ...body.data, key: { ...body.data.key, remoteJid: '123@g.us' } } }), null);
  assert.equal(normalizeWapiInbound({ ...body, data: { ...body.data, key: { ...body.data.key, fromMe: true } } }), null);
  assert.equal(normalizeWapiInbound({}), null);
});
test('Wapi unknown sends are not retried; in_progress response acknowledges acceptance only', async () => {
  let calls = 0;
  const timeoutFetch: typeof fetch = async () => { calls++; throw new Error('timeout after dispatch'); };
  assert.deepEqual(await sendWapiText({ baseUrl: 'https://wapi.example', apiKey: 'secret' }, { to: '+51987654321', text: 'Hola' }, timeoutFetch), { status: 'unknown' });
  assert.equal(calls, 1);
  const success: typeof fetch = async (url, init) => {
    assert.equal(String(url), 'https://wapi.example/api/send-message');
    assert.equal(init?.redirect, 'error');
    return Response.json({ success: true, data: { msgId: 123, status: 'in_progress' } });
  };
  assert.deepEqual(await sendWapiText({ baseUrl: 'https://wapi.example', apiKey: 'secret' }, { to: '51987654321', text: 'Hola' }, success), { status: 'accepted', providerMessageId: '123' });
});
test('DeepSeek validates draft and never returns executable model fields', async () => {
  const draft = { product: 'polos', quantity: 20, specifications: null, deadline: null, missingFields: ['deadline'] };
  const response = (data: unknown): typeof fetch => async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(data) } }] });
  const result = await extractRequest({ apiKey: 'secret' }, '20 polos', response(draft));
  assert.equal(result.requiresHumanConfirmation, true);
  await assert.rejects(extractRequest({ apiKey: 'secret' }, '20 polos', response({ ...draft, execute: 'pay' })));
  await assert.rejects(extractRequest({ apiKey: 'secret' }, '20 polos', response({ ...draft, quantity: -1 })));
});
test('Minkaly prepares actual retain ABI unsigned and rejects mainnet/invalid deadline', () => {
  const config = { chainId: 11155111, contractAddress: '0x1111111111111111111111111111111111111111' };
  const input = { action: 'retain' as const, orderHash: '0x' + 'ab'.repeat(32), seller: '0x2222222222222222222222222222222222222222', amountBaseUnits: '1000000', releaseAt: 2000 };
  const tx = prepareMinkalyTransaction(config, input, 1000);
  const decoded = new Interface(MINKALY_ABI).decodeFunctionData('retain', tx.data);
  assert.equal(decoded[2], 1000000n);
  assert.equal(tx.requiresWalletSignature, true);
  assert.equal(tx.value, '0');
  assert.throws(() => prepareMinkalyTransaction({ ...config, chainId: 1 }, input, 1000), /Sepolia/);
  assert.throws(() => prepareMinkalyTransaction(config, input, 3000), /future/);
  assert.throws(() => prepareMinkalyTransaction(config, { ...input, amountBaseUnits: '0' }, 1000));
});
