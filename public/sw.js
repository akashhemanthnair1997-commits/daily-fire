const SHELL = "df-shell-v5";
const CONTENT = "df-content-v5";
const SHELL_FILES = ["/", "/index.html", "/read.html", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => ![SHELL, CONTENT].includes(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Essay JSON blobs + all image hosts: cache-first (immutable once written).
  const imageHosts = ["image.tmdb.org", "upload.wikimedia.org", "commons.wikimedia.org", "images.metmuseum.org"];
  if (url.pathname.includes("/essays/") || imageHosts.includes(url.hostname)) {
    e.respondWith(
      caches.open(CONTENT).then(async (c) => {
        const hit = await c.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        if (res.ok) c.put(e.request, res.clone());
        return res;
      })
    );
    return;
  }

  // Archive index: network-first, fall back to cache offline.
  if (url.pathname === "/api/essays") {
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then((res) => {
          const copy = res.clone();
          caches.open(CONTENT).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // App shell: cache-first.
  if (url.origin === location.origin) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
  }
});

self.addEventListener("push", (e) => {
  let data = { title: "Daily Fire", body: "A new essay has arrived.", url: "/" };
  try { data = { ...data, ...e.data.json() }; } catch {}
  const opts = {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url },
    requireInteraction: false,
  };
  if (data.image) opts.image = data.image;
  e.waitUntil(self.registration.showNotification(data.title, opts));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/";
  e.waitUntil(clients.openWindow(url));
});
