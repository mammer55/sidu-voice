const CACHE = 'voice-transcriber-v1';
const SHELL = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first for shell assets; network-only for API calls.
self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('api.groq.com')) return; // never cache API

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
