const CACHE_NAME = "dougao-v57";
const DOWNLOAD_CACHE_NAME = "dougao-local-downloads-v1";
const DOWNLOAD_PATH_PREFIX = "/__dougao_download__/";
const ASSETS = [
  "./",
  "./index.html",
  "./static.html",
  "./styles-v57.css",
  "./app-v57.js",
  "./manifest-v57.webmanifest",
  "./favicon.svg",
  "./og.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(ASSETS.map((asset) => cache.add(asset)))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("dougao-v") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (
    requestUrl.origin === self.location.origin &&
    requestUrl.pathname.startsWith(DOWNLOAD_PATH_PREFIX)
  ) {
    event.respondWith(
      caches
        .open(DOWNLOAD_CACHE_NAME)
        .then((cache) => cache.match(event.request.url))
        .then(
          (response) =>
            response ||
            new Response("Download expired", {
              status: 404,
              headers: {
                "Cache-Control": "no-store",
                "Content-Type": "text/plain; charset=utf-8",
              },
            }),
        ),
    );
    return;
  }
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(event.request)
            .then((cached) => cached || caches.match("./index.html"))
            .then((fallback) => fallback || Response.error()),
        ),
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            return response;
          })
          .catch(() => Response.error()),
    ),
  );
});
