const CACHE_NAME = 'photo-quest-v1';

/* App shell: cache the core JS + HTML on install */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/']);
    })
  );
  self.skipWaiting();
});

/* Activate: clean old caches */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* Runtime caching for media resources (mirrors vite-plugin-pwa workbox rules) */
self.addEventListener('fetch', (event) => {
  const { pathname } = new URL(event.request.url);

  if (pathname.startsWith('/image/') || pathname.startsWith('/thumb/') || pathname.startsWith('/stream/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetched = fetch(event.request).then((res) => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          });
          return cached || fetched;
        })
      )
    );
    return;
  }

  /* API: stale-while-revalidate */
  if (pathname.startsWith('/media') || pathname.startsWith('/folders') || pathname.startsWith('/tags')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetched = fetch(event.request).then((res) => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          });
          return cached || fetched;
        })
      )
    );
    return;
  }
});
