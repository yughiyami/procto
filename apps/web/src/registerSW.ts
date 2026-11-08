/** Registers the app-shell service worker in production builds only. */
export function registerSW(): void {
  if (!('serviceWorker' in navigator)) return;

  if (!import.meta.env.PROD) {
    // Production and development can share localhost. An old worker otherwise
    // keeps serving obsolete HTML/chunks even though dev never registers one.
    const isOurs = (worker: ServiceWorker | null): boolean => {
      if (!worker) return false;
      const url = new URL(worker.scriptURL);
      return url.origin === window.location.origin && url.pathname === '/sw.js';
    };
    const wasControlled = isOurs(navigator.serviceWorker.controller);
    void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
      await Promise.all(registrations.filter((registration) =>
        isOurs(registration.active) || isOurs(registration.waiting) || isOurs(registration.installing),
      ).map((registration) => registration.unregister()));
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith('izumi-shell-')).map((key) => caches.delete(key)));
      }
      if (wasControlled) window.location.reload();
    }).catch(() => {
      // Restricted storage must not prevent the development app from loading.
    });
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {
      // Swallow registration failures: the app must keep working without the SW.
    });
  });
}
