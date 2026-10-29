const CACHE_NAME = 'lentes-cache-v3';
const urlsToCache = [
  './index.html',
  './manifest.json',
  './vendor/chart.min.js',
  './vendor/chartjs-plugin-datalabels.min.js'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(urlsToCache);
      })
      .then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(cacheName) {
          return cacheName !== CACHE_NAME;
        }).map(function(cacheName) {
          return caches.delete(cacheName);
        })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  // Nunca interceptar métodos não-GET ou chamadas de API Serverless (zero overhead de Service Worker)
  if (event.request.method !== 'GET' || event.request.url.indexOf('/api/') !== -1) {
    return;
  }

  // Network-first para navegação/HTML principal garantindo atualizações imediatas com fallback offline
  if (event.request.mode === 'navigate' || event.request.url.indexOf('index.html') !== -1) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          if (response && response.ok) {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, copy);
            });
          }
          return response;
        })
        .catch(function() {
          return caches.match(event.request) || caches.match('./index.html');
        })
    );
    return;
  }

  // Cache-first instantâneo (0ms) para vendor JS, manifest e assets estáticos
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        if (response) return response;
        return fetch(event.request).then(function(netRes) {
          if (netRes && netRes.ok && event.request.url.indexOf(self.location.origin) === 0) {
            var copy = netRes.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, copy);
            });
          }
          return netRes;
        });
      })
  );
});
