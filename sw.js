// Кинозал: service worker веб-версии. Сначала сеть (чтобы обновления приходили сразу), без сети — из запаса.
const V = 'kinozal-shell-6';
const STT = 'kinozal-stt-1';   // тяжёлый файл распознавания речи: качается при первой расшифровке и переживает обновления
const SHELL = ['./', 'index.html', 'messenger.js', 'stt.js', 'stt-worker.js', 'vendor/stt/transformers.min.js', 'vendor/stt/ort-wasm-simd-threaded.mjs', 'rawprev.js', 'viewers.js', 'music.js', 'music.css', 'messenger.css', 'theme.js', 'theme.css', 'mobile.css', 'craft.css', 'web.js', 'android.js', 'vendor/peerjs.min.js', 'signal.js', 'vendor/qrcode.js', 'manifest.webmanifest', 'package.json', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== STT).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.endsWith('/vendor/stt/ort-wasm-simd-threaded.wasm')) {
    e.respondWith(caches.open(STT).then(async c => (await c.match(r)) || fetch(r).then(res => { if (res.ok) c.put(r, res.clone()).catch(() => {}); return res; })));
    return;
  }
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
