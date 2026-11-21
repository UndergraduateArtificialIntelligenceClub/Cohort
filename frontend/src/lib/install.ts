import { useSyncExternalStore } from "react";

// Installing Cohort as a home screen app. There's only a manifest (public/manifest.webmanifest),
// no service worker, so nothing is cached for offline use.
// - Desktop Chrome/Edge: an "Install Cohort" button in the nav (components/InstallPrompt.tsx)
// - Phones: "Add Cohort to your Home Screen" in the account menu (components/AccountMenu.tsx). It opens the
//   same dialog where the browser has one (Android Chrome), otherwise it shows the steps (iPhone).
// Both stay hidden when Cohort is already running as the installed app.

// Not in TypeScript's DOM types yet
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

// Chrome can fire this before React renders (or while the login page is up), so listen as soon as this file loads.
let installEvent: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault(); // use our button instead of Chrome's own install bar
  installEvent = event as BeforeInstallPromptEvent;
  notify();
});
window.addEventListener("appinstalled", () => {
  installEvent = null;
  notify();
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Opened from the home screen icon rather than a browser tab
export function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// The browser's install dialog, once the browser says Cohort can be installed. null until then (always on iPhone).
export function useInstallDialog(): (() => void) | null {
  const event = useSyncExternalStore(subscribe, () => installEvent);
  if (!event) return null;
  return () => {
    // The browser only lets each event open the dialog once
    installEvent = null;
    notify();
    event.prompt().catch(console.error);
  };
}
