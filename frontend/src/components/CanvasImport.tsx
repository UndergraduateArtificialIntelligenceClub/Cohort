// Import from Canvas panel on the Upload page (#62). Brings in every upcoming due date from all of a
// student's courses at once, then hands them to the same review popup a syllabus upload uses.
import { useId, useState, type FormEvent } from "react";
import { importCanvas } from "../lib/canvas";
import type { Deadline } from "../types";
import { IconAlert, IconArrowRight, IconCalendar, IconInfo } from "./Icons";

type Props = {
  disabled: boolean;
  onImported: (deadlines: Deadline[]) => void;
};

function CanvasImport({ disabled, onImported }: Props) {
  const id = useId();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "error" | "info" } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const deadlines = await importCanvas(url);
      if (deadlines.length === 0) {
        setMessage({ text: "Your Canvas calendar has no upcoming due dates right now.", kind: "info" });
        return;
      }
      // Don't keep the private link on screen once it's been used
      setUrl("");
      onImported(deadlines);
    } catch (err) {
      const text =
        err instanceof TypeError
          ? "Couldn't reach the server. Is the backend running?"
          : err instanceof Error
            ? err.message
            : "Something went wrong.";
      setMessage({ text, kind: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby={`${id}-heading`} className="panel canvas">
      <div>
        <h2 id={`${id}-heading`} className="section-title canvas-title">
          <IconCalendar size={18} className="text-accent" />
          Import from Canvas
        </h2>
        <p className="muted canvas-sub">
          Paste your Canvas calendar feed link to bring in the upcoming due dates from all your courses at once.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="canvas-form">
        <label htmlFor={`${id}-url`} className="sr-only">
          Canvas calendar feed link
        </label>
        <input
          id={`${id}-url`}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://canvas.ualberta.ca/feeds/calendars/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="input"
        />
        <button type="submit" disabled={disabled || loading || !url.trim()} className="btn">
          {loading ? (
            <>
              <span className="spinner" /> Importing
            </>
          ) : (
            <>
              Import <IconArrowRight />
            </>
          )}
        </button>
      </form>

      {message && (
        <div className={`notice ${message.kind === "error" ? "notice-error" : "notice-info"}`} role="status">
          {message.kind === "error" ? <IconAlert /> : <IconInfo />}
          <span>{message.text}</span>
        </div>
      )}

      <details className="canvas-help">
        <summary>Where do I find my link?</summary>
        <ol>
          <li>Open Canvas in a browser (the Canvas app doesn't show the link) and go to Calendar.</li>
          <li>Click Calendar Feed, under the list of calendars.</li>
          <li>Copy the link and paste it here.</li>
        </ol>
        <p className="muted">
          The link is private to you, so it's only used for this import and never saved. Canvas imports stay on your
          own calendar and aren't added to the course library.
        </p>
      </details>
    </section>
  );
}

export default CanvasImport;
