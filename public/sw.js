// Perkly service worker, registered by the customer's card page (scope /c/).
// The card keeps working without a connection: the last copy of the card page, its scripts, fonts and
// images are kept on the phone, so the customer can still show the QR at the counter (staff stamp online).
// Nothing else on the site is affected.
const VERSION = "v1";
const PAGES = `perkly-cards-${VERSION}`;
const STATIC = `perkly-static-${VERSION}`;
const MAX_CARDS = 5;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("perkly-") && key !== PAGES && key !== STATIC) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

/** Keeps only the most recent MAX_CARDS card pages. */
async function trim() {
  const cache = await caches.open(PAGES);
  const keys = await cache.keys();
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_CARDS))) await cache.delete(old);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // The card page: always the live one when there is a connection; the last copy when there is not.
  if (req.mode === "navigate" && url.pathname.startsWith("/c/")) {
    const key = url.origin + url.pathname; // without ?welcome=1 and the like
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) {
            const cache = await caches.open(PAGES);
            await cache.delete(key);
            await cache.put(key, res.clone());
            trim();
          }
          return res;
        } catch {
          const cached = await caches.match(key, { cacheName: PAGES });
          return cached ?? new Response("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><p style='font:18px system-ui;padding:24px;text-align:center'>אין חיבור לאינטרנט · No connection</p>", { headers: { "Content-Type": "text/html; charset=utf-8" } });
        }
      })(),
    );
    return;
  }

  // Scripts and fonts never change under the same name: from the phone first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/stamps3d/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req, { cacheName: STATIC });
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) (await caches.open(STATIC)).put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  // The business's logo and pictures: the network when possible, the last copy otherwise.
  if (url.pathname.startsWith("/api/asset/")) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) (await caches.open(STATIC)).put(req, res.clone());
          return res;
        } catch {
          return (await caches.match(req, { cacheName: STATIC })) ?? Response.error();
        }
      })(),
    );
  }
});
