// Cohort's service worker: shows push notifications and keeps the number on the app icon up to date.
// It caches nothing, so the app always loads fresh from the network like before.
// Pushes come from supabase/functions/send-notifications; each one is JSON: { title, body, url, tag, badge }.
// Registered in src/main.tsx. Plain JavaScript in public/, so Vite serves it as-is at /sw.js.

// Take over straight away when a new version is deployed, instead of waiting for every tab to close
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Not JSON: still show something, since browsers require every push to show a notification
  }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title || "Cohort", {
        body: data.body || "",
        icon: "/icon-192.png",
        // Same tag replaces the older notification (one per chat, one for deadlines). renotify buzzes again.
        tag: data.tag,
        renotify: Boolean(data.tag),
        data: { url: data.url || "/" },
      }),
      setBadge(data.badge),
    ])
  );
});

// The red number on the app icon: unread study buddy chats. Not every browser can (see lib/notifications.ts).
function setBadge(count) {
  if (typeof count !== "number" || !("setAppBadge" in self.navigator)) return Promise.resolve();
  const update = count > 0 ? self.navigator.setAppBadge(count) : self.navigator.clearAppBadge();
  return update.catch(() => {});
}

// Tapping a notification: bring Cohort to the front on the right page, or open it
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin);
  const path = target.pathname + target.search;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        // The app switches page itself (components/NotificationListener.tsx), so it doesn't reload
        open.postMessage({ type: "cohort:open", path });
        return;
      }
      await self.clients.openWindow(path);
    })()
  );
});
