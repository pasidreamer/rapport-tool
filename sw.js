// Service Worker: hält eine Kopie der App auf dem PC, damit sie auch ohne
// Internet startet. Immer zuerst das Internet fragen (so kommen Updates sofort an),
// nach 3 Sekunden ohne Antwort die gespeicherte Kopie nehmen.
// Nach Änderungen an den Dateien: VERSION um eins erhöhen.

const VERSION = 'rapport-v1';
const DATEIEN = [
  './',
  './index.html',
  './manifest.webmanifest',
  './lib/pdf.min.js',
  './lib/pdf.worker.min.js',
  './lib/pdf-lib.min.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (ereignis) => {
  ereignis.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(DATEIEN)));
  self.skipWaiting();
});

self.addEventListener('activate', (ereignis) => {
  ereignis.waitUntil(
    caches.keys().then((namen) => Promise.all(namen.filter((n) => n !== VERSION).map((n) => caches.delete(n)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (ereignis) => {
  const anfrage = ereignis.request;
  if (anfrage.method !== 'GET' || new URL(anfrage.url).origin !== location.origin) return;

  ereignis.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      const gespeichert = await cache.match(anfrage, { ignoreSearch: true });
      const ausDemNetz = fetch(anfrage).then((antwort) => {
        if (antwort.ok) cache.put(anfrage, antwort.clone());
        return antwort;
      });
      if (!gespeichert) return ausDemNetz;
      const zuLangsam = new Promise((fertig) => setTimeout(() => fertig(gespeichert), 3000));
      return Promise.race([ausDemNetz.catch(() => gespeichert), zuLangsam]);
    })(),
  );
});
