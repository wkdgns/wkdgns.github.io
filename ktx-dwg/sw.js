// 앱 파일과 글자 인식 엔진을 캐시해서 인터넷 없이도 열리게 한다. 도면은 IndexedDB에 있고 여기서 다루지 않는다.
const CACHE = "ktx-dwg-715e9b07";
const FILES = ["./","./index.html","./manifest.webmanifest","./icon.svg","./ocr/tesseract.min.js","./ocr/worker.min.js","./ocr/tesseract-core-lstm.wasm.js","./ocr/tesseract-core-simd-lstm.wasm.js","./ocr/eng.traineddata.gz","./ocr/kor.traineddata.gz"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, {ignoreSearch: true}).then(r => r || fetch(e.request)));
});
