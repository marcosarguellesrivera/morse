// Caché para uso sin conexión. Cambia VERSION al publicar cambios.
const VERSION = 'morse-v11';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/styles.css',
  'js/morse.js', 'js/course.js', 'js/app.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/badge.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero para tener siempre la última versión; caché si no hay conexión.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

// Recordatorio diario: lo envía la tarea programada de GitHub Actions.
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { body: e.data.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || 'Código Morse', {
    body: data.body || '¿Hacemos la lección de hoy?',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge.png',
    tag: 'recordatorio',
    renotify: true
  }));
});

// Al tocar el aviso se abre la app (o se trae al frente si ya estaba abierta).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.registration.scope));
      return open ? open.focus() : self.clients.openWindow(self.registration.scope);
    })
  );
});
