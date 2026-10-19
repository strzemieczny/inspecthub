const BASE = new URL(self.registration.scope).pathname;
const CACHE_NAME = `inspect-hub-shell-v4-${BASE}`;
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.png?v=3",
  "/apple-touch-icon.png?v=3",
  "/branding/inspect-hub-symbol-192-v2.png",
  "/app-icon-192.png?v=3",
  "/app-icon-512.png?v=3",
  "/app-icon-maskable-512.png?v=3",
].map((path) => `${BASE}${path.slice(1)}`);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("inspect-hub-") && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ).then(() => self.clients.claim()),
      ),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith(`${BASE}api/`) ||
    !url.pathname.startsWith(BASE)
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(`${BASE}index.html`, copy));
          }
          return response;
        })
        .catch(() => caches.match(`${BASE}index.html`)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (!response.ok) return response;
          const copy = response.clone();
          void caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, copy));
          return response;
        }),
    ),
  );
});
