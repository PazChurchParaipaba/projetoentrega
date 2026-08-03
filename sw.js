/**
 * 🚀 NAXIO PRO — TOTAL ANTI-FALLOUT SERVICE WORKER
 * Sistema Híbrido: Cache-First para velocidade, Network-First para Hub Local.
 */

const CACHE_NAME = 'naxio-extreme-v2';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/style.css',
    '/css/naxio-ui.css',
    '/css/enhancements.css',
    '/css/animations.css',
    '/js/core.js',
    '/js/garçom.js',
    '/js/caixa_modules.js',
    '/js/stability_manager.js',
    '/js/modules.js',
    '/js/comandas.js',
    '/logo.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('📦 Pre-caching Core Assets...');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. Ignora Supabase e Outros (Serão tratados pelo StabilityManager via HUB Local ou Queue)
    if (url.hostname.includes('supabase.co') || url.hostname.includes('google-analytics')) {
        return;
    }

    // 2. Chama o HUB Local (Não cachear chamadas de API do HUB)
    if (url.pathname.includes('/api/local/')) {
        event.respondWith(fetch(event.request).catch(() => new Response(JSON.stringify({error: 'HUB_OFFLINE'}), { status: 503 })));
        return;
    }

    // 3. Estratégia Stale-While-Revalidate para Assets
    event.respondWith(
        caches.match(event.request).then((cached) => {
            const networked = fetch(event.request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
                    return response;
                })
                .catch(() => cached);

            return cached || networked;
        })
    );
});
