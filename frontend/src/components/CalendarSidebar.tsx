import { useState, type CSSProperties } from "react";
import { Link } from "react-router";
import type { Deadline } from "../types";
import { courseLabel, isPersonal } from "../lib/courses";
import { dayLabel, fullDate, longDate, makeAgenda, timeLabel } from "../lib/planner";
import { loadDismissed } from "../lib/finishAsk";
import { IconCheck } from "./Icons";

// The panel next to the calendar: one 7-day agenda, grouped by day. The rules live in
// lib/planner.ts (makeAgenda); this file only draws them. The heaviest week is shown on the grid itself.

type Props = {
  deadlines: Deadline[];
  courseColors: Record<string, string>;
  today: string;
  onOpen: (d: Deadline) => void; // open the deadline popup
  onToggleDone: (d: Deadline) => void;
  onHoverDate: (date: string | null) => void; // outline that day on the grid
};

// How many rows show before "N more by ...". One extra row is shown instead of a "1 more" link.
const ROW_CAP = 6;
// Worth this much of the grade or more: the weight is highlighted and a study buddy link is offered
const HEAVY_WEIGHT = 20;

const courseVar = (color: string | undefined) => ({ "--c": color }) as CSSProperties;

const isExam = (d: Deadline) => d.category === "midterm" || d.category === "final";
const isHeavy = (d: Deadline) => d.weight != null && d.weight >= HEAVY_WEIGHT;
const rowKey = (d: Deadline) => d.id ?? `${courseLabel(d)}-${d.title}-${d.date}`;

function summary(leftToday: number, later: number): string {
  if (leftToday === 0) return later === 0 ? "Nothing due in the next 7 days" : `Nothing left today · ${later} in the next 7 days`;
  return `${leftToday} left today · ${later === 0 ? "nothing else" : `${later} more`} in the next 7 days`;
}

function CalendarSidebar({ deadlines, courseColors, today, onOpen, onToggleDone, onHoverDate }: Props) {
  // "No" answers to "Did you finish?" on the phone list also hide those from Overdue here
  const [dismissed] = useState(loadDismissed);
  const [showAll, setShowAll] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const agenda = makeAgenda(deadlines, today, dismissed);

  // Cap the rows across all days, keeping their order
  const all = agenda.days.flatMap((day) => [...day.overdue, ...day.items]);
  const capped = !showAll && all.length > ROW_CAP + 1;
  const visible = new Set(capped ? all.slice(0, ROW_CAP) : all);
  const hidden = all.length - visible.size;
  const expandable = all.length > ROW_CAP + 1;

  // One deadline. Hovering outlines its day on the grid; clicking the title opens it.
  // withDay: the done list isn't grouped by day, so its rows name the day.
  const row = (d: Deadline, { overdue = false, withDay = false } = {}) => (
    <li
      key={rowKey(d)}
      className={`side-row${d.done ? " is-done" : ""}`}
      onMouseEnter={() => onHoverDate(d.date)}
      onMouseLeave={() => onHoverDate(null)}
    >
      <button
        type="button"
        className="tick"
        aria-label={`Mark ${d.title} ${d.done ? "not done" : "done"}`}
        onClick={() => onToggleDone(d)}
      >
        {d.done && <IconCheck size={14} />}
      </button>
      <div className="side-row-text">
        <div className="side-row-top">
          {overdue && <span className="side-tag">Overdue</span>}
          <button type="button" className="side-row-title" onClick={() => onOpen(d)} title={d.title}>
            {d.title}
          </button>
        </div>
        <p className="side-meta">
          <span className="side-course" style={courseVar(courseColors[courseLabel(d)])}>
            <i className="dot" />
            {courseLabel(d)}
          </span>
          {(overdue || withDay) && <span>{dayLabel(d.date, today)}</span>}
          {d.time && <span>{isExam(d) ? `Starts ${timeLabel(d.time)}` : timeLabel(d.time)}</span>}
          {d.weight != null && <span className={isHeavy(d) ? "side-heavy" : undefined}>{d.weight}% of grade</span>}
        </p>
        {/* Heavy ones are where a study partner helps most. Study buddy has no course filter, so this opens the tab. */}
        {isHeavy(d) && !d.done && !isPersonal(d) && (
          <Link to="/study-buddy" className="side-buddy">
            Find a study buddy in {courseLabel(d)} →
          </Link>
        )}
      </div>
    </li>
  );

  return (
    <aside className="side panel" aria-labelledby="side-title">
      <header className="side-head">
        <h2 id="side-title" className="side-title">
          {fullDate(today)}
        </h2>
        <p className="side-sub">{summary(agenda.leftToday, agenda.laterThisWeek)}</p>
      </header>

      {agenda.days.map((day, i) => {
        const overdue = day.overdue.filter((d) => visible.has(d));
        const items = day.items.filter((d) => visible.has(d));
        const empty = day.overdue.length + day.items.length === 0;
        // Today and tomorrow always show; a day whose rows are all past the cap is left for "N more"
        if (!empty && overdue.length + items.length === 0) return null;
        const label = i === 0 ? "Today" : longDate(day.date);
        return (
          <section key={day.date} className="side-day" aria-label={i === 0 ? `Today, ${longDate(day.date)}` : label}>
            <div className="side-day-head">
              <h3 className={`side-day-label${i === 0 ? " is-today" : ""}`}>{label}</h3>
              {empty && <span className="side-clear">Clear</span>}
            </div>
            {!empty && (
              <ul className={`rows${i === 0 ? " side-card" : ""}`}>
                {overdue.map((d) => row(d, { overdue: true }))}
                {items.map((d) => row(d))}
              </ul>
            )}
          </section>
        );
      })}

      {(expandable || agenda.done.length > 0) && (
        <footer className="side-foot">
          {expandable ? (
            <button type="button" className="side-link" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
              {capped ? `${hidden} more by ${longDate(all[all.length - 1].date)}` : "Show less"}
            </button>
          ) : (
            <span />
          )}
          {agenda.done.length > 0 && (
            <button
              type="button"
              className="side-done-toggle"
              aria-expanded={showDone}
              aria-controls="side-done"
              onClick={() => setShowDone((v) => !v)}
            >
              {agenda.done.length} done <span className="side-chev" aria-hidden="true">›</span>
            </button>
          )}
        </footer>
      )}
      {showDone && agenda.done.length > 0 && (
        <ul id="side-done" className="rows side-done" aria-label="Done in the next 7 days">
          {agenda.done.map((d) => row(d, { withDay: true }))}
        </ul>
      )}
    </aside>
  );
}

export default CalendarSidebar;
