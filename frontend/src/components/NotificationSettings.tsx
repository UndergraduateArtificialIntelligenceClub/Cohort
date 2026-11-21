import { useEffect, useState } from "react";
import {
  dismissPrompt,
  loadNotificationSettings,
  saveNotificationSettings,
  turnOffNotifications,
  turnOnNotifications,
  usePushStatus,
  type NotificationSettings as Settings,
} from "../lib/notifications";
import { IconCheck } from "./Icons";
import Sheet from "./Sheet";

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

// The Notifications sheet: on/off for this device, and which kinds to send (to all your devices).
// Opened from the bell in the desktop nav (App.tsx) and from the account menu on phones (AccountMenu.tsx).
function NotificationSettings({ onClose }: { onClose: () => void }) {
  const status = usePushStatus();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadNotificationSettings()
      .then(setSettings)
      .catch((e) => setError(errorText(e, "Couldn't load your notification settings.")));
  }, []);

  async function turnOn() {
    setBusy(true);
    setError("");
    try {
      await turnOnNotifications();
    } catch (e) {
      setError(errorText(e, "Couldn't turn on notifications."));
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError("");
    try {
      await turnOffNotifications();
      // They chose this, so don't ask again from the calendar or study buddy pages
      dismissPrompt("deadlines");
      dismissPrompt("study-buddy");
    } catch (e) {
      setError(errorText(e, "Couldn't turn off notifications."));
    } finally {
      setBusy(false);
    }
  }

  // Shown at once, put back if saving fails
  async function change(key: keyof Settings, value: boolean) {
    if (!settings) return;
    const previous = settings;
    const next = { ...settings, [key]: value };
    setSettings(next);
    setError("");
    try {
      await saveNotificationSettings(next);
    } catch (e) {
      setSettings(previous);
      setError(errorText(e, "Couldn't save that."));
    }
  }

  return (
    <Sheet title="Notifications" onClose={onClose}>
      <DeviceStatus status={status} busy={busy} onTurnOn={turnOn} onTurnOff={turnOff} />

      {error && <p className="notice notice-error mt-3">{error}</p>}

      <fieldset className="options" disabled={!settings}>
        <legend className="section-title">What to send</legend>
        <label className="option">
          <input
            type="checkbox"
            checked={settings?.deadlines ?? true}
            onChange={(e) => change("deadlines", e.target.checked)}
          />
          <span>
            <span className="option-label">Deadline reminders</span>
            <span className="muted">
              The evening before each deadline, and 3 days before exams and anything worth 15% or more.
            </span>
          </span>
        </label>
        <label className="option">
          <input
            type="checkbox"
            checked={settings?.study_buddy ?? true}
            onChange={(e) => change("study_buddy", e.target.checked)}
          />
          <span>
            <span className="option-label">Study buddy</span>
            <span className="muted">
              New matches and messages. Shows who it's from, never what they wrote. Where your device allows it, the app
              icon shows how many chats are unread.
            </span>
          </span>
        </label>
      </fieldset>
      <p className="muted mt-3 text-xs">These apply to all your devices. Nothing is sent between 11pm and 8am.</p>
    </Sheet>
  );
}

type DeviceStatusProps = {
  status: ReturnType<typeof usePushStatus>;
  busy: boolean;
  onTurnOn: () => void;
  onTurnOff: () => void;
};

// The top of the sheet: whether this device gets notifications, and what to do about it
function DeviceStatus({ status, busy, onTurnOn, onTurnOff }: DeviceStatusProps) {
  switch (status) {
    case "loading":
      return <p className="muted">Checking this device…</p>;
    case "not-set-up":
      return (
        <p className="notice">
          Notifications aren't set up on this copy of Cohort. Add VITE_VAPID_PUBLIC_KEY to frontend/.env (see the
          README).
        </p>
      );
    case "unsupported":
      return <p className="notice">This browser can't show notifications from Cohort. Chrome, Edge, Firefox and Safari can.</p>;
    case "install-first":
      return (
        <p className="notice">
          On iPhone and iPad, Cohort can only send notifications once it's on your Home Screen. Add it from the account
          menu, open Cohort from the new icon, then turn them on here.
        </p>
      );
    case "blocked":
      return (
        <p className="notice">
          Notifications are blocked for Cohort on this device. Allow them in your browser's site settings (on iPhone:
          Settings → Notifications → Cohort), then come back here.
        </p>
      );
    case "off":
      return (
        <>
          <p className="muted mb-3">Get reminders before things are due, and know when your study buddy writes.</p>
          <button type="button" className="btn btn-primary btn-block btn-lg" disabled={busy} onClick={onTurnOn}>
            {busy && <span className="spinner" />}
            Turn on notifications
          </button>
        </>
      );
    case "on":
      return (
        <div className="flex items-center gap-2">
          <IconCheck className="text-accent" />
          <p className="flex-1 font-medium">On for this device</p>
          <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={onTurnOff}>
            Turn off
          </button>
        </div>
      );
  }
}

export default NotificationSettings;
