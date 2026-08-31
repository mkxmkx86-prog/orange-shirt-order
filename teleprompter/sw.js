/* sw.js — Cache First 離線快取 */
var CACHE_NAME = 'teleprompter-v1';

var CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css?v=1',
  './js/app.js?v=1',
  './js/storage.js?v=1',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(CORE_ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        return key === CACHE_NAME ? null : caches.delete(key);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  // 導覽請求：離線時回退到已快取的首頁
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match('./index.html', { ignoreSearch: true });
      })
    );
    return;
  }

  // 其餘資源：Cache First，未命中才連網並順手快取
  event.respondWith(
    caches.match(req, { ignoreSearch: false }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true });
      });
    })
  );
});
