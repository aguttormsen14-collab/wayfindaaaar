// Service Worker for kiosk resilience
// Strategy: network-first (fresh when online), cache-fallback (keep running when offline)

const CACHE_NAME = 'sx-runtime-v1';
const CACHE_PREFIX = 'sx-runtime-';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './base-path.js',
  './config.js',
  './supabase-config.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.addAll(APP_SHELL);
    } catch (e) {
      // keep install non-fatal if any asset is temporarily unavailable
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    try {
      const networkResponse = await fetch(request);
      if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
        cache.put(request, networkResponse.clone()).catch(() => {});
      }
      return networkResponse;
    } catch (e) {
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;

      if (request.mode === 'navigate') {
        const offlinePage =
          (await cache.match('./index.html', { ignoreSearch: true })) ||
          (await cache.match('index.html', { ignoreSearch: true })) ||
          (await cache.match('./', { ignoreSearch: true }));
        if (offlinePage) return offlinePage;
      }

      throw e;
    }
  })());
});
