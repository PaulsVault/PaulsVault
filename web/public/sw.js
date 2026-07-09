// Service worker mínimo: app shell cache-first, API network-first (para uso offline en mesa).
const CACHE = "dnd-app-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // API: red primero, sin cachear (los datos viven en el backend).
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request).catch(() => new Response(JSON.stringify({ error: { message: "Sin conexión" } }), { status: 503, headers: { "content-type": "application/json" } })));
    return;
  }

  // Assets y shell: cache primero, con actualización en segundo plano.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});
