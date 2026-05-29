import { version as appVersion } from '../package.json';

// export default null
declare let self: ServiceWorkerGlobalScope;

const cacheName = `superSplat-v${appVersion}`;

const cacheUrls = [
    './',
    './index.css',
    './index.html',
    './index.js',
    './index.js.map',
    './manifest.json',
    './static/icons/logo-192.png',
    './static/icons/logo-512.png',
    './static/images/screenshot-narrow.jpg',
    './static/images/screenshot-wide.jpg',
    './static/lib/lodepng/lodepng.js',
    './static/lib/lodepng/lodepng.wasm',
    './static/lib/webp/webp.mjs',
    './static/lib/webp/webp.wasm',
    './static/locales/de.json',
    './static/locales/en.json',
    './static/locales/fr.json',
    './static/locales/ja.json',
    './static/locales/ko.json',
    './static/locales/zh-CN.json'
];

self.addEventListener('install', (event) => {
    console.log(`installing v${appVersion}`);

    // precache should not block install if CacheStorage fails
    event.waitUntil(
        caches.open(cacheName)
        .then(cache => cache.addAll(cacheUrls))
        .catch((err: unknown): void => {
            console.warn('SW precache failed', err);
        })
        .then(() => { })
    );
});

self.addEventListener('activate', () => {
    console.log(`activating v${appVersion}`);

    // delete the old caches once this one is activated
    caches.keys().then((names) => {
        for (const name of names) {
            if (name !== cacheName) {
                caches.delete(name);
            }
        }
    });
});

function isDocumentRequest(request: Request): boolean {
    const url = new URL(request.url);
    return request.mode === 'navigate' || (url.pathname === '/' || url.pathname.endsWith('/index.html'));
}

// Entry assets can change between local builds even if package.json version is unchanged.
// Prefer network-first to avoid serving stale index.js/index.css from the same cache key.
function isEntryAssetRequest(request: Request): boolean {
    const url = new URL(request.url);
    return url.pathname.endsWith('/index.js') || url.pathname.endsWith('/index.css');
}

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (isDocumentRequest(request) || isEntryAssetRequest(request)) {
        event.respondWith(
            fetch(request)
            .then(response => response)
            .catch(() => caches.match(request))
        );
        return;
    }
    event.respondWith(
        caches.match(request).then(response => response ?? fetch(request))
    );
});
