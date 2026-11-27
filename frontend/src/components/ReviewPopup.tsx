import { useEffect, useId, useState } from "react";
import { CATEGORIES, type Category, type Deadline, type UndatedItem } from "../types";
import { mentionsCourse, normalizeCourse } from "../lib/courses";
import { libraryCourses } from "../lib/library";
import { bySchedule, longDate, timeLabel, todayISO } from "../lib/planner";
import { IconAlert, IconCheck, IconX } from "./Icons";

// Review popup shown on the upload page after parsing (#29), now one summary screen instead of a step per deadline.
// The parser is nearly always right, so each course is shown at a glance: what was found, warnings only when
// something needs a look, and the full list folded away for removing a wrong one. Each deadline's sentence from
// the syllabus is still one click away on the calendar (DeadlineModal). Nothing is saved here; Upload.tsx saves.
type Props = {
  deadlines: Deadline[];
  undated: UndatedItem[];
  source: "syllabus" | "canvas" | "library";
  // The syllabus that was read, to check a course name the student typed. null for Canvas and the library.
  syllabusText: string | null;
  // parsed: the deadlines kept, renamed to the course name in the header. added: undated items the student gave a
  // date, kept apart because the date is theirs, not the syllabus's, so it isn't shared to the course library.
  onDone: (parsed: Deadline[], added: Deadline[]) => void;
  onCancel: () => void;
};

// A weight total this close to 100% is shown as reassurance that everything was found. Further off it's left out,
// not warned about: syllabi often give per-category weights or best-of-N, so the sum alone means little.
const TOTAL_SLACK = 5;
// Same limit as the CHECK on shared_syllabi.course
const COURSE_MAX = 50;

const NAMES: Record<Category, [string, string]> = {
  assignment: ["assignment", "assignments"],
  lab: ["lab", "labs"],
  quiz: ["quiz", "quizzes"],
  midterm: ["midterm", "midterms"],
  final: ["final", "finals"],
  other: ["other item", "other items"],
};

const HEADINGS: Record<Props["source"], string> = {
  syllabus: "Found in your syllabus",
  canvas: "Found in Canvas",
  library: "From the course library",
};

// One course's items. i is the item's place in the deadlines or undated prop, so removing and dating can use it.
type Group = {
  course: string; // normalized, as found
  dated: { i: number; d: Deadline }[];
  undated: { i: number; u: UndatedItem }[];
};

function groupByCourse(deadlines: Deadline[], undated: UndatedItem[]): Group[] {
  const groups = new Map<string, Group>();
  const group = (course: string | null) => {
    const key = normalizeCourse(course ?? "");
    if (!groups.has(key)) groups.set(key, { course: key, dated: [], undated: [] });
    return groups.get(key)!;
  };
  deadlines.forEach((d, i) => group(d.course).dated.push({ i, d }));
  undated.forEach((u, i) => group(u.course).undated.push({ i, u }));
  for (const g of groups.values()) g.dated.sort((a, b) => bySchedule(a.d, b.d));
  return [...groups.values()];
}

const plural = (n: number, [one, many]: [string, string]) => `${n} ${n === 1 ? one : many}`;

// "8 labs · 4 assignments · 1 midterm", in the app's usual category order
function countLine(categories: Category[], separator = " · "): string {
  return CATEGORIES.flatMap((c) => {
    const n = categories.filter((x) => x === c).length;
    return n ? [plural(n, NAMES[c])] : [];
  }).join(separator);
}

// 6.666... (a third of 20%) shows as 6.7%
const percent = (weight: number) => `${Math.round(weight * 10) / 10}%`;

// "Weights add up to 95% of the grade. Missing 5%: 7 assignments have no weight." Naming what has no weight
// answers "where's the rest?" right away. Over 100% (bonus marks) just gives the total.
function offTotal(total: number, unweighted: Category[]): string {
  const line = `Weights add up to ${percent(total)} of the grade.`;
  if (total > 100) return line;
  const missing = `${line} Missing ${percent(100 - total)}`;
  if (unweighted.length === 0) return `${missing}.`;
  return `${missing}: ${countLine(unweighted, ", ")} ${unweighted.length === 1 ? "has" : "have"} no weight.`;
}

function ReviewPopup({ deadlines, undated, source, syllabusText, onDone, onCancel }: Props) {
  const id = useId();
  const [groups] = useState(() => groupByCourse(deadlines, undated));
  // Course name boxes, by the course as found
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.map((g) => [g.course, g.course]))
  );
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  // Undated items with the date box open, by place in `undated`. "" until a date is picked.
  const [dates, setDates] = useState<Record<number, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState("");
  const today = todayISO();

  // Course name suggestions are a bonus: if the library can't be reached, the box just has none
  useEffect(() => {
    let live = true;
    libraryCourses()
      .then((courses) => live && setSuggestions(courses))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  function toggle<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function skipUndated(i: number) {
    const rest = { ...dates };
    delete rest[i];
    setDates(rest);
  }

  // What each course would save right now
  const summaries = groups.map((g) => {
    const kept = g.dated.filter(({ i }) => !removed.has(i)).map(({ d }) => d);
    const added = g.undated.filter(({ i }) => dates[i]).map(({ u }) => u);
    // Undated items count toward the total even when skipped: they're still part of the grade
    const graded = [...kept, ...g.undated.map(({ u }) => u)];
    const weights = graded.map((x) => x.weight);
    const total = weights.reduce<number>((sum, w) => sum + (w ?? 0), 0);
    const name = normalizeCourse(names[g.course] ?? "");
    return {
      kept,
      added,
      count: kept.length + added.length,
      categories: [...kept, ...added].map((x) => x.category as Category),
      showTotal: weights.some((w) => w != null) && Math.abs(total - 100) <= TOTAL_SLACK,
      total,
      // Split weights are rounded (5% over 7 dates is 0.71 each), so 99.97% counts as all of it
      complete: Math.round(total * 10) / 10 === 100,
      // When the total falls short, these are the likely reason, so the student knows what to look at
      unweighted: graded.filter((x) => x.weight == null).map((x) => x.category as Category),
      allPast: kept.length > 0 && kept.every((d) => d.date < today),
      // Soft warning only: a typo is likely, but the syllabus could spell the code some other way
      notInSyllabus: !!syllabusText && !!name && name !== g.course && !mentionsCourse(syllabusText, name),
    };
  });
  const total = summaries.reduce((sum, s) => sum + s.count, 0);

  function confirm() {
    const parsed: Deadline[] = [];
    const added: Deadline[] = [];
    for (const [n, g] of groups.entries()) {
      const course = normalizeCourse(names[g.course] ?? "");
      const s = summaries[n];
      if (s.count === 0) continue;
      if (!course) {
        setError("Every course needs a name.");
        return;
      }
      if (course.length > COURSE_MAX) {
        setError(`"${course.slice(0, 20)}..." is too long for a course name.`);
        return;
      }
      parsed.push(...s.kept.map((d) => ({ ...d, course })));
      added.push(
        ...g.undated
          .filter(({ i }) => dates[i])
          .map(({ i, u }) => ({
            course,
            title: u.title,
            date: dates[i],
            time: null,
            category: u.category,
            source_text: u.source_text,
            weight: u.weight ?? null,
          }))
      );
    }
    onDone(parsed, added);
  }

  if (groups.length === 0) {
    return (
      <div className="overlay">
        <div role="dialog" aria-modal="true" aria-labelledby={`${id}-empty`} className="modal max-w-[420px]">
          <h2 id={`${id}-empty`} className="modal-title">
            No deadlines found
          </h2>
          <p className="muted mt-2">We couldn't find any deadlines in that syllabus.</p>
          <div className="modal-actions justify-end">
            <button className="btn btn-primary" onClick={onCancel}>
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
        <div className="modal-head mb-1">
          <h2 id={`${id}-heading`} className="modal-title">
            {HEADINGS[source]}
          </h2>
        </div>
        <p className="muted text-sm mb-4">Check the course name, then add them. You can change any date later on the calendar.</p>

        <datalist id={`${id}-courses`}>
          {suggestions.map((course) => (
            <option key={course} value={course} />
          ))}
        </datalist>

        {groups.map((g, n) => {
          const s = summaries[n];
          const listId = `${id}-list-${n}`;
          const open = expanded.has(g.course);
          return (
            <section key={g.course} className="review-course">
              <div className="review-course-head">
                <label className="field review-course-field">
                  <span className="field-label">Course</span>
                  <input
                    className="input review-course-name"
                    value={names[g.course] ?? ""}
                    list={`${id}-courses`}
                    placeholder="e.g. CMPUT 174"
                    maxLength={COURSE_MAX}
                    onChange={(e) => setNames({ ...names, [g.course]: e.target.value })}
                    // Show the name the way it will be saved ("cmput174" -> "CMPUT 174")
                    onBlur={(e) => setNames({ ...names, [g.course]: normalizeCourse(e.target.value) })}
                  />
                </label>
                <span className="review-count">{plural(s.count, ["deadline", "deadlines"])}</span>
              </div>

              {s.count > 0 && <p className="review-counts">{countLine(s.categories)}</p>}
              {s.showTotal &&
                (s.complete ? (
                  <p className="review-total">
                    <IconCheck size={14} />
                    Weights add up to 100% of the grade
                  </p>
                ) : (
                  <p className="review-total is-off">{offTotal(s.total, s.unweighted)}</p>
                ))}

              {(s.notInSyllabus || s.allPast || g.undated.length > 0) && (
                <ul className="review-warnings">
                  {s.notInSyllabus && (
                    <li className="notice notice-warn">
                      <IconAlert />
                      <span>
                        "{normalizeCourse(names[g.course] ?? "")}" doesn't appear in the syllabus. Check the course code.
                      </span>
                    </li>
                  )}
                  {s.allPast && (
                    <li className="notice notice-warn">
                      <IconAlert />
                      <span>Every date here is in the past. Is this an old syllabus?</span>
                    </li>
                  )}
                  {g.undated.map(({ i, u }) => (
                    <li key={i} className="notice notice-warn">
                      <IconAlert />
                      <div className="review-warn-body">
                        <p>
                          <strong>{u.title}</strong>
                          {u.weight != null && ` (${percent(u.weight)})`} has no date{u.category === "final" ? " yet" : ""}.
                          {u.category === "final" && (
                            <span className="muted"> Final exam dates usually come out partway through the term.</span>
                          )}
                        </p>
                        {i in dates ? (
                          <div className="review-warn-actions">
                            <input
                              className="input"
                              type="date"
                              value={dates[i]}
                              aria-label={`Date for ${u.title}`}
                              autoFocus
                              onChange={(e) => setDates({ ...dates, [i]: e.target.value })}
                            />
                            <button type="button" className="btn btn-quiet btn-sm" onClick={() => skipUndated(i)}>
                              Skip
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm review-warn-add"
                            onClick={() => setDates({ ...dates, [i]: "" })}
                          >
                            Add a date
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {g.dated.length > 0 && (
                <>
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm review-toggle"
                    aria-expanded={open}
                    aria-controls={listId}
                    onClick={() => setExpanded(toggle(expanded, g.course))}
                  >
                    {open ? "Hide the list" : `Show all ${g.dated.length}`}
                  </button>
                  {open && (
                    <ul id={listId} className="review-list">
                      {g.dated.map(({ i, d }) => {
                        const gone = removed.has(i);
                        const meta = [
                          longDate(d.date),
                          d.time && timeLabel(d.time),
                          d.weight != null && percent(d.weight),
                          d.category.charAt(0).toUpperCase() + d.category.slice(1),
                        ].filter(Boolean);
                        return (
                          <li key={i} className={`review-row${gone ? " is-removed" : ""}`}>
                            <div className="review-row-main">
                              <span className="review-row-title">{d.title}</span>
                              <span className="review-row-meta">{meta.join(" · ")}</span>
                            </div>
                            {gone ? (
                              <button
                                type="button"
                                className="btn btn-quiet btn-sm"
                                onClick={() => setRemoved(toggle(removed, i))}
                              >
                                Undo
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="icon-btn"
                                aria-label={`Remove ${d.title}`}
                                onClick={() => setRemoved(toggle(removed, i))}
                              >
                                <IconX />
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}
            </section>
          );
        })}

        {error && <p className="notice notice-error mt-4">{error}</p>}

        <div className="modal-actions">
          <span className="flex-1" />
          <button type="button" className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={total === 0} onClick={confirm}>
            <IconCheck />
            {total === 0 ? "Nothing to add" : `Add ${total} to calendar`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReviewPopup;
