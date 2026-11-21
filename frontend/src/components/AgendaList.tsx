import { useState, type CSSProperties } from "react";
import type { Deadline } from "../types";
import { loadDismissed, saveDismissed } from "../lib/finishAsk";
import { courseCount, daysUntil, longDate, makeForecast, makePlan, weekLabel } from "../lib/planner";
import { IconCheck, IconChevronRight } from "./Icons";

// The calendar on phones (Calendar.tsx shows this in List view): the same Next up, Did you finish? and
// hell week as the desktop sidebar (CalendarSidebar.tsx), then every upcoming deadline grouped by day.
// The rules live in lib/planner.ts; this file only draws them.

type Props = {
  deadlines: Deadline[];
  courseColors: Record<string, string>;
  today: string;
  onOpen: (d: Deadline) => void; // open the deadline sheet
  onToggleDone: (d: Deadline) => void;
  onShowWeek: (start: string) => void; // switch to Month view on that week
};

// Deadlines further out than this wait behind "Show later deadlines", so the list stays short
const SOON_DAYS = 14;

const courseVar = (color: string | undefined) => ({ "--c": color }) as CSSProperties;

function countdown(date: string, today: string): string {
  const days = daysUntil(date, today);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

// Group heading: "Today", "Tomorrow", then "Mon, Nov 23"
function dayHeading(date: string, today: string): string {
  const days = daysUntil(date, today);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return longDate(date);
}

const byDate = (a: Deadline, b: Deadline) => a.date.localeCompare(b.date) || a.course.localeCompare(b.course);

type RowProps = {
  deadline: Deadline;
  color: string | undefined;
  onOpen: (d: Deadline) => void;
  onToggleDone: (d: Deadline) => void;
};

// One deadline: a big tick circle on the left, the rest opens it. Also used under the month grid.
export function AgendaRow({ deadline: d, color, onOpen, onToggleDone }: RowProps) {
  return (
    <li className={`ag-row${d.done ? " is-done" : ""}`} style={courseVar(color)}>
      <button
        type="button"
        className="ag-tick"
        onClick={() => onToggleDone(d)}
        aria-pressed={!!d.done}
        aria-label={`${d.done ? "Mark not done" : "Mark done"}: ${d.course} ${d.title}`}
      >
        <span>{d.done && <IconCheck size={14} />}</span>
      </button>
      <button type="button" className="ag-main" onClick={() => onOpen(d)}>
        <span className="ag-title">{d.title}</span>
        <span className="ag-meta">
          <i className="dot" />
          {d.course}
          {d.weight != null && ` · ${d.weight}%`}
        </span>
      </button>
    </li>
  );
}

function AgendaList({ deadlines, courseColors, today, onOpen, onToggleDone, onShowWeek }: Props) {
  const [dismissed, setDismissed] = useState(loadDismissed);
  const [showLater, setShowLater] = useState(false);

  const plan = makePlan(deadlines, today, dismissed);
  const { hell, startEarly } = makeForecast(deadlines, today);
  const hero = plan.nextUp;

  // Everything still to come (done ones stay in place, crossed out), apart from the Next up card
  const upcoming = deadlines.filter((d) => daysUntil(d.date, today) >= 0 && d !== hero).sort(byDate);
  const soon = upcoming.filter((d) => daysUntil(d.date, today) < SOON_DAYS);
  const shown = showLater ? upcoming : soon;
  const groups: { date: string; items: Deadline[] }[] = [];
  for (const d of shown) {
    const last = groups[groups.length - 1];
    if (last?.date === d.date) last.items.push(d);
    else groups.push({ date: d.date, items: [d] });
  }

  function dismiss(d: Deadline) {
    if (!d.id) return;
    const next = new Set(dismissed).add(d.id);
    setDismissed(next);
    saveDismissed(next);
  }

  const row = (d: Deadline) => (
    <AgendaRow
      key={d.id ?? `${d.course}-${d.title}-${d.date}`}
      deadline={d}
      color={courseColors[d.course]}
      onOpen={onOpen}
      onToggleDone={onToggleDone}
    />
  );

  return (
    <div className="agenda">
      {/* ---------- Hell week coming up ---------- */}
      {hell && (
        <button type="button" className="ag-hell" onClick={() => onShowWeek(hell.start)}>
          <span className="ag-hell-text">
            <span className="ag-hell-head">
              <span className="hell-tag">Hell week</span>
              <strong>{weekLabel(hell.start)}</strong>
            </span>
            <span className="muted">
              {hell.items.length} due across {courseCount(hell.items)} course{courseCount(hell.items) === 1 ? "" : "s"}
              {startEarly && ` · biggest: ${startEarly.title}`}
            </span>
          </span>
          <IconChevronRight size={20} className="text-ink-2" />
        </button>
      )}

      {/* ---------- Next up ---------- */}
      <section className="ag-sec" aria-labelledby="ag-next">
        <h2 id="ag-next" className="ag-h">
          Next up
        </h2>
        {hero ? (
          <div className="ag-hero" style={courseVar(courseColors[hero.course])}>
            <span className="ag-meta">
              <i className="dot" />
              {hero.course}
            </span>
            <button type="button" className="ag-hero-title" onClick={() => onOpen(hero)}>
              {hero.title}
            </button>
            <p className="ag-hero-when">
              <strong>{countdown(hero.date, today)}</strong> · {longDate(hero.date)}
              {hero.weight != null && ` · ${hero.weight}% of grade`}
            </p>
            <div className="ag-hero-actions">
              <button type="button" className="btn btn-primary btn-lg flex-1" onClick={() => onToggleDone(hero)}>
                <IconCheck />
                Mark done
              </button>
              <button type="button" className="btn btn-lg" onClick={() => onOpen(hero)}>
                Details
              </button>
            </div>
          </div>
        ) : (
          <div className="ag-calm">
            <p className="font-semibold">
              {upcoming.length ? "Nothing due in the next few days." : "You're all caught up."}
            </p>
            {!upcoming.length && <p className="muted">Nothing left to do. Add a syllabus from Upload.</p>}
          </div>
        )}
      </section>

      {/* ---------- Did you finish? (unticked deadlines 1–3 days late) ---------- */}
      {plan.askFinished.length > 0 && (
        <section className="ag-sec" aria-labelledby="ag-ask">
          <h2 id="ag-ask" className="ag-h">
            Did you finish?
          </h2>
          <ul className="ag-list">
            {plan.askFinished.map((d) => (
              <li key={d.id} className="ag-ask" style={courseVar(courseColors[d.course])}>
                <button type="button" className="ag-main" onClick={() => onOpen(d)}>
                  <span className="ag-title">{d.title}</span>
                  <span className="ag-meta">
                    <i className="dot" />
                    {d.course} · {longDate(d.date)}
                  </span>
                </button>
                <button type="button" className="btn" onClick={() => onToggleDone(d)}>
                  Yes
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => dismiss(d)}>
                  No
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- Everything coming up, by day ---------- */}
      {groups.map((g) => (
        <section key={g.date} className="ag-sec" aria-label={dayHeading(g.date, today)}>
          <h2 className="ag-h">{dayHeading(g.date, today)}</h2>
          <ul className="ag-list">{g.items.map(row)}</ul>
        </section>
      ))}
      {hero && upcoming.length === 0 && <p className="muted">Nothing else coming up.</p>}
      {!showLater && upcoming.length > soon.length && (
        <button type="button" className="btn btn-lg btn-block" onClick={() => setShowLater(true)}>
          Show later deadlines ({upcoming.length - soon.length})
        </button>
      )}
    </div>
  );
}

export default AgendaList;
