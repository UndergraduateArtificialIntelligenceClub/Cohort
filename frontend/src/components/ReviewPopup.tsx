import { useId, useState } from "react";
import { CATEGORIES, type Category, type Deadline } from "../types";

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
      <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
        <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-lg bg-white p-6">
          <p>No deadlines found in that syllabus.</p>
          <button className="mt-4 rounded bg-blue-600 px-4 py-2 text-white" onClick={() => onDone([])}>
            Close
          </button>
        </div>
      </div>
    );
  }

  const inputClass = "w-full rounded border p-2";

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-heading`}
        className="flex max-h-full w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg bg-white p-6"
      >
        <div className="flex items-baseline justify-between">
          <h2 id={`${id}-heading`} className="text-xl font-bold">
            Review deadline
          </h2>
          <span className="text-sm text-gray-500">
            {reviewed + 1} of {total}
          </span>
        </div>

        <figure className="rounded border-l-4 border-blue-600 bg-gray-50 p-3">
          <figcaption className="text-sm text-gray-500">From the syllabus</figcaption>
          <blockquote className="mt-1 italic">{current.source_text}</blockquote>
        </figure>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            Course
            <input className={inputClass} value={current.course} onChange={(e) => update("course", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            Date
            <input
              className={inputClass}
              type="date"
              value={current.date}
              onChange={(e) => update("date", e.target.value)}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            Title
            <input className={inputClass} value={current.title} onChange={(e) => update("title", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            Category
            <select
              className={inputClass}
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
          <label className="flex flex-col gap-1">
            Weight (%)
            <input
              className={inputClass}
              type="number"
              min={0}
              max={100}
              placeholder="Unknown"
              value={current.weight ?? ""}
              // An empty box means the weight is unknown, which the backend sends as null
              onChange={(e) => update("weight", e.target.value === "" ? null : Number(e.target.value))}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            Source text
            <textarea
              className={`${inputClass} h-20`}
              value={current.source_text}
              onChange={(e) => update("source_text", e.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="rounded px-4 py-2 text-red-600 hover:bg-red-50" onClick={() => next(false)}>
            Delete
          </button>
          <span className="flex-1" />
          <button className="rounded border px-4 py-2" onClick={() => onDone([...confirmed, ...queue])}>
            Confirm all {queue.length}
          </button>
          <button className="rounded bg-blue-600 px-4 py-2 text-white" onClick={() => next(true)}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReviewPopup;
