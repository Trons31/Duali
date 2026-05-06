self.DUALI_NOTIFICATION_ICON =
  "https://res.cloudinary.com/dc2fop9ty/image/upload/v1778078148/icon-metadata_y5lrqo.png";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const title = payload.title || "Duali";
  const options = {
    body: payload.body || "",
    icon: payload.icon || self.DUALI_NOTIFICATION_ICON,
    badge: payload.badge || self.DUALI_NOTIFICATION_ICON,
    tag: payload.tag || undefined,
    data: payload.data || {}
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.href || "/dashboard/notificaciones";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })
  );
});
