/**
 * ApexMission Service Worker — Web Push notifications
 *
 * Handles 'push' and 'notificationclick' events.
 * Notification text is generic — no task content on lock screen.
 *
 * Copyright (c) 2026 ApexMissions. All rights reserved.
 */

const NOTIFICATION_TAG = "apexmission-4pm-nudge";
const NOTIFICATION_TITLE = "ApexMission";

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const { body = "Time to close your top task before 5 PM." } = payload;

  const options = {
    body,
    tag: NOTIFICATION_TAG,
    requireInteraction: false,
    silent: false,
    vibrate: [100, 50, 100],
    data: payload.data ?? {},
    badge: "/badge-72.png",
    icon: "/icon-192.png",
    dir: "auto",
    lang: "en",
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(NOTIFICATION_TITLE, options).catch((err) => {
      console.error("[SW] Failed to show notification:", err);
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const { action, data } = event.notification;
  const url = data?.url ?? "/app";

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })()
  );
});

self.addEventListener("notificationclose", (event) => {
  // Optional: log dismissal for analytics (no-op for privacy)
  console.log("[SW] Notification dismissed:", event.notification.tag);
});