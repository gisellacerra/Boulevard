const CACHE_NAME = 'newcom-boulevard-v2';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.ok) {
          const copia = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(request, copia));
        }

        return response;
      })
      .catch(() =>
        caches.match(request)
          .then(guardado => {
            if (guardado) return guardado;
            if (request.mode === 'navigate') {
              return caches.match('./index.html');
            }
            return Response.error();
          })
      )
  );
});
