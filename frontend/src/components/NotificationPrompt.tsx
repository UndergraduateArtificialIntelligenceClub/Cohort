import { useState } from "react";
import { dismissPrompt, promptDismissed, turnOnNotifications, usePushStatus } from "../lib/notifications";
import { IconBell } from "./Icons";
import InstallSteps from "./InstallSteps";

type Props = {
  // Remembers "Not now" separately for each place it's shown
  id: "deadlines" | "study-buddy";
  title: string;
  text: string;
};

// Asks to turn on notifications at a moment where they're clearly useful (the calendar once there are deadlines,
// study buddy while you wait for a match) rather than as soon as the app opens. The browser's own question only
// appears after "Turn on". Hidden when notifications are already on, can't work here, or after "Not now".
// iPhone and iPad in Safari: notifications only work from the Home Screen app, so the card says that instead
// and "Show me how" opens the steps.
function NotificationPrompt({ id, title, text }: Props) {
  const status = usePushStatus();
  const [dismissed, setDismissed] = useState(() => promptDismissed(id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showSteps, setShowSteps] = useState(false);

  if (dismissed || (status !== "off" && status !== "install-first")) return null;
  const installFirst = status === "install-first";

  async function turnOn() {
    setBusy(true);
    setError("");
    try {
      // Turns into "on" (prompt disappears) or "blocked" (also disappears; the Notifications sheet explains)
      await turnOnNotifications();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't turn on notifications.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="notice notice-info mb-4" role="region" aria-label="Notifications">
      <IconBell className="text-accent" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="muted text-sm">
          {installFirst ? "On iPhone and iPad, add Cohort to your Home Screen first, then turn them on there." : text}
        </p>
        {error && <p className="error-text mt-1">{error}</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          {installFirst ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowSteps(true)}>
              Show me how
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={turnOn}>
              {busy && <span className="spinner" />}
              Turn on
            </button>
          )}
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            onClick={() => {
              dismissPrompt(id);
              setDismissed(true);
            }}
          >
            Not now
          </button>
        </div>
      </div>
      {showSteps && <InstallSteps onClose={() => setShowSteps(false)} />}
    </div>
  );
}

export default NotificationPrompt;
