import { useEffect, useId, useState } from "react";
import { CATEGORIES, type Deadline } from "../types";

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
    run(() => onSave({ ...edited, course: edited.course.trim(), title: edited.title.trim() }));
  }

  function remove() {
    if (!window.confirm(`Delete "${deadline.title}"? This can't be undone.`)) return;
    run(onDelete);
  }

  const inputClass = "w-full rounded border p-2";

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4" onClick={busy ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-heading`}
        className="flex max-h-full w-full max-w-md flex-col gap-4 overflow-y-auto rounded-lg bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={`${id}-heading`} className="text-xl font-bold">
          Deadline details
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 flex flex-col gap-1">
            Course
            <input className={inputClass} value={edited.course} onChange={(e) => update("course", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            Title
            <input className={inputClass} value={edited.title} onChange={(e) => update("title", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            Date
            <input
              className={inputClass}
              type="date"
              value={edited.date}
              onChange={(e) => update("date", e.target.value)}
            />
          </label>

          {/* A fieldset, not a label: clicking a label clicks the first button inside it */}
          <fieldset className="col-span-2 flex flex-col gap-1">
            <legend className="mb-1">Category</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  aria-pressed={edited.category === category}
                  className={`rounded border px-2 py-2 text-sm ${
                    edited.category === category
                      ? "bg-black text-white"
                      : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                  }`}
                  onClick={() => update("category", category)}
                >
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="col-span-2 flex flex-col gap-1">
            Weight (%)
            <input
              className={inputClass}
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

        <div>
          <button type="button" className="text-sm text-gray-600 underline" onClick={() => setShowSource(!showSource)}>
            {showSource ? "Hide extracted text" : "Show extracted text"}
          </button>
          {showSource && <p className="mt-2 rounded bg-gray-100 p-3 text-sm">{deadline.source_text}</p>}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            className="rounded bg-green-600 px-3 py-2 text-white hover:bg-green-700 disabled:opacity-50"
            onClick={() => run(onDone)}
          >
            {deadline.done ? "Mark undone" : "Mark done"}
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded bg-red-600 px-3 py-2 text-white hover:bg-red-700 disabled:opacity-50"
            onClick={remove}
          >
            Delete
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded bg-blue-600 px-3 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={save}
          >
            {busy ? "Saving..." : "Save changes"}
          </button>
          <span className="flex-1" />
          <button
            type="button"
            disabled={busy}
            className="rounded border border-gray-300 px-3 py-2 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default DeadlineModal;
