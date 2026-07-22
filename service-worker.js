const CACHE_NAME = 'cec-patch-parcelas-livres-v4';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './css/styles.css',
  './js/firebase.js',
  './js/core.js',
  './js/dashboard.js',
  './js/gestao.js',
  './js/despesas.js',
  './js/receitas.js',
  './js/bootstrap.js',
  './js/session-fallback.js',
  './js/service-worker-register.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => key !== CACHE_NAME ? caches.delete(key) : null)))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Não intercepta Firebase, APIs e requisições que não sejam GET.
  if (req.method !== 'GET' || url.hostname.includes('firebase') || url.hostname.includes('googleapis') || url.hostname.includes('openweathermap')) {
    return;
  }

  event.respondWith(
    fetch(req)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return response;
      })
      .catch(() => caches.match(req).then(cached => cached || caches.match('./index.html')))
  );
});
