/**
 * Winners Creek LMS — Service Worker
 * Version: 1.0.0
 *
 * Cache Strategy:
 * - Shell & Static Assets: Stale-While-Revalidate / Cache-First
 * - Navigation: Network-First with fallback to cached shell or /offline
 * - APIs (/api/*): NEVER cached in Cache Storage (enforces zero-leakage of authenticated state).
 */

const CACHE_NAME = 'winners-creek-shell-v1';

const STATIC_PRECACHE = [
  '/',
  '/offline',
  '/favicon.ico',
  '/manifest.webmanifest',
  '/images/winnerscreek.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_PRECACHE).catch((err) => {
        console.warn('[SW] Precache failed during install:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // STRICT RULE: Never cache API endpoints or auth endpoints in Cache Storage
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Cross-origin requests: leave to browser default
  if (url.origin !== self.location.origin) {
    return;
  }

  // Navigation requests (HTML pages): Network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // If valid response, clone into cache
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          // Fallback to cache, then to /offline
          const cached = await caches.match(request);
          if (cached) return cached;
          const offlineFallback = await caches.match('/offline');
          if (offlineFallback) return offlineFallback;
          return new Response(
            '<!DOCTYPE html><html><head><title>Offline - Winners Creek</title></head><body style="font-family:sans-serif;text-align:center;padding:50px;"><h1>You are offline</h1><p>Please check your connection or access downloaded content in your student portal.</p><a href="/student/offline" style="color:#4A5D4E;font-weight:bold;">Go to Downloaded Content</a></body></html>',
            { headers: { 'Content-Type': 'text/html' } }
          );
        })
    );
    return;
  }

  // Next.js static bundles and media: Stale-While-Revalidate
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname === '/favicon.ico'
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }
});
