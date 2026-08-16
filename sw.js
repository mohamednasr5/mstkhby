/**
 * Mstkhby - Service Worker
 * Caches the app shell so the installed PWA works offline and passes
 * installability checks (required for a real "Install app" prompt, not
 * a browser shortcut).
 */

// Bumped to v4: precache list and offline fallback now use paths relative
// to this file (instead of root-absolute "/…") so the service worker
// actually installs when the site is deployed under a subpath (e.g.
// GitHub Pages project sites at username.github.io/repo/) — root-absolute
// URLs there 404 against the account root, which made cache.addAll() fail
// and the whole install step throw, so the PWA never became installable.
const CACHE_VERSION = 'v6';
const CACHE_NAME = `mstkhby-static-${CACHE_VERSION}`;

const PRECACHE_URLS = [
    './',
    'index.html',
    'inbox.html',
    'profile.html',
    'manifest.json',
    'css/main.css',
    'css/components.css',
    'css/animations.css',
    'css/responsive.css',
    'css/premium.css',
    'js/app.js',
    'js/user-badges.js',
    'js/pwa-install.js',
    'favicon.ico',
    'assets/icons/favicon.svg',
    'assets/icons/icon-192.png',
    'assets/icons/icon-512.png'
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
    // and must never be servable while signed out / offline. Uses
    // includes() (not startsWith()) since pathname is the full path from
    // the domain root, which includes any GitHub Pages repo subfolder.
    if (url.pathname.includes('/admin/')) return;

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
                        return caches.match('index.html');
                    }
                });
        })
    );
});
