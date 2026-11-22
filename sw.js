// Kartvizit service worker — çevrimdışı çalışma
const VERSION = 'v1.1.1';
const CACHE = `kartvizit-${VERSION}`;
const FILES_CACHE = 'kartvizit-files'; // Kişiler/Takvim için geçici .vcf/.ics dosyaları
const CORE = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/db.js', 'js/vcard.js', 'js/parse.js',
  'lib/qrcode.js', 'lib/jsQR.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/maskable-512.png'
];
// OCR dosyaları (~13 MB) — kurulumda arka planda önbelleğe alınır
const OCR = [
  'lib/tesseract/tesseract.min.js', 'lib/tesseract/worker.min.js',
  'lib/tesseract/core/tesseract-core-simd-lstm.wasm.js', 'lib/tesseract/core/tesseract-core-lstm.wasm.js',
  'lib/tesseract/lang/tur.traineddata.gz', 'lib/tesseract/lang/eng.traineddata.gz'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    // OCR dosyaları: biri başarısız olsa bile kurulum devam etsin
    await Promise.all(OCR.map(u => cache.add(u).catch(() => null)));
    // İlk kurulumda hemen etkinleş
    if (!(await self.registration.active)) self.skipWaiting();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('kartvizit-v') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // dış adreslere hiçbir şey gönderilmez/önbelleklenmez
  const scope = new URL(self.registration.scope);
  const path = url.pathname.slice(scope.pathname.length);

  // Uygulamanın ürettiği geçici dosyalar (vCard / takvim)
  if (path.startsWith('files/')) {
    event.respondWith((async () => {
      const c = await caches.open(FILES_CACHE);
      const hit = await c.match(req.url, { ignoreSearch: true });
      return hit || new Response('Dosya bulunamadı. Uygulamaya dönüp tekrar deneyin.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    })());
    return;
  }

  if (req.mode === 'navigate') {
    // Ağ öncelikli (güncel sürüm), çevrimdışıysa önbellek
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('index.html', res.clone());
        return res;
      } catch {
        return (await caches.match('index.html', { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }

  // Diğer dosyalar: önbellek öncelikli
  event.respondWith((async () => {
    const hit = await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone());
    }
    return res;
  })());
});
