/* KopiPass field app service worker: offline shell for /field + offline map tiles (F2.6, F2.7). */
const SHELL = "kp-shell-v1";
const TILES = "kp-tiles-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/field", "/manifest.webmanifest", "/maplibre-gl-worker.mjs"]).catch(() => undefined)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("kp-shell-") && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // satellite / street tiles: cache-first (pre-downloaded or previously viewed)
  if (url.hostname === "server.arcgisonline.com" || url.hostname === "tile.openstreetmap.org") {
    event.respondWith(
      caches.open(TILES).then(async (c) => {
        const hit = await c.match(req.url);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) c.put(req.url, res.clone());
          return res;
        } catch {
          return new Response("", { status: 504 });
        }
      }),
    );
    return;
  }
  if (url.origin !== self.location.origin) return;

  // the field app page: network-first, fall back to the cached shell when offline
  if (req.mode === "navigate" && url.pathname.startsWith("/field")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) caches.open(SHELL).then((c) => c.put("/field", res.clone()));
          return res;
        })
        .catch(() => caches.match("/field").then((r) => r || new Response("Offline", { status: 503 }))),
    );
    return;
  }

  // static build assets + fonts: stale-while-revalidate
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/maplibre-gl-worker.mjs") {
    event.respondWith(
      caches.open(SHELL).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req).then((res) => {
          if (res.ok) c.put(req, res.clone());
          return res;
        }).catch(() => hit);
        return hit || net;
      }),
    );
  }
});
