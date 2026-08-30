const CACHE_NAME = 'trylist-v4';
const APP_SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/watch.js',
  './js/firebase.js',
  './js/user.js',
  './js/firebase-config.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for Firestore/API calls, cache-first for app shell
self.addEventListener('fetch', event => {
  const url = event.request.url;
  if (url.includes('firestore.googleapis.com') || url.includes('firebaseapp.com')) {
    return; // let these go straight to network, don't intercept
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
