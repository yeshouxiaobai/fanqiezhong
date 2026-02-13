const CACHE_NAME = 'pomodoro-v1';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './icon.svg',
    'https://unpkg.com/vue@3/dist/vue.global.js'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});