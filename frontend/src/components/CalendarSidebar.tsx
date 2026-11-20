import { useState, type CSSProperties, type ReactNode } from "react";
import type { Deadline } from "../types";
import {
  courseCount,
  dayLabel,
  daysUntil,
  longDate,
  makeForecast,
  makePlan,
  weekLabel,
  weekStart,
  weightLabel,
  weightOf,
  type Week,
} from "../lib/planner";

// The panel next to the calendar: Next up, This week, and the Crunch forecast (hell week).
// The rules live in lib/planner.ts; this file only draws them.

type Props = {
  deadlines: Deadline[];
  courseColors: Record<string, string>;
  today: string;
  onOpen: (d: Deadline) => void; // open the deadline popup
  onToggleDone: (d: Deadline) => void;
  onHoverDate: (date: string | null) => void; // outline that day on the grid
  onShowWeek: (start: string) => void; // move the grid to that week
};

// How many rows "This week" shows before "+N more"
const ROW_CAP = 5;

// "Did you finish?" answers of "No" are kept in this browser, so each late deadline is asked about once
const DISMISSED_KEY = "cohort:did-you-finish:dismissed";

function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

const courseVar = (color: string | undefined) => ({ "--c": color }) as CSSProperties;

function countdown(date: string, today: string): string {
  const days = daysUntil(date, today);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `In ${days} days`;
}

function CalendarSidebar({ deadlines, courseColors, today, onOpen, onToggleDone, onHoverDate, onShowWeek }: Props) {
  const [dismissed, setDismissed] = useState(loadDismissed);
  const [showAll, setShowAll] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const plan = makePlan(deadlines, today, dismissed);
  const forecast = makeForecast(deadlines, today);

  function dismiss(d: Deadline) {
    if (!d.id) return;
    const next = new Set(dismissed).add(d.id);
    setDismissed(next);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
  }

  // Course code next to the dot, so courses are told apart by more than color
  const course = (d: Deadline) => (
    <span className="side-course" style={courseVar(courseColors[d.course])}>
      <i className="dot" />
      {d.course}
    </span>
  );

  // One deadline in a list. Hovering outlines its day on the grid; clicking opens it.
  const row = (d: Deadline) => (
    <li
      key={d.id ?? `${d.course}-${d.title}-${d.date}`}
      className={`side-row${d.done ? " is-done" : ""}`}
      onMouseEnter={() => onHoverDate(d.date)}
      onMouseLeave={() => onHoverDate(null)}
    >
      <input
        type="checkbox"
        className="checkbox"
        checked={!!d.done}
        onChange={() => onToggleDone(d)}
        aria-label={`${d.done ? "Mark not done" : "Mark done"}: ${d.course} ${d.title}`}
      />
      <button type="button" className="side-row-main" onClick={() => onOpen(d)}>
        <span className="side-row-title">{d.title}</span>
        {course(d)}
      </button>
      <span className="side-row-when">
        {dayLabel(d.date, today)}
        {d.weight != null && <small>{d.weight}%</small>}
      </span>
    </li>
  );

  const shown = showAll ? plan.thisWeek : plan.thisWeek.slice(0, ROW_CAP);
  const hidden = plan.thisWeek.length - shown.length;

  return (
    <aside className="side panel" aria-label="Your week">
      {/* ---------- Next up ---------- */}
      <section className="side-sec">
        <h2 className="side-h">Next up</h2>
        {plan.nextUp ? (
          <div className="side-hero" style={courseVar(courseColors[plan.nextUp.course])}>
            {course(plan.nextUp)}
            <button type="button" className="side-hero-title" onClick={() => onOpen(plan.nextUp!)}>
              {plan.nextUp.title}
            </button>
            <p className="side-hero-meta">
              <strong>{countdown(plan.nextUp.date, today)}</strong>
              <span>{longDate(plan.nextUp.date)}</span>
              {plan.nextUp.weight != null && <span>{plan.nextUp.weight}% of grade</span>}
            </p>
            <button type="button" className="btn btn-sm mt-3" onClick={() => onToggleDone(plan.nextUp!)}>
              ✓ Mark done
            </button>
          </div>
        ) : (
          <div className="side-calm">
            <p className="side-calm-title">Nothing due in the next few days.</p>
            {plan.later ? (
              <p className="muted">
                Next:{" "}
                <button type="button" className="link-button" onClick={() => onOpen(plan.later!)}>
                  {plan.later.title}
                </button>{" "}
                ({plan.later.course}), {longDate(plan.later.date)}
              </p>
            ) : (
              <p className="muted">You're all caught up.</p>
            )}
          </div>
        )}
      </section>

      {/* ---------- Did you finish? (unticked deadlines 1–3 days late) ---------- */}
      {plan.askFinished.length > 0 && (
        <section className="side-sec side-ask" aria-label="Did you finish these?">
          <h2 className="side-h">Did you finish?</h2>
          <ul className="rows">
            {plan.askFinished.map((d) => (
              <li key={d.id} className="side-ask-row">
                <button type="button" className="side-row-main" onClick={() => onOpen(d)}>
                  <span className="side-row-title">{d.title}</span>
                  <span className="side-row-sub">
                    {course(d)} · {dayLabel(d.date, today)}
                  </span>
                </button>
                <button type="button" className="btn btn-sm" onClick={() => onToggleDone(d)}>
                  Yes
                </button>
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => dismiss(d)}>
                  No
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- This week ---------- */}
      <section className="side-sec">
        <div className="side-h-row">
          <h2 className="side-h">This week</h2>
          {plan.thisWeek.length > 0 && <span className="side-count">{plan.thisWeek.length}</span>}
        </div>
        {plan.thisWeek.length === 0 && (
          <p className="muted side-note">{plan.nextUp ? "Nothing else in the next 7 days." : "Nothing in the next 7 days."}</p>
        )}
        <ul className="rows">{shown.map(row)}</ul>
        {hidden > 0 && (
          <button type="button" className="side-more" onClick={() => setShowAll(true)}>
            +{hidden} more
          </button>
        )}
        {plan.doneThisWeek.length > 0 && (
          <>
            <button
              type="button"
              className="side-more"
              aria-expanded={showDone}
              onClick={() => setShowDone((v) => !v)}
            >
              ✓ {plan.doneThisWeek.length} done {showDone ? "▾" : "▸"}
            </button>
            {showDone && <ul className="rows">{plan.doneThisWeek.map(row)}</ul>}
          </>
        )}
      </section>

      {/* ---------- Crunch forecast ---------- */}
      {forecast.busiest && <Forecast forecast={forecast} today={today} course={course} onOpen={onOpen} onShowWeek={onShowWeek} />}
    </aside>
  );
}

type ForecastProps = {
  forecast: ReturnType<typeof makeForecast>;
  today: string;
  course: (d: Deadline) => ReactNode;
  onOpen: (d: Deadline) => void;
  onShowWeek: (start: string) => void;
};

function Forecast({ forecast, today, course, onOpen, onShowWeek }: ForecastProps) {
  const { weeks, busiest, hell, startEarly } = forecast;
  const focus = hell ?? busiest!;
  const max = Math.max(...weeks.map((w) => w.load));
  const listed = focus.items.slice(0, 4);
  const anyGuessed = listed.some((d) => weightOf(d).guessed);
  const thisWeek = weekStart(today);

  const barLabel = (w: Week) =>
    `${w.start === thisWeek ? "This week" : weekLabel(w.start)}: ${
      w.items.length === 0 ? "nothing due" : `${w.items.length} due across ${courseCount(w.items)} course${courseCount(w.items) === 1 ? "" : "s"}`
    }${w === hell ? " (hell week)" : ""}`;

  return (
    <section className="side-sec">
      <h2 className="side-h">Crunch forecast</h2>
      {/* Next 8 weeks, bar height = how heavy the week is compared with the others */}
      <div className="spark" role="group" aria-label="Load over the next 8 weeks">
        {weeks.map((w) => (
          <button
            key={w.start}
            type="button"
            className={`spark-bar${w === hell ? " is-hell" : ""}${w === focus ? " is-focus" : ""}`}
            title={barLabel(w)}
            aria-label={`${barLabel(w)}. Show on calendar`}
            onClick={() => onShowWeek(w.start)}
          >
            <span style={{ height: w.load === 0 ? 2 : `${Math.max(12, (w.load / max) * 100)}%` }} />
          </button>
        ))}
      </div>
      <div className="spark-axis">
        <span>This week</span>
        <span>+7 weeks</span>
      </div>

      <div className={`crunch${hell ? " is-hell" : ""}`}>
        <p className="crunch-title">
          {hell ? <span className="hell-tag">Hell week</span> : <span className="muted">No hell week coming up. Busiest:</span>}{" "}
          <button type="button" className="link-button" onClick={() => onShowWeek(focus.start)}>
            {focus.start === thisWeek ? "this week" : weekLabel(focus.start)}
          </button>
        </p>
        {/* Weights are per course, so they're shown per deadline and never added up into one percent */}
        <p className="crunch-sum">
          {focus.items.length} due across {courseCount(focus.items)} course{courseCount(focus.items) === 1 ? "" : "s"}
        </p>
        <ul className="rows crunch-list">
          {listed.map((d) => (
            <li key={d.id ?? `${d.course}-${d.title}`}>
              <button type="button" className={`crunch-item${d.done ? " is-done" : ""}`} onClick={() => onOpen(d)}>
                {course(d)}
                <span className="crunch-item-title">{d.title}</span>
                <span className="crunch-item-w">{weightLabel(d)}</span>
              </button>
            </li>
          ))}
        </ul>
        {focus.items.length > listed.length && (
          <button type="button" className="side-more" onClick={() => onShowWeek(focus.start)}>
            +{focus.items.length - listed.length} more on the calendar
          </button>
        )}
        {hell && startEarly && (
          <p className="crunch-tip">
            Biggest one: <strong>{startEarly.title}</strong> ({startEarly.course}),{" "}
            {hell.start === thisWeek
              ? `due ${dayLabel(startEarly.date, today).replace(/^(Today|Tomorrow)$/, (w) => w.toLowerCase())}.`
              : `${["quiz", "midterm", "final"].includes(startEarly.category) ? "start studying" : "start it"} before that week.`}
          </p>
        )}
        {anyGuessed && <p className="crunch-foot">~ guessed from the type. The syllabus didn't give a weight.</p>}
      </div>
    </section>
  );
}

export default CalendarSidebar;
