import { useEffect, useId, useState } from "react";
import { CATEGORIES, type Deadline } from "../types";
import { normalizeCourse } from "../lib/courses";
import { IconCheck, IconX } from "./Icons";

// Popup for one saved deadline on the calendar: issue #59
// Edit its fields, mark it done or undone, or delete it.
// The parent's handlers save to Supabase and throw on failure; the error is shown here.

// The fields the user can edit. Only these are sent on save.
export type DeadlineChanges = Pick<Deadline, "course" | "title" | "date" | "category" | "weight">;

type Props = {
  deadline: Deadline;
  onClose: () => void;
  onDone: () => Promise<void>;
  onDelete: () => Promise<void>;
  onSave: (changes: DeadlineChanges) => Promise<void>;
};

// What's wrong with the edits, or "" if they can be saved
function validate(changes: DeadlineChanges): string {
  if (!changes.course.trim()) return "Course can't be empty.";
  if (!changes.title.trim()) return "Title can't be empty.";
  if (!changes.date) return "Pick a date.";
  if (changes.weight != null && (changes.weight < 0 || changes.weight > 100)) {
    return "Weight must be between 0 and 100.";
  }
  return "";
}

function DeadlineModal({ deadline, onClose, onDone, onDelete, onSave }: Props) {
  const id = useId();
  const [edited, setEdited] = useState<DeadlineChanges>({
    course: deadline.course,
    title: deadline.title,
    date: deadline.date,
    category: deadline.category,
    weight: deadline.weight ?? null,
  });
  const [showSource, setShowSource] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Escape closes the popup, like clicking outside it
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  function update<K extends keyof DeadlineChanges>(field: K, value: DeadlineChanges[K]) {
    setEdited({ ...edited, [field]: value });
  }

  // Run one Supabase action, disabling the buttons until it finishes and showing any error
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const problem = validate(edited);
    if (problem) {
      setError(problem);
      return;
    }
    run(() => onSave({ ...edited, course: normalizeCourse(edited.course), title: edited.title.trim() }));
  }

  function remove() {
    if (!window.confirm(`Delete "${deadline.title}"? This can't be undone.`)) return;
    run(onDelete);
  }

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-heading`}
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={`${id}-heading`} className="modal-title">
            Deadline details
          </h2>
          <button type="button" className="icon-btn" disabled={busy} onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>

        <div className="fields">
          <label className="field field-wide">
            <span className="field-label">Course</span>
            <input className="input" value={edited.course} onChange={(e) => update("course", e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Title</span>
            <input className="input" value={edited.title} onChange={(e) => update("title", e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Date</span>
            <input
              className="input"
              type="date"
              value={edited.date}
              onChange={(e) => update("date", e.target.value)}
            />
          </label>

          {/* A fieldset, not a label: clicking a label clicks the first button inside it */}
          <fieldset className="field field-wide">
            <legend className="field-label mb-1">Category</legend>
            <div className="chips">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  aria-pressed={edited.category === category}
                  className="chip"
                  onClick={() => update("category", category)}
                >
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="field field-wide">
            <span className="field-label">Weight (%)</span>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              placeholder="Unknown"
              value={edited.weight ?? ""}
              // An empty box means the weight is unknown
              onChange={(e) => update("weight", e.target.value === "" ? null : Number(e.target.value))}
            />
          </label>
        </div>

        <div className="mt-4">
          <button type="button" className="btn btn-quiet btn-sm -ml-2" onClick={() => setShowSource(!showSource)}>
            {showSource ? "Hide extracted text" : "Show extracted text"}
          </button>
          {showSource && (
            <figure className="quote mt-2">
              <figcaption>From the syllabus</figcaption>
              <blockquote>{deadline.source_text}</blockquote>
            </figure>
          )}
        </div>

        {error && <p className="notice notice-error mt-4">{error}</p>}

        <div className="modal-actions">
          <button type="button" disabled={busy} className="btn btn-quiet btn-danger-text" onClick={remove}>
            Delete
          </button>
          <span className="flex-1" />
          <button type="button" disabled={busy} className="btn" onClick={() => run(onDone)}>
            <IconCheck />
            {deadline.done ? "Mark undone" : "Mark done"}
          </button>
          <button type="button" disabled={busy} className="btn btn-primary" onClick={save}>
            {busy ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeadlineModal;
