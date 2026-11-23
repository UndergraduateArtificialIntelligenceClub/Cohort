import { useId, useState } from "react";
import { CATEGORIES, type Category, type Deadline } from "../types";
import { IconCheck } from "./Icons";

// Review popup shown on the upload page after parsing: issue #29
// Walks through each parsed deadline with its source_text so the user can edit, delete or confirm it.
// Everything stays in local state; saving to the database is a later issue.
type Props = {
  pending: Deadline[];
  onDone: (confirmed: Deadline[]) => void;
};

function ReviewPopup({ pending, onDone }: Props) {
  const id = useId();
  const [queue, setQueue] = useState(pending);
  const [confirmed, setConfirmed] = useState<Deadline[]>([]);
  const [total] = useState(pending.length);

  const current = queue[0];
  const reviewed = total - queue.length;

  function update<K extends keyof Deadline>(field: K, value: Deadline[K]) {
    setQueue([{ ...current, [field]: value }, ...queue.slice(1)]);
  }

  // Move past the current deadline, keeping it only if confirmed
  function next(keep: boolean) {
    const kept = keep ? [...confirmed, current] : confirmed;
    const rest = queue.slice(1);
    if (rest.length === 0) {
      onDone(kept);
      return;
    }
    setConfirmed(kept);
    setQueue(rest);
  }

  if (!current) {
    return (
      <div className="overlay">
        <div role="dialog" aria-modal="true" aria-labelledby={`${id}-empty`} className="modal max-w-[420px]">
          <h2 id={`${id}-empty`} className="modal-title">
            No deadlines found
          </h2>
          <p className="muted mt-2">We couldn't find any deadlines in that syllabus.</p>
          <div className="modal-actions justify-end">
            <button className="btn btn-primary" onClick={() => onDone([])}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay">
      <div role="dialog" aria-modal="true" aria-labelledby={`${id}-heading`} className="modal">
        <div className="modal-head mb-2">
          <h2 id={`${id}-heading`} className="modal-title">
            Review deadline
          </h2>
          <span className="muted text-xs tabular-nums">
            {reviewed + 1} of {total}
          </span>
        </div>
        <div className="progress mb-4" aria-hidden="true">
          <span style={{ width: `${(reviewed / total) * 100}%` }} />
        </div>

        <figure className="quote mb-4">
          <figcaption>From the syllabus</figcaption>
          <blockquote>{current.source_text}</blockquote>
        </figure>

        <div className="fields">
          <label className="field">
            <span className="field-label">Course</span>
            <input className="input" value={current.course ?? ""} onChange={(e) => update("course", e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Date</span>
            <input
              className="input"
              type="date"
              value={current.date}
              onChange={(e) => update("date", e.target.value)}
            />
          </label>
          <label className="field field-wide">
            <span className="field-label">Title</span>
            <input className="input" value={current.title} onChange={(e) => update("title", e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Category</span>
            <select
              className="input capitalize"
              value={current.category}
              onChange={(e) => update("category", e.target.value as Category)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Weight (%)</span>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              placeholder="Unknown"
              value={current.weight ?? ""}
              // An empty box means the weight is unknown, which the backend sends as null
              onChange={(e) => update("weight", e.target.value === "" ? null : Number(e.target.value))}
            />
          </label>
          <label className="field field-wide">
            <span className="field-label">Source text</span>
            <textarea
              className="input h-20"
              value={current.source_text ?? ""}
              onChange={(e) => update("source_text", e.target.value)}
            />
          </label>
        </div>

        <div className="modal-actions">
          <button className="btn btn-quiet btn-danger-text" onClick={() => next(false)}>
            Delete
          </button>
          <span className="flex-1" />
          <button className="btn" onClick={() => onDone([...confirmed, ...queue])}>
            Confirm all {queue.length}
          </button>
          <button className="btn btn-primary" onClick={() => next(true)}>
            <IconCheck />
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReviewPopup;
