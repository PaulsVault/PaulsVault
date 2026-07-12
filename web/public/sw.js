// Service worker: RED-PRIMERO para la navegación (HTML) → tras cada deploy carga la última
// versión (evita pantallas en blanco por caché vieja). Assets con hash: caché primero.
// API: siempre a la red. Sube CACHE (v2, v3…) para invalidar cachés viejas.
const CACHE = "dnd-app-v4";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // API: siempre red (sin cachear).
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request).catch(() =>
      new Response(JSON.stringify({ error: { message: "Sin conexión" } }), { status: 503, headers: { "content-type": "application/json" } })));
    return;
  }

  // Navegación (HTML): red primero → siempre la última versión; caché como respaldo offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/", copy)); return res; })
        .catch(() => caches.match(request).then((r) => r || caches.match("/"))),
    );
    return;
  }

  // Assets con hash (JS/CSS/imágenes): caché primero, actualiza en segundo plano.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((res) => { if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone())); return res; }).catch(() => cached);
      return cached || network;
    }),
  );
});
