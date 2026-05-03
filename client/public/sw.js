/**
 * Superhumn ERP — service worker.
 *
 * Strategy:
 *   - App shell (HTML / JS / CSS / fonts / icons) → stale-while-revalidate.
 *   - Navigation requests → network-first, fall back to cached "/" so the
 *     SPA loads even when offline (it then hydrates from the IndexedDB-backed
 *     React Query cache; see client/src/lib/offline/queryCache.ts).
 *   - tRPC + /api/* → never handled here. The query/mutation layer owns
 *     offline reads (cache restore) and offline writes (mutation queue).
 *
 * Bump CACHE_VERSION whenever the shell strategy changes so old caches
 * are evicted on activate.
 */
const CACHE_VERSION = 'v3';
const SHELL_CACHE = `superhumn-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `superhumn-runtime-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
  '/apple-touch-icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

const isApiRequest = (url) =>
  url.pathname.startsWith('/api/') || url.pathname.startsWith('/trpc');

const isStaticAsset = (url) =>
  /\.(?:js|mjs|css|woff2?|ttf|otf|svg|png|jpg|jpeg|gif|webp|ico)$/i.test(
    url.pathname
  );

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/').then((cached) => cached || Response.error())
      )
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const fetched = fetch(request)
            .then((response) => {
              if (response && response.ok) cache.put(request, response.clone());
              return response;
            })
            .catch(() => cached);
          return cached || fetched;
        })
      )
    );
  }
});
