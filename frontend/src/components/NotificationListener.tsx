import { useEffect } from "react";
import { useNavigate } from "react-router";
import { syncNotifications } from "../lib/notifications";

// Renders nothing. App.tsx mounts it once you're logged in.
// - Keeps this device's push subscription current on the server (lib/notifications.ts).
// - Tapping a notification while Cohort is already open: public/sw.js asks us to go to the right page
//   (e.g. /study-buddy?chat=42), and we switch page without reloading.
function NotificationListener() {
  const navigate = useNavigate();

  useEffect(() => {
    syncNotifications().catch(console.error);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    function onMessage(event: MessageEvent) {
      const { type, path } = event.data ?? {};
      // Only paths inside Cohort
      if (type === "cohort:open" && typeof path === "string" && path.startsWith("/") && !path.startsWith("//")) {
        navigate(path);
      }
    }
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);

  return null;
}

export default NotificationListener;
