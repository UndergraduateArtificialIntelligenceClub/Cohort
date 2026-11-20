import type { Category, Deadline } from "../types";

// The rules behind the calendar sidebar (components/CalendarSidebar.tsx): what's next, what's this week,
// and which week coming up is the heaviest ("hell week"). No UI and no Supabase here, just plain functions.

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

// "Nov 29 – Dec 5" for the week starting on the given day
export function weekLabel(start: string): string {
  const end = addDays(start, 6);
  const sameMonth = start.slice(5, 7) === end.slice(5, 7);
  return `${fmt(start, { month: "short", day: "numeric" })} – ${fmt(end, sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" })}`;
}

// ---------- Weights ----------
// Many syllabi don't give a weight. For the forecast, guess one from the category.
// Guesses are always shown with "~" so they never look like real numbers.
const GUESSED_WEIGHT: Record<Category, number> = {
  final: 30,
  midterm: 20,
  assignment: 8,
  other: 5,
  quiz: 4,
  lab: 3,
};

export function weightOf(d: Deadline): { value: number; guessed: boolean } {
  if (d.weight != null) return { value: d.weight, guessed: false };
  return { value: GUESSED_WEIGHT[d.category], guessed: true };
}

// "15%" when the syllabus says so, "~8%" when guessed
export function weightLabel(d: Deadline): string {
  const { value, guessed } = weightOf(d);
  return `${guessed ? "~" : ""}${value}%`;
}

// ---------- Next up and this week ----------
// Next up only looks this far ahead, so it always shows something that really is next.
// Big things further out belong to the forecast.
export const NEXT_UP_DAYS = 5;
export const WEEK_DAYS = 7;
// Unfinished deadlines this many days late get one "Did you finish?" question, then disappear on their own.
// Most students won't tick everything, so old ones must never pile up.
export const ASK_DAYS = 3;

const soonestFirst = (a: Deadline, b: Deadline) =>
  a.date.localeCompare(b.date) || weightOf(b).value - weightOf(a).value;

export type Plan = {
  nextUp: Deadline | null; // soonest unfinished deadline in the next 5 days
  later: Deadline | null; // when nothing is next up: the first unfinished one after that
  thisWeek: Deadline[]; // unfinished, due in the next 7 days, not counting nextUp
  doneThisWeek: Deadline[]; // finished ones due in the next 7 days
  askFinished: Deadline[]; // unfinished, 1 to 3 days late, not dismissed yet
};

export function makePlan(deadlines: Deadline[], today: string, dismissed: Set<string>): Plan {
  const sorted = [...deadlines].sort(soonestFirst);
  const open = sorted.filter((d) => !d.done && daysUntil(d.date, today) >= 0);
  const nextUp = open.find((d) => daysUntil(d.date, today) < NEXT_UP_DAYS) ?? null;
  const inWeek = (d: Deadline) => daysUntil(d.date, today) < WEEK_DAYS;
  return {
    nextUp,
    later: nextUp ? null : (open[0] ?? null),
    thisWeek: open.filter((d) => d !== nextUp && inWeek(d)),
    doneThisWeek: sorted.filter((d) => d.done && daysUntil(d.date, today) >= 0 && inWeek(d)),
    askFinished: sorted.filter((d) => {
      const late = -daysUntil(d.date, today);
      return !d.done && late >= 1 && late <= ASK_DAYS && !(d.id && dismissed.has(d.id));
    }),
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

export function makeForecast(deadlines: Deadline[], today: string): Forecast {
  // Every week of the student's term that has anything due, past ones too
  const byWeek = new Map<string, Week>();
  for (const d of deadlines) {
    const start = weekStart(d.date);
    const week = byWeek.get(start) ?? { start, load: 0, items: [] };
    week.load += weightOf(d).value;
    week.items.push(d);
    byWeek.set(start, week);
  }
  for (const week of byWeek.values()) week.items.sort((a, b) => weightOf(b).value - weightOf(a).value);

  // "Usual week" = median of the weeks that have something due. Empty weeks (reading week,
  // the gap before finals) are left out, or the median drops to 0 and every week looks like hell.
  const loads = [...byWeek.values()].map((w) => w.load).sort((a, b) => a - b);
  const mid = Math.floor(loads.length / 2);
  const median = loads.length === 0 ? 0 : loads.length % 2 ? loads[mid] : (loads[mid - 1] + loads[mid]) / 2;

  const first = weekStart(today);
  const weeks = Array.from({ length: FORECAST_WEEKS }, (_, i) => {
    const start = addDays(first, i * 7);
    return byWeek.get(start) ?? { start, load: 0, items: [] };
  });

  // Earliest wins a tie: it's the one to worry about first
  const busiest = weeks.reduce<Week | null>((best, w) => (w.load > (best?.load ?? 0) ? w : best), null);
  const hell = busiest && busiest.load >= Math.max(HELL_MIN_LOAD, HELL_RATIO * median) ? busiest : null;
  const startEarly = hell?.items.find((d) => !d.done && daysUntil(d.date, today) >= 0) ?? null;

  return { weeks, busiest, hell, startEarly };
}

// How many different courses a set of deadlines covers
export function courseCount(deadlines: Deadline[]): number {
  return new Set(deadlines.map((d) => d.course)).size;
}
