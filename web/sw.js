const CACHE = 'served-__BUILD__';
const SHELL = ['/', '/app.js', '/styles.css', '/barlow-condensed-800.woff2', '/manifest.webmanifest', '/served-logo.png', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('served-') && key !== CACHE)
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () =>
      (await (await caches.open(CACHE)).match('/')) || Response.error()));
  } else if (SHELL.includes(url.pathname)) {
    event.respondWith(fetch(request).catch(async () =>
      (await (await caches.open(CACHE)).match(url.pathname)) || Response.error()));
  }
});
