/* BareBoard service worker.
 * Runtime cache-first shell. Works from any sub-path because every URL is
 * resolved against self.registration.scope rather than assumed to be "/".
 */
// Bump the suffix on every deploy: the activate handler drops older caches,
// so without a bump an installed copy would keep serving the previous build.
const CACHE = 'bareboard-v6';
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './icon.svg',
               './favicon.ico', './apple-touch-icon.png', './icon-192.png', './icon-512.png', './maskable-512.png'];

const scope = self.registration.scope;
const url = (p) => new URL(p, scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map(url)).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Navigations: network first, fall back to the cached app shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(url('./index.html'), copy));
          return res;
        })
        .catch(() => caches.match(url('./index.html')).then((r) => r || caches.match(url('./'))))
    );
    return;
  }

  // Static assets: cache first, then populate from network (handles hashed Vite bundles).
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
