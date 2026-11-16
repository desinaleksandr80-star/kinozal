// Кинозал: service worker веб-версии. Сначала сеть (чтобы обновления приходили сразу), без сети — из запаса.
const V = 'kinozal-shell-2';
const SHELL = ['./', 'index.html', 'messenger.js', 'messenger.css', 'theme.js', 'theme.css', 'mobile.css', 'web.js', 'android.js', 'vendor/peerjs.min.js', 'vendor/qrcode.js', 'manifest.webmanifest', 'package.json', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(V);
    try {
      const res = await fetch(r, { cache: 'no-cache' });
      if (res.ok) cache.put(r, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      return (await cache.match(r, { ignoreSearch: true })) || (r.mode === 'navigate' ? await cache.match('index.html') : null) || Response.error();
    }
  })());
});
// нажали на уведомление — открываем Кинозал на нужном чате
self.addEventListener('notificationclick', e => {
  const chat = e.notification.data?.chat; e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = all[0];
    if (c) { await c.focus().catch(() => {}); if (chat) c.postMessage({ openChat: chat }); }
    else await self.clients.openWindow('./');
  })());
});
