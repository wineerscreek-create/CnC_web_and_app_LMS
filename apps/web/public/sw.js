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

  // Cross-origin requests: cache S3 avatars and media assets for offline resilience
  if (url.origin !== self.location.origin) {
    const isS3OrMedia =
      url.hostname.includes('amazonaws.com') ||
      url.pathname.includes('/avatars/') ||
      url.pathname.match(/\.(png|jpg|jpeg|webp|gif|svg)$/i);

    if (isS3OrMedia) {
      event.respondWith(
        caches.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request, { mode: 'cors' })
            .then((networkResponse) => {
              if (
                networkResponse &&
                (networkResponse.status === 200 || networkResponse.type === 'opaque')
              ) {
                const copy = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
              }
              return networkResponse;
            })
            .catch(() => cachedResponse);

          return cachedResponse || fetchPromise;
        })
      );
    }
    return;
  }

  // Navigation requests (HTML pages): Network-first with offline shell fallback
  if (request.mode === 'navigate') {
    const docCacheKey = new Request(`${url.origin}${url.pathname}`);
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy1 = response.clone();
            const copy2 = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, copy1);
              cache.put(docCacheKey, copy2);
              // Maintain authenticated portal shell for offline rehydration
              if (
                url.pathname.startsWith('/student') ||
                url.pathname.startsWith('/trainer') ||
                url.pathname.startsWith('/admin') ||
                url.pathname.startsWith('/hod') ||
                url.pathname.startsWith('/super-admin')
              ) {
                cache.put(new Request(`${url.origin}/__portal_shell__`), response.clone());
              }
            });
          }
          return response;
        })
        .catch(async () => {
          // 1. Try exact document match
          const cached = await caches.match(request);
          if (cached) return cached;

          // 2. Try normalized pathname match
          const cachedDoc = await caches.match(docCacheKey);
          if (cachedDoc) return cachedDoc;

          // 3. For authenticated portal routes, serve the cached portal shell
          if (
            url.pathname.startsWith('/student') ||
            url.pathname.startsWith('/trainer') ||
            url.pathname.startsWith('/admin') ||
            url.pathname.startsWith('/hod') ||
            url.pathname.startsWith('/super-admin')
          ) {
            const portalShell = await caches.match(new Request(`${url.origin}/__portal_shell__`));
            if (portalShell) return portalShell;
          }

          // 4. Fallback to /offline shell
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

  // Next.js client-side navigation (RSC payloads): Network-first with normalized cache fallback
  const isRscRequest =
    request.headers.get('RSC') === '1' ||
    url.searchParams.has('_rsc') ||
    request.headers.get('Accept')?.includes('text/x-component');

  if (isRscRequest) {
    const rscCacheKey = new Request(`${url.origin}${url.pathname}?__rsc__=1`);
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(rscCacheKey, copy));
          }
          return response;
        })
        .catch(async () => {
          // 1. Match normalized RSC payload
          const cached = await caches.match(rscCacheKey);
          if (cached) return cached;

          // 2. Match exact request if available
          const exact = await caches.match(request);
          if (exact) return exact;

          // 3. Fallback: if unvisited, throw network error to trigger document navigation
          // (NEVER return 503 JSON as that causes Next.js flight parser to crash with syntax error)
          return Response.error();
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

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'PURGE_USER_CACHE') {
    caches.open(CACHE_NAME).then((cache) => {
      cache.keys().then((keys) => {
        keys.forEach((request) => {
          const url = new URL(request.url);
          if (
            url.searchParams.has('__rsc__') ||
            url.pathname.includes('__portal_shell__') ||
            url.pathname.startsWith('/student') ||
            url.pathname.startsWith('/trainer') ||
            url.pathname.startsWith('/admin') ||
            url.pathname.startsWith('/hod') ||
            url.pathname.startsWith('/super-admin')
          ) {
            cache.delete(request);
          }
        });
      });
    });
  }
});
