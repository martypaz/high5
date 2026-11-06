// High5 service worker: keeps the app's own files so it opens offline. Network first, so a fresh deploy is picked up as soon as you are online.
// It never touches requests to other sites (catalogues, images): those go straight to the network exactly as before, and nothing from them is stored.
const CACHE = 'high5-shell-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'css/app.css', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/ui.js', 'js/core.js', 'js/channels/index.js', 'js/channels/kit.js', 'js/channels/channel5.js', 'js/channels/itvx.js', 'js/channels/demo.js'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;           // not ours: leave it alone
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
    return res;
  }).catch(async () => (await caches.match(req, { ignoreSearch: true })) ?? (req.mode === 'navigate' ? await caches.match('index.html') : undefined) ?? Response.error()));
});
