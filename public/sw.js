const CACHE_NAME = "edutalk-public-v11";
const APP_SHELL = [
  "/offline.html",
  "/icons/icon-192.png",
  "/manifest.webmanifest",
];

const PUBLIC_NAVIGATION_PATHS = ["/", "/discover", "/rankings", "/tutors", "/policies", "/compare", "/login", "/offline", "/support"];

function isPublicNavigation(url) {
  return PUBLIC_NAVIGATION_PATHS.includes(url.pathname)
    || url.pathname.startsWith("/institutions/")
    || url.pathname.startsWith("/tutors/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  const isStaticAsset = url.pathname.startsWith("/_next/static/")
    || url.pathname.startsWith("/icons/")
    || url.pathname === "/favicon.png"
    || url.pathname === "/manifest.webmanifest";
  const isPublicPage = event.request.mode === "navigate" && isPublicNavigation(url);
  if (!isStaticAsset && !isPublicPage) return;

  event.respondWith(
    isStaticAsset
      ? caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          return response;
        }))
      : fetch(event.request).then((response) => {
          if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          return response;
        }).catch(() => caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || caches.match("/offline.html"))),
  );
});
