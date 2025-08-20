self.addEventListener('install', (e)=>{
  self.skipWaiting();
  e.waitUntil(caches.open('dt-cache-v1').then(cache=> cache.addAll([
    './',
    './index.html',
    './manifest.webmanifest',
    './service-worker.js',
    './icons/icon-192.png',
    './icons/icon-512.png'
  ])));
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>{
    if(k!=='dt-cache-v1') return caches.delete(k);
  }))));
  self.clients.claim();
});

self.addEventListener('fetch', (e)=>{
  const url = new URL(e.request.url);
  if(url.origin === location.origin){
    e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
  } else {
    e.respondWith(fetch(e.request));
  }
});
