import type { Category, Deadline } from "../types";
import { isPersonal } from "./courses";

// The rules behind the calendar sidebar (components/CalendarSidebar.tsx) and the phone list
// (components/AgendaList.tsx): what's due in the next 7 days, what's next, and which week coming up is the
// heaviest ("hell week"). No UI and no Supabase here, just plain functions.
// Personal items (no course) show up in the 7-day lists, but never in Next up, Overdue / "Did you finish?"
// or the forecast: those are about schoolwork.

// ---------- Dates ----------
// Deadlines are "YYYY-MM-DD" in the student's own time zone. Day maths runs on whole UTC days,
// so daylight saving can never shift a deadline by a day.

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function fromDayNumber(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

// A local Date (like the ones FullCalendar hands out) as "YYYY-MM-DD"
export function toISO(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(iso: string, days: number): string {
  return fromDayNumber(dayNumber(iso) + days);
}

// Negative when the date has passed
export function daysUntil(iso: string, today: string): number {
  return dayNumber(iso) - dayNumber(today);
}

// Weeks start on Sunday, the same as the calendar grid (Calendar.tsx passes this as firstDay),
// so a hell week lines up with one row of the grid.
export const WEEK_START = 0;

export function weekStart(iso: string): string {
  const n = dayNumber(iso);
  const dow = new Date(n * 86_400_000).getUTCDay();
  return fromDayNumber(n - ((dow - WEEK_START + 7) % 7));
}

const utc = (iso: string) => new Date(dayNumber(iso) * 86_400_000);
const fmt = (iso: string, options: Intl.DateTimeFormatOptions) =>
  utc(iso).toLocaleDateString("en-CA", { timeZone: "UTC", ...options });

// "Today", "Tomorrow", "Yesterday", a weekday within the next week ("Fri"), otherwise "Dec 4"
export function dayLabel(iso: string, today: string): string {
  const days = daysUntil(iso, today);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1 && days < 7) return fmt(iso, { weekday: "short" });
  return fmt(iso, { month: "short", day: "numeric" });
}

// "Thu, Nov 21"
export function longDate(iso: string): string {
  return fmt(iso, { weekday: "short", month: "short", day: "numeric" });
}

// "Thursday, Nov 21", the sidebar's heading
export function fullDate(iso: string): string {
  return fmt(iso, { weekday: "long", month: "short", day: "numeric" });
}

// ---------- Times ----------
// A deadline's time is "HH:MM" in Edmonton, shown as written: never converted, never used in day maths.
// null means the syllabus didn't say, so nothing is shown (it's never treated as "11:59 PM").

// "11:59 PM" for "23:59". Same as clock() in supabase/functions/send-notifications/compose.ts.
export function timeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// "11:59p", "9a": short enough for a calendar pill
export function shortTimeLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "a" : "p"}`;
}

// "Due 11:59 PM", "Starts 9:00 AM" for an exam, or just "2:30 PM" for a personal item. "" with no time.
export function whenLabel(d: Deadline): string {
  if (!d.time) return "";
  if (isPersonal(d)) return timeLabel(d.time);
  return `${d.category === "midterm" || d.category === "final" ? "Starts" : "Due"} ${timeLabel(d.time)}`;
}

// Soonest first: by day, then by time, with untimed ones after the timed ones on the same day
export const bySchedule = (a: Deadline, b: Deadline) =>
  a.date.localeCompare(b.date) || (a.time ?? "99").localeCompare(b.time ?? "99");

// "Nov 29 – Dec 5" for the week starting on the given day
export function weekLabel(start: string): string {
  const end = addDays(start, 6);
  const sameMonth = start.slice(5, 7) === end.slice(5, 7);
  return `${fmt(start, { month: "short", day: "numeric" })} – ${fmt(end, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" })}`;
}

// ---------- Weights ----------
// Many syllabi don't give a weight. For the forecast, guess one from the category.
// Guesses are only used to compare weeks and sort, never shown, so they can't be mistaken for real numbers.
const GUESSED_WEIGHT: Record<Category, number> = {
  final: 30,
  midterm: 20,
  assignment: 8,
  other: 5,
  quiz: 4,
  lab: 3,
};

export function weightOf(d: Deadline): number {
  if (d.category === "personal") return 0;
  return d.weight ?? GUESSED_WEIGHT[d.category];
}

// ---------- Next up and this week ----------
// Next up only looks this far ahead, so it always shows something that really is next.
// Big things further out belong to the forecast.
export const NEXT_UP_DAYS = 5;
export const WEEK_DAYS = 7;
// Unfinished deadlines this many days late get one "Did you finish?" question, then disappear on their own.
// Most students won't tick everything, so old ones must never pile up.
export const ASK_DAYS = 3;

// A 9 AM quiz is next up before an assignment due at 11:59 PM the same day
const soonestFirst = (a: Deadline, b: Deadline) => bySchedule(a, b) || weightOf(b) - weightOf(a);

export type Plan = {
  nextUp: Deadline | null; // soonest unfinished school deadline in the next 5 days
  later: Deadline | null; // when nothing is next up: the first unfinished school one after that
  thisWeek: Deadline[]; // unfinished, due in the next 7 days, not counting nextUp. Personal items too
  doneThisWeek: Deadline[]; // finished ones due in the next 7 days
  askFinished: Deadline[]; // unfinished school deadlines, 1 to 3 days late, not dismissed yet
};

export function makePlan(deadlines: Deadline[], today: string, dismissed: Set<string>): Plan {
  const sorted = [...deadlines].sort(soonestFirst);
  const open = sorted.filter((d) => !d.done && daysUntil(d.date, today) >= 0);
  const openSchool = open.filter((d) => !isPersonal(d));
  const nextUp = openSchool.find((d) => daysUntil(d.date, today) < NEXT_UP_DAYS) ?? null;
  const inWeek = (d: Deadline) => daysUntil(d.date, today) < WEEK_DAYS;
  return {
    nextUp,
    later: nextUp ? null : (openSchool[0] ?? null),
    thisWeek: open.filter((d) => d !== nextUp && inWeek(d)),
    doneThisWeek: sorted.filter((d) => d.done && daysUntil(d.date, today) >= 0 && inWeek(d)),
    askFinished: sorted.filter((d) => isRecentlyLate(d, today, dismissed)),
  };
}

// An unfinished school deadline 1 to 3 days late that the student hasn't said "No" to on their phone
function isRecentlyLate(d: Deadline, today: string, dismissed: Set<string>): boolean {
  const late = -daysUntil(d.date, today);
  return !d.done && !isPersonal(d) && late >= 1 && late <= ASK_DAYS && !(d.id && dismissed.has(d.id));
}

// ---------- 7-day agenda (desktop sidebar) ----------
export type AgendaDay = {
  date: string;
  overdue: Deadline[]; // only on today: recently late ones, the same rule as "Did you finish?"
  items: Deadline[]; // unfinished ones due that day, soonest first
};

export type Agenda = {
  days: AgendaDay[]; // today and tomorrow always (they may be empty), later days only when something is due
  leftToday: number; // unfinished today, overdue included
  laterThisWeek: number; // unfinished in the 6 days after today
  done: Deadline[]; // finished ones due today through 6 days from now
};

// Late ones stop showing after ASK_DAYS, so a term of unticked deadlines never piles up at the top.
export function makeAgenda(deadlines: Deadline[], today: string, dismissed: Set<string>): Agenda {
  const sorted = [...deadlines].sort(soonestFirst);
  const inWindow = (d: Deadline) => daysUntil(d.date, today) >= 0 && daysUntil(d.date, today) < WEEK_DAYS;
  const open = sorted.filter((d) => !d.done && inWindow(d));
  const overdue = sorted.filter((d) => isRecentlyLate(d, today, dismissed));

  const days: AgendaDay[] = [];
  for (let i = 0; i < WEEK_DAYS; i++) {
    const date = addDays(today, i);
    const items = open.filter((d) => d.date === date);
    if (i < 2 || items.length > 0) days.push({ date, overdue: i === 0 ? overdue : [], items });
  }
  const leftToday = days[0].overdue.length + days[0].items.length;

  return {
    days,
    leftToday,
    laterThisWeek: open.length - days[0].items.length,
    done: sorted.filter((d) => d.done && inWindow(d)),
  };
}

// ---------- Crunch forecast ----------
export const FORECAST_WEEKS = 8;
// A hell week has to be at least this many times the student's usual week...
export const HELL_RATIO = 2;
// ...and at least this heavy, so two quizzes in a quiet term never count.
export const HELL_MIN_LOAD = 25;

export type Week = {
  start: string;
  load: number; // sum of weights (guessed where missing). Only for comparing weeks, never shown as a percent.
  items: Deadline[]; // heaviest first
};

export type Forecast = {
  weeks: Week[]; // this week and the 7 after it
  busiest: Week | null; // heaviest of those, if any has something due
  hell: Week | null; // the busiest week, but only when it's far above normal
  startEarly: Deadline | null; // the biggest unfinished thing due in hell week
};

// openOnly: weigh the weeks ahead by what's still to do (not done, today or later), so a week you've mostly
// finished stops being the heaviest, and the calendar's label agrees with the sidebar. The "usual week" is
// still worked out from the whole term, done or not, so it stays a fair yardstick to the very last week.
export function makeForecast(deadlines: Deadline[], today: string, { openOnly = false } = {}): Forecast {
  // Every week of the student's term that has anything due, past ones too. Only schoolwork counts.
  const byWeek = groupByWeek(deadlines.filter((d) => !isPersonal(d)));
  const counted = openOnly
    ? groupByWeek(deadlines.filter((d) => !isPersonal(d) && !d.done && daysUntil(d.date, today) >= 0))
    : byWeek;

  // "Usual week" = median of the weeks that have something due. Empty weeks (reading week,
  // the gap before finals) are left out, or the median drops to 0 and every week looks like hell.
  const loads = [...byWeek.values()].map((w) => w.load).sort((a, b) => a - b);
  const mid = Math.floor(loads.length / 2);
  const median = loads.length === 0 ? 0 : loads.length % 2 ? loads[mid] : (loads[mid - 1] + loads[mid]) / 2;

  const first = weekStart(today);
  const weeks = Array.from({ length: FORECAST_WEEKS }, (_, i) => {
    const start = addDays(first, i * 7);
    return counted.get(start) ?? { start, load: 0, items: [] };
  });

  // Earliest wins a tie: it's the one to worry about first
  const busiest = weeks.reduce<Week | null>((best, w) => (w.load > (best?.load ?? 0) ? w : best), null);
  const hell = busiest && busiest.load >= Math.max(HELL_MIN_LOAD, HELL_RATIO * median) ? busiest : null;
  const startEarly = hell?.items.find((d) => !d.done && daysUntil(d.date, today) >= 0) ?? null;

  return { weeks, busiest, hell, startEarly };
}

// Week start -> that week's deadlines (heaviest first) and their summed weight
function groupByWeek(deadlines: Deadline[]): Map<string, Week> {
  const byWeek = new Map<string, Week>();
  for (const d of deadlines) {
    const start = weekStart(d.date);
    const week = byWeek.get(start) ?? { start, load: 0, items: [] };
    week.load += weightOf(d);
    week.items.push(d);
    byWeek.set(start, week);
  }
  for (const week of byWeek.values()) week.items.sort((a, b) => weightOf(b) - weightOf(a));
  return byWeek;
}

// How many different courses a set of deadlines covers (personal items aren't a course)
export function courseCount(deadlines: Deadline[]): number {
  return new Set(deadlines.flatMap((d) => (d.course === null ? [] : [d.course]))).size;
}
