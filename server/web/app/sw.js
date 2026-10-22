// The phone app's service worker: keeps the app's own files for when the phone is offline, and
// shows the server's notifications (push.ts). The API (/v1/) is never kept: it always goes to the server.

const CACHE = 'slashclient-app-v3';
const SHELL = ['/app/', '/app/app.css', '/app/main.js', '/app/api.js', '/app/chat.js', '/app/crypto.js', '/app/e2e.js', '/app/i18n.js', '/app/notify.js', '/app/qr.js', '/app/ui.js',
  '/app/manifest.webmanifest', '/app/icon-192.png', '/vendor/fa/css/all.min.css', '/vendor/fa/webfonts/fa-solid-900.woff2', '/vendor/fa/webfonts/fa-regular-400.woff2', '/vendor/fa/webfonts/fa-brands-400.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// the app's files and the icons' font: from the server when it answers (so an update shows at once), else kept
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/v1/')) return;
  const ours = url.pathname === '/app' || url.pathname.startsWith('/app/') || url.pathname.startsWith('/vendor/fa/');
  if (!ours) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      void caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  }).catch(async () => (await caches.match(e.request)) ?? (await caches.match(e.request, { ignoreSearch: true }))
    ?? (e.request.mode === 'navigate' ? caches.match('/app/') : Response.error())));
});

self.addEventListener('push', (e) => {
  let data = {};
  try {
    data = e.data?.json() ?? {};
  } catch {
    data = { title: 'SlashClient', body: e.data?.text() ?? '' };
  }
  e.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // the app is open in front: it already shows the message (iOS wants every push shown, so only elsewhere)
    const apple = /iPhone|iPad|Macintosh/.test(navigator.userAgent);
    if (!apple && windows.some((w) => w.visibilityState === 'visible' && w.focused)) return;
    await self.registration.showNotification(data.title || 'SlashClient', {
      body: data.body || '',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      icon: '/app/icon-192.png',
      badge: '/app/icon-192.png',
      timestamp: data.at || Date.now(),
      data: { url: data.url || '/app/' },
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/app/', location.origin).href;
  e.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find((w) => new URL(w.url).pathname.startsWith('/app'));
    if (open) {
      await open.focus();
      open.postMessage({ type: 'open', url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
