const CACHE_NAME = "focus-timer-v7";
const IMAGE_CACHE_NAME = "focus-timer-images-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.json",
  "/favicon.svg",
  "/pwa-192.png",
  "/pwa-512.png",
  "/sounds/alert.mp3",
];

async function precacheUrls(cacheName, urls) {
  const cache = await caches.open(cacheName);

  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "no-store" });

        if (response.ok) {
          await cache.put(url, response);
        }
      } catch {
        // Skip missing files so one bad request does not abort install.
      }
    }),
  );
}

function isCacheableResponse(response) {
  return Boolean(
    response &&
      response.status !== 206 &&
      (response.ok || response.type === "opaque"),
  );
}

function getOfflineResponse() {
  return new Response("", {
    status: 503,
    statusText: "Offline",
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheUrls(CACHE_NAME, APP_SHELL));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== IMAGE_CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function buildPartialResponse(cachedResponse, rangeHeader) {
  const fullBuffer = await cachedResponse.arrayBuffer();
  const totalBytes = fullBuffer.byteLength;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || "");

  if (!match) {
    return new Response(fullBuffer, {
      status: 200,
      headers: cachedResponse.headers,
    });
  }

  const startValue = match[1] === "" ? 0 : Number(match[1]);
  const endValue = match[2] === "" ? totalBytes - 1 : Number(match[2]);
  const safeStart = Math.max(0, Math.min(startValue, totalBytes - 1));
  const safeEnd = Math.max(safeStart, Math.min(endValue, totalBytes - 1));
  const partialBuffer = fullBuffer.slice(safeStart, safeEnd + 1);
  const headers = new Headers(cachedResponse.headers);

  headers.set("Content-Range", `bytes ${safeStart}-${safeEnd}/${totalBytes}`);
  headers.set("Content-Length", String(partialBuffer.byteLength));
  headers.set("Accept-Ranges", "bytes");

  return new Response(partialBuffer, {
    status: 206,
    statusText: "Partial Content",
    headers,
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isImageRequest = event.request.destination === "image";
  const isNavigationRequest = event.request.mode === "navigate";
  const rangeHeader = event.request.headers.get("range");

  if (rangeHeader && isSameOrigin) {
    event.respondWith(
      caches.match(event.request).then(async (cachedResponse) => {
        if (cachedResponse) {
          return buildPartialResponse(cachedResponse, rangeHeader);
        }

        try {
          return await fetch(event.request);
        } catch {
          return getOfflineResponse();
        }
      }),
    );
    return;
  }

  if (isNavigationRequest && isSameOrigin) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (isCacheableResponse(networkResponse)) {
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME).then((cache) => {
              cache.put("/index.html", responseToCache);
            });
          }

          return networkResponse;
        })
        .catch(async () => {
          const cachedIndex = await caches.match("/index.html");
          return cachedIndex || getOfflineResponse();
        }),
    );
    return;
  }

  if (isImageRequest) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request)
          .then((networkResponse) => {
            if (isCacheableResponse(networkResponse)) {
              const responseToCache = networkResponse.clone();

              caches.open(IMAGE_CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }

            return networkResponse;
          })
          .catch(async () => {
            const cachedResponse = await caches.match(event.request);
            return cachedResponse || getOfflineResponse();
          });
      }),
    );
    return;
  }

  if (!isSameOrigin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (isCacheableResponse(networkResponse) && networkResponse.ok) {
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }

          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request);
          return cachedResponse || getOfflineResponse();
        });
    }),
  );
});
