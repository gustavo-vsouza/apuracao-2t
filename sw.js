// Service worker: guarda o app para abrir rápido e offline.
// Os dados do TSE (outro domínio) nunca passam por aqui — sempre vêm frescos da rede.
const V = "ap2t-v3";
const SHELL = ["./", "index.html", "style.css", "js/config.js", "js/mapa.js", "js/ber.js", "js/app.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/favicon.svg"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // rede primeiro (app sempre atualizado), cache como reserva offline
  e.respondWith(
    fetch(e.request, { cache: "no-cache" }).then((r) => {
      if (r.ok) { const cp = r.clone(); caches.open(V).then((c) => c.put(e.request, cp)); }
      return r;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
  );
});
