import { useSyncExternalStore } from "react";
import { isInstalled } from "./install";
import { supabase } from "./supabase";

// Push notifications: deadline reminders and study buddy alerts, plus the number on the app icon.
// No UI here; components/NotificationSettings.tsx, NotificationPrompt.tsx and NotificationListener.tsx call these.
// - public/sw.js shows the notifications and sets the icon number when a push arrives.
// - What gets sent and when: supabase/migrations/20261121120000_notifications.sql
// - Who sends them: supabase/functions/send-notifications
//
// Where it works: Chrome, Edge, Firefox and Safari on computers and Android. On iPhone and iPad, only once
// Cohort is on the Home Screen (iOS 16.4+). The number on the icon needs an installed app, and Android shows
// a dot instead of a number.

// The public half of the VAPID keys (see supabase/scripts/generate-vapid-keys.mjs). Not secret.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";

// Set while this device has notifications on, so a subscription the browser dropped gets renewed next visit
const ON_KEY = "cohort:notifications";
// "Not now" on a prompt, per prompt (e.g. "cohort:notification-prompt:deadlines")
const PROMPT_KEY = "cohort:notification-prompt:";

// localStorage throws when storage is blocked (some private modes). Then nothing is remembered, which is fine.
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked
  }
}

export type PushStatus =
  | "loading"
  | "not-set-up" // VITE_VAPID_PUBLIC_KEY is missing (a local copy without the keys)
  | "unsupported" // this browser can't do push
  | "install-first" // iPhone or iPad in the browser: works once Cohort is on the Home Screen
  | "blocked" // said no to the browser's question, or turned it off in settings
  | "off"
  | "on";

export type NotificationSettings = {
  deadlines: boolean;
  study_buddy: boolean;
};

// ---------- Service worker ----------

let registration: Promise<ServiceWorkerRegistration> | null = null;

// main.tsx calls this once on load
export function registerServiceWorker(): Promise<ServiceWorkerRegistration> | null {
  if (!("serviceWorker" in navigator)) return null;
  registration ??= navigator.serviceWorker.register("/sw.js");
  return registration;
}

// Subscribing needs a worker that's already running, not just registered
async function activeWorker(): Promise<ServiceWorkerRegistration> {
  const registering = registerServiceWorker();
  if (!registering) throw new Error("This browser can't show notifications.");
  await registering;
  return navigator.serviceWorker.ready;
}

// ---------- What this device can do ----------

function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// iPads say they're Macs, but Macs don't have touch screens
function isAppleMobile(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function readStatus(): Promise<PushStatus> {
  if (!VAPID_PUBLIC_KEY) return "not-set-up";
  if (!pushSupported()) return isAppleMobile() && !isInstalled() ? "install-first" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "off";
  return (await currentSubscription()) ? "on" : "off";
}

// The status is shared by every component that shows it, and rechecked when you come back to the app
// (you might have changed the permission in the browser's settings meanwhile)
let status: PushStatus = "loading";
const listeners = new Set<() => void>();

async function refreshStatus(): Promise<PushStatus> {
  status = await readStatus().catch(() => "unsupported" as const);
  listeners.forEach((listener) => listener());
  return status;
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && listeners.size > 0) refreshStatus();
});

function subscribe(listener: () => void) {
  if (listeners.size === 0) refreshStatus();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePushStatus(): PushStatus {
  return useSyncExternalStore(subscribe, () => status);
}

// ---------- Turning it on and off ----------

function vapidKeyBytes(): Uint8Array<ArrayBuffer> {
  const base64 = VAPID_PUBLIC_KEY.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// A subscription made with older VAPID keys can't receive our pushes, so it has to be replaced
function madeWithOurKey(sub: PushSubscription): boolean {
  const key = sub.options.applicationServerKey;
  if (!key) return false;
  const ours = vapidKeyBytes();
  const theirs = new Uint8Array(key);
  return theirs.length === ours.length && theirs.every((byte, i) => byte === ours[i]);
}

// This browser's subscription with our key, making one if needed. Needs permission already granted.
async function ourSubscription(): Promise<PushSubscription> {
  const reg = await activeWorker();
  let sub = await reg.pushManager.getSubscription();
  if (sub && !madeWithOurKey(sub)) {
    await sub.unsubscribe();
    sub = null;
  }
  return sub ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes() });
}

// Tie this browser to the logged in user, so the sender knows where to push
async function saveSubscription(sub: PushSubscription): Promise<void> {
  const { endpoint, keys } = sub.toJSON();
  if (!endpoint || !keys?.p256dh || !keys.auth) throw new Error("The browser didn't give us what we need for notifications.");
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
  });
  if (error) throw new Error(`Couldn't turn on notifications: ${error.message}`);
}

// "Turn on". Call it straight from a tap: Safari only shows the permission question after one.
// Returns the new status, e.g. "blocked" if they said no.
export async function turnOnNotifications(): Promise<PushStatus> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return refreshStatus();
  const sub = await ourSubscription();
  try {
    await saveSubscription(sub);
  } catch (e) {
    // The server doesn't know about it, so don't leave the sheet saying "On for this device"
    await sub.unsubscribe().catch(() => {});
    await refreshStatus();
    throw e;
  }
  store(ON_KEY, "on");
  return refreshStatus();
}

// "Turn off", and logging out. Only this device; the person's other devices keep theirs.
export async function turnOffNotifications(): Promise<void> {
  store(ON_KEY, null);
  const sub = await currentSubscription();
  if (sub) {
    const { error } = await supabase.rpc("delete_push_subscription", { p_endpoint: sub.endpoint });
    if (error) console.error(error);
    // Even if that failed: once unsubscribed, the push service answers "gone" and the sender deletes the row
    await sub.unsubscribe();
  }
  setAppBadge(0);
  await refreshStatus();
}

// On every app start while logged in: keep the server's copy of this device's subscription current.
// Browsers sometimes replace a subscription, or someone else may have used this browser before.
export async function syncNotifications(): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !pushSupported() || Notification.permission !== "granted") return;
  const existing = await currentSubscription();
  if (!existing && !readStored(ON_KEY)) return;
  await saveSubscription(await ourSubscription());
  store(ON_KEY, "on");
  await refreshStatus();
}

// ---------- What to send (the same for all of a person's devices) ----------

export async function loadNotificationSettings(): Promise<NotificationSettings> {
  const { data, error } = await supabase.from("notification_settings").select("deadlines, study_buddy").maybeSingle();
  if (error) throw new Error(`Couldn't load your notification settings: ${error.message}`);
  // No row yet means everything is on
  return data ?? { deadlines: true, study_buddy: true };
}

export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const user_id = data.session?.user.id;
  if (!user_id) throw new Error("Please log in first.");
  const { error } = await supabase
    .from("notification_settings")
    .upsert({ user_id, ...settings, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw new Error(`Couldn't save your notification settings: ${error.message}`);
}

// ---------- Prompts ----------

export function promptDismissed(id: string): boolean {
  return readStored(PROMPT_KEY + id) !== null;
}

export function dismissPrompt(id: string): void {
  store(PROMPT_KEY + id, new Date().toISOString());
}

// ---------- Icon number and old notifications ----------

// The red number on the installed app's icon: unread study buddy chats (lib/useUnreadCount.ts).
// Quietly does nothing where it isn't supported, or before notifications are allowed (Safari needs that).
export function setAppBadge(count: number): void {
  if (!("setAppBadge" in navigator)) return;
  (count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
}

// Opening a chat clears its notification, like messaging apps do. Tags come from compose.ts in the function.
export async function closeNotifications(tag: string): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const shown = (await reg?.getNotifications({ tag })) ?? [];
  shown.forEach((notification) => notification.close());
}
