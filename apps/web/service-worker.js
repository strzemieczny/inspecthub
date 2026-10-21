const BASE = new URL(self.registration.scope).pathname;
const CACHE_PREFIX = `inspect-hub:${BASE}:shell:`;
const CACHE_NAME = `${CACHE_PREFIX}__APP_VERSION__`;
const BUILD_ASSETS = __PRECACHE_ASSETS__;
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
      .then((cache) =>
        cache.addAll([
          ...APP_SHELL,
          ...BUILD_ASSETS.map((path) => `${BASE}${path}`),
        ]),
      ),
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
              (key) =>
                key !== CACHE_NAME &&
                (key.startsWith(CACHE_PREFIX) ||
                  (key.startsWith("inspect-hub-shell-") &&
                    key.endsWith(`-${BASE}`))),
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
    url.pathname === `${BASE}version.json` ||
    url.pathname === `${BASE}sw.js` ||
    !url.pathname.startsWith(BASE)
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.match(`${BASE}index.html`)),
      ),
    );
    return;
  }

  event.respondWith(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.match(request))
      .then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (!response.ok) return response;
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)),
            );
            return response;
          }),
      ),
  );
});

// Activate only once every open tab confirms it has no unsaved work or requests.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "ACTIVATE_UPDATE") return;
  event.waitUntil(
    (async () => {
      const clients = (
        await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        })
      ).filter((client) => new URL(client.url).pathname.startsWith(BASE));
      if (!clients.length) return;
      const ready = await Promise.all(
        clients.map(
          (client) =>
            new Promise((resolve) => {
              const channel = new MessageChannel();
              const finish = (safe) => {
                clearTimeout(timeout);
                channel.port1.close();
                resolve(safe);
              };
              const timeout = setTimeout(() => finish(false), 2000);
              channel.port1.onmessage = (reply) =>
                finish(reply.data?.safe === true);
              client.postMessage({ type: "UPDATE_SAFETY_CHECK" }, [
                channel.port2,
              ]);
            }),
        ),
      );
      if (ready.every(Boolean)) await self.skipWaiting();
    })(),
  );
});
