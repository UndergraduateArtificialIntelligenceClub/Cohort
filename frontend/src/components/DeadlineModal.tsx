import { useEffect, useId, useState } from "react";
import { CATEGORIES, type Category, type Deadline } from "../types";
import { isPersonal, normalizeCourse } from "../lib/courses";
import { IconCheck, IconX } from "./Icons";

// Popup for one date on the calendar: issue #59, plus adding your own dates.
// A saved one (it has an id): edit its fields, mark it done or undone, or delete it.
// A new one (no id): fill it in and add it. Either can be a school item or a personal one.
// The parent's handlers save to Supabase and throw on failure; the error is shown here.

// The fields the user can edit. Only these are sent on save.
// A personal item comes back as { course: null, category: "personal", weight: null }.
export type DeadlineChanges = Pick<Deadline, "course" | "title" | "date" | "time" | "category" | "weight">;

type Props = {
  deadline: Deadline;
  // The user's courses, offered as suggestions in the course box
  courses: string[];
  onClose: () => void;
  onSave: (changes: DeadlineChanges) => Promise<void>;
  // Only for saved ones
  onDone?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  // Saved school items: delete every date in this course at once. courseDates is how many there are
  // (this one included), so the choice is only offered when there's more than one.
  onDeleteCourse?: () => Promise<void>;
  courseDates?: number;
};

// The school fields, kept while the switch is on Personal so flipping back doesn't lose them
// time is "" when there isn't one (the time box's own empty value) and saved as null
type SchoolFields = { course: string; title: string; date: string; time: string; category: Category; weight: number | null };

const TITLE_MAX = 200;

// What's wrong with the form, or "" if it can be saved
function validate(fields: SchoolFields, personal: boolean): string {
  if (!personal && !fields.course.trim()) return "Course can't be empty.";
  if (!fields.title.trim()) return "Title can't be empty.";
  if (!fields.date) return "Pick a date.";
  if (!personal && fields.weight != null && (fields.weight < 0 || fields.weight > 100)) {
    return "Weight must be between 0 and 100.";
  }
  return "";
}

function DeadlineModal({ deadline, courses, onClose, onSave, onDone, onDelete, onDeleteCourse, courseDates = 0 }: Props) {
  const id = useId();
  const isNew = !deadline.id;
  const [personal, setPersonal] = useState(isPersonal(deadline));
  const [edited, setEdited] = useState<SchoolFields>({
    course: deadline.course ?? "",
    title: deadline.title,
    date: deadline.date,
    time: deadline.time ?? "",
    // A personal item switched to School starts as an assignment
    category: deadline.category === "personal" ? "assignment" : deadline.category,
    weight: deadline.weight ?? null,
  });
  const [showSource, setShowSource] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Delete was pressed on a course with other dates: the footer asks "just this one, or the whole course?"
  const [askDelete, setAskDelete] = useState(false);

  // Escape closes the popup, like clicking outside it. While asking about delete, it only backs out of that.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || busy) return;
      if (askDelete) setAskDelete(false);
      else onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, askDelete, onClose]);

  function update<K extends keyof SchoolFields>(field: K, value: SchoolFields[K]) {
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
    const problem = validate(edited, personal);
    if (problem) {
      setError(problem);
      return;
    }
    const title = edited.title.trim();
    const time = edited.time || null;
    run(() =>
      onSave(
        personal
          ? { course: null, title, date: edited.date, time, category: "personal", weight: null }
          : { ...edited, course: normalizeCourse(edited.course), title, time }
      )
    );
  }

  // Uses the saved course, not the one being edited in the box, since that's the course whose dates get deleted
  const canDeleteCourse = !!onDeleteCourse && !isPersonal(deadline) && courseDates > 1;

  function remove() {
    if (canDeleteCourse) {
      setError("");
      setAskDelete(true);
      return;
    }
    if (!onDelete || !window.confirm(`Delete "${deadline.title}"? This can't be undone.`)) return;
    run(onDelete);
  }

  const heading = isNew ? "Add a date" : personal ? "Personal date" : "Deadline details";
  // An exam's time is when it starts; anything else school is when it's due
  const timeFieldLabel = personal ? "Time" : edited.category === "midterm" || edited.category === "final" ? "Start time" : "Due time";

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
            {heading}
          </h2>
          <button type="button" className="icon-btn" disabled={busy} onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>

        {/* Personal items have no course, so study buddy and the course library never see them */}
        <div className="seg mb-1" role="group" aria-label="What kind of date">
          <button type="button" aria-pressed={!personal} onClick={() => setPersonal(false)}>
            School
          </button>
          <button type="button" aria-pressed={personal} onClick={() => setPersonal(true)}>
            Personal
          </button>
        </div>
        <p className="muted text-sm mb-3">
          {personal
            ? "Anything else you want on your calendar. Only you see it."
            : "A deadline or exam for one of your courses."}
        </p>

        <div className="fields">
          {!personal && (
            <label className="field field-wide">
              <span className="field-label">Course</span>
              <input
                className="input"
                value={edited.course}
                list={`${id}-courses`}
                placeholder="e.g. CMPUT 174"
                maxLength={50}
                onChange={(e) => update("course", e.target.value)}
              />
              <datalist id={`${id}-courses`}>
                {courses.map((course) => (
                  <option key={course} value={course} />
                ))}
              </datalist>
            </label>
          )}
          <label className="field field-wide">
            <span className="field-label">Title</span>
            <input
              className="input"
              value={edited.title}
              placeholder={personal ? "e.g. Dentist" : "e.g. Quiz 4"}
              maxLength={TITLE_MAX}
              // A new one starts here: the date is usually already picked from the calendar
              autoFocus={isNew}
              onChange={(e) => update("title", e.target.value)}
            />
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
          <label className="field">
            <span className="field-label">
              {timeFieldLabel} <span className="muted font-normal">(optional)</span>
            </span>
            <input
              className="input"
              type="time"
              value={edited.time}
              onChange={(e) => update("time", e.target.value)}
            />
          </label>

          {!personal && (
            <>
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
            </>
          )}
        </div>

        {/* Only parsed deadlines have a sentence from the syllabus */}
        {deadline.source_text && (
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
        )}

        {error && <p className="notice notice-error mt-4">{error}</p>}

        <div className="modal-actions">
          {askDelete && onDelete && onDeleteCourse ? (
            <>
              <p className="w-full text-sm">
                Delete just <strong>{deadline.title}</strong>, or all {courseDates} {deadline.course} dates? This can't
                be undone.
              </p>
              <span className="flex-1" />
              <button type="button" disabled={busy} className="btn btn-quiet" onClick={() => setAskDelete(false)}>
                Cancel
              </button>
              <button type="button" disabled={busy} className="btn" onClick={() => run(onDelete)}>
                Just this one
              </button>
              <button type="button" disabled={busy} className="btn btn-danger" onClick={() => run(onDeleteCourse)}>
                {busy ? "Deleting..." : `Delete all ${courseDates}`}
              </button>
            </>
          ) : isNew ? (
            <>
              <span className="flex-1" />
              <button type="button" disabled={busy} className="btn" onClick={onClose}>
                Cancel
              </button>
              <button type="button" disabled={busy} className="btn btn-primary" onClick={save}>
                {busy ? "Adding..." : "Add"}
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy} className="btn btn-quiet btn-danger-text" onClick={remove}>
                Delete
              </button>
              <span className="flex-1" />
              {onDone && (
                <button type="button" disabled={busy} className="btn" onClick={() => run(onDone)}>
                  <IconCheck />
                  {deadline.done ? "Mark undone" : "Mark done"}
                </button>
              )}
              <button type="button" disabled={busy} className="btn btn-primary" onClick={save}>
                {busy ? "Saving..." : "Save changes"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default DeadlineModal;
