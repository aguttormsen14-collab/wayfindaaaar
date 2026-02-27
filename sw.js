// Service Worker for Saxvik Hub Kiosk PWA
// INTENTIONALLY NON-CACHING to avoid stale content in production kiosks
// This SW exists ONLY to make the app installable on Android Chrome

self.addEventListener('install', (event) => {
  // Skip waiting to activate immediately
  self.skipWaiting();
  console.log('[SW] Installed (non-caching mode)');
});

self.addEventListener('activate', (event) => {
  // Claim all clients immediately
  event.waitUntil(
    self.clients.claim().then(() => {
      console.log('[SW] Activated and claimed clients');
    })
  );
});

self.addEventListener('fetch', (event) => {
  // PASS-THROUGH: Do NOT cache or modify requests
  // This ensures kiosks always get fresh content from server
  // Required for PWA installability but intentionally does nothing
  return;
});
