/* ============================================================
   VoicePad - Service Worker (Offline PWA Support)
   ============================================================ */

const CACHE_NAME = 'voicepad-cache-v1';

// Core assets to pre-cache on install
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './favicon.ico',
  './favicon-16x16.png',
  './favicon-32x32.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'
];

// Install Event: pre-cache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('VoicePad SW pre-cache partial warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: clean up obsolete caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Stale-While-Revalidate & Offline Fallback
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle GET requests and http/https schemes
  if (request.method !== 'GET' || !request.url.startsWith('http')) {
    return;
  }

  // Never cache external AI API requests (Gemini or OpenAI)
  const url = new URL(request.url);
  if (url.hostname.includes('googleapis.com') && url.pathname.includes('generativeLanguage')) {
    return;
  }
  if (url.hostname.includes('api.openai.com')) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      // 1. If in cache, return cached response immediately and fetch in background to revalidate
      if (cachedResponse) {
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
            }
          })
          .catch(() => {
            // Offline: silently continue serving cached version
          });
        return cachedResponse;
      }

      // 2. Not in cache: fetch from network, then cache successful response
      return fetch(request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
            return networkResponse;
          }

          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });

          return networkResponse;
        })
        .catch(() => {
          // 3. Offline fallback for HTML page navigation
          if (request.mode === 'navigate') {
            return caches.match('./index.html') || caches.match('./');
          }
        });
    })
  );
});
