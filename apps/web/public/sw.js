// Fresh HTML first; only immutable production assets may be cache-first.
// CRITICAL: never cache or intercept API traffic — order state must never be served stale.
const CACHE_VERSION = 'izumi-shell-v2';
const SHELL_CACHE = CACHE_VERSION;

// Populated lazily as the app is used; we do not pre-cache a fixed manifest here
// because Vite's hashed asset filenames are unknown to this static file.
const APP_ORIGIN = self.location.origin;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith('izumi-shell-') && key !== SHELL_CACHE).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isApiRequest(url) {
  // Any URL whose origin differs from the app's own origin is treated as the API
  // (or another external service) and must be bypassed entirely.
  return url.origin !== APP_ORIGIN;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return; // never intercept mutations
  }

  const url = new URL(request.url);

  if (isApiRequest(url)) {
    return; // let the network handle API/cross-origin calls untouched, never cached
  }

  const isNavigation = request.mode === 'navigate';
  const isStaticAsset = url.pathname.startsWith('/assets/') && ['style', 'script', 'image', 'font', 'worker'].includes(
    request.destination,
  );

  if (!isNavigation && !isStaticAsset) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = !isNavigation && await cache.match(request);
      if (cached && isValidAsset(cached, request.destination)) {
        return cached;
      }
      try {
        const response = await fetch(request);
        if (response.ok && (isNavigation
          ? response.headers.get('content-type')?.includes('text/html')
          : isValidAsset(response, request.destination))) {
          try {
            await cache.put(isNavigation ? '/index.html' : request, response.clone());
          } catch {
            // Storage quota/privacy failures must not discard a good network response.
          }
        }
        return response;
      } catch (err) {
        if (isNavigation) {
          const fallback = await cache.match('/index.html');
          if (fallback) return fallback;
        }
        throw err;
      }
    })(),
  );
});

function isValidAsset(response, destination) {
  const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (destination === 'script' || destination === 'worker') {
    return ['text/javascript', 'application/javascript', 'application/wasm'].includes(type);
  }
  if (destination === 'style') return type === 'text/css';
  if (destination === 'image') return type.startsWith('image/');
  if (destination === 'font') return type.startsWith('font/') || ['application/font-woff', 'application/vnd.ms-fontobject'].includes(type);
  return false;
}
