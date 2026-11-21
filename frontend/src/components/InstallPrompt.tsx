import { useState, useSyncExternalStore } from "react";
import { IconDownload, IconShare, IconX } from "./Icons";

// Install Cohort as a home screen app. There's only a manifest (public/manifest.webmanifest),
// no service worker, so nothing is cached for offline use.
// - Android/Chrome/Edge: an "Install Cohort" button that opens the browser's install dialog
// - iPhone/iPad Safari: a dismissible tip, since Safari has no install dialog to open
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
function isInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// Safari on iPhone/iPad. iPads report themselves as a Mac, so check for touch too.
// Other iOS browsers (Chrome, Firefox, Edge...) are left out since their menus differ.
function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
}

const DISMISSED_KEY = "cohort-install-tip-dismissed";

function readDismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

// Goes in the nav bar. Only shows once the browser says Cohort can be installed.
export function InstallButton() {
  const event = useSyncExternalStore(subscribe, () => installEvent);
  if (!event || isInstalled()) return null;

  const install = () => {
    // The browser only lets each event open the dialog once
    installEvent = null;
    notify();
    event.prompt().catch(console.error);
  };

  return (
    <button type="button" onClick={install} className="btn btn-quiet btn-sm">
      <IconDownload />
      Install Cohort
    </button>
  );
}

// Fixed to the bottom of the screen on iPhone/iPad Safari until dismissed
export function IosInstallTip() {
  const [show, setShow] = useState(() => isIosSafari() && !isInstalled() && !readDismissed());
  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Storage blocked: the tip just comes back next visit
    }
  };

  return (
    <>
      {/* Empty space at the end of the page so the fixed tip never covers the last thing on it */}
      <div className="install-tip-spacer" aria-hidden="true" />
      <div className="install-tip notice notice-info" role="note">
        <p className="install-tip-text">
          Install Cohort: tap Share <IconShare className="install-tip-share" /> then <strong>Add to Home Screen</strong>.
        </p>
        <button type="button" onClick={dismiss} className="icon-btn" aria-label="Dismiss">
          <IconX />
        </button>
      </div>
    </>
  );
}
