/**
 * Mstkhby - Service Worker
 * Caches the app shell so the installed PWA works offline and passes
 * installability checks (required for a real "Install app" prompt, not
 * a browser shortcut).
 */

// Bumped to v3: the favicon.ico is now a real multi-resolution icon and a
// root-level /favicon.ico was added — bumping the version forces already
// installed clients to drop the old cached icon and pick up the new one.
const CACHE_VERSION = 'v3';
const CACHE_NAME = `mstkhby-static-${CACHE_VERSION}`;

const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/inbox.html',
    '/profile.html',
    '/manifest.json',
    '/css/main.css',
    '/css/components.css',
    '/css/animations.css',
    '/css/responsive.css',
    '/css/premium.css',
    '/js/app.js',
    '/js/pwa-install.js',
    '/favicon.ico',
    '/assets/icons/favicon.svg',
    '/assets/icons/icon-192.png',
    '/assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // Only handle same-origin GET requests — everything else (Firebase,
    // the R2 Worker API, NVIDIA calls, etc.) goes straight to the network.
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    // Never cache the admin dashboard — it must always reflect live data
    // and must never be servable while signed out / offline.
    if (url.pathname.startsWith('/admin/')) return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;

            return fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                });
        })
    );
});
