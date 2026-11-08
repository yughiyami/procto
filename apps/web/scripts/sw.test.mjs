import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

function setup() {
  const handlers = {};
  const stored = new Map();
  const deleted = [];
  let network = async () => new Response('fresh', { headers: { 'content-type': 'text/html' } });
  const key = (request) => typeof request === 'string' ? request : request.url;
  runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    URL,
    self: { location: { origin: 'http://localhost:5173' }, skipWaiting() {}, clients: { claim() {} }, addEventListener(name, fn) { handlers[name] = fn; } },
    caches: { keys: async () => ['izumi-shell-v1', 'izumi-shell-v2', 'another-app'], delete: async (name) => deleted.push(name), open: async () => ({ match: async (request) => stored.get(key(request)), put: async (request, response) => stored.set(key(request), response) }) },
    fetch: (...args) => network(...args),
  });
  return { stored, deleted, handlers, network(fn) { network = fn; }, request(path, destination = '', mode = 'cors') {
    let result;
    handlers.fetch({ request: { url: `http://localhost:5173${path}`, method: 'GET', destination, mode }, respondWith(promise) { result = promise; } });
    return result;
  } };
}

test('navigation refreshes cached HTML and offers an offline fallback', async () => {
  const app = setup();
  app.stored.set('/index.html', new Response('old'));
  assert.equal(await (await app.request('/chat/one', 'document', 'navigate')).text(), 'fresh');
  app.network(async () => { throw new Error('offline'); });
  assert.equal(await (await app.request('/chat/two', 'document', 'navigate')).text(), 'fresh');
});

test('HTML returned for a missing JS chunk is never cached', async () => {
  const app = setup();
  await app.request('/assets/gone.js', 'script');
  assert.equal(app.stored.size, 0);
});

test('valid production JavaScript is cached', async () => {
  const app = setup();
  app.network(async () => new Response('export {}', { headers: { 'content-type': 'text/javascript' } }));
  await app.request('/assets/current.js', 'script');
  assert.equal(app.stored.size, 1);
});

test('API calls and development modules bypass the cache', () => {
  const app = setup();
  assert.equal(app.request('/api/orders'), undefined);
  assert.equal(app.request('/src/main.tsx', 'script'), undefined);
  assert.equal(app.request('/@vite/client', 'script'), undefined);
});

test('activation cleans only old Izumi shell caches', async () => {
  const app = setup();
  let pending;
  app.handlers.activate({ waitUntil(value) { pending = value; } });
  await pending;
  assert.deepEqual(app.deleted, ['izumi-shell-v1']);
});
