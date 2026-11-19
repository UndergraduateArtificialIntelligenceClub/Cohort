import { useEffect, useState, type CSSProperties } from "react";
import { todayISO } from "../lib/library";

// Login page demo, ported from CalendarAI Mini's HeroDemo:
// lines of a sample syllabus are read one at a time and land on this month's calendar.
// Colors come from the CSS variables set on the login page (Login.tsx).

const ITEMS = [
  { course: "CMPUT 174", title: "Assignment 2", day: 6, color: "#3987e5" },
  { course: "MATH 125", title: "Quiz 3", day: 9, color: "#d95926" },
  { course: "BIOL 107", title: "Lab report", day: 14, color: "#199e70" },
  { course: "CMPUT 174", title: "Midterm", day: 20, color: "#3987e5" },
  { course: "ECON 101", title: "Problem set 4", day: 24, color: "#c98500" },
];
const STEP_MS = 1100;
// One step per line, then hold on the finished calendar for a few beats before starting over
const LOOP = ITEMS.length + 4;
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8M16 13H8M16 17H8" />
    </svg>
  );
}

const card = "rounded-md border border-(--border) bg-(--surface) p-3 shadow-[0_1px_2px_rgba(28,26,23,0.05)]";
const ease = "ease-[cubic-bezier(0.2,0,0,1)]";

function LoginDemo() {
  const [reduce] = useState(prefersReducedMotion);
  const [step, setStep] = useState(reduce ? ITEMS.length : 0);

  useEffect(() => {
    if (reduce) return;
    const timer = setInterval(() => setStep((s) => (s + 1) % LOOP), STEP_MS);
    return () => clearInterval(timer);
  }, [reduce]);

  const [year, month, today] = todayISO().split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const firstWeekday = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthName = first.toLocaleDateString(undefined, { month: "long" });
  const monthShort = first.toLocaleDateString(undefined, { month: "short" });
  const placed = Math.min(step, ITEMS.length);

  return (
    <div className="relative mt-6 grid grid-cols-1 gap-3 pb-4 md:grid-cols-2 max-lg:order-2 max-lg:mt-0" aria-hidden="true">
      <div className={`${card} max-md:hidden`}>
        <p className="mb-2 flex items-center gap-1.5 border-b border-(--border) pb-2 font-(family-name:--font-mono) text-xs text-(--ink-3)">
          <FileIcon /> syllabus.pdf
        </p>
        <p className="mb-1 font-(family-name:--font-heading) font-semibold">Schedule</p>
        <ul>
          {ITEMS.map((item, i) => {
            const reading = i === step;
            const done = !reading && i < placed;
            return (
              <li
                key={item.title}
                className={`-mx-1 flex items-center gap-2 rounded-md px-1 py-[3px] text-xs transition-colors duration-300 ${ease} ${
                  reading ? "bg-(--accent-subtle) text-(--ink)" : done ? "text-(--ink-2)" : "text-(--ink-3)"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">
                  {item.course} · {item.title}
                </span>
                <span className="whitespace-nowrap tabular-nums">
                  {monthShort} {item.day}
                </span>
                <CheckIcon className={`text-(--accent) transition-opacity duration-300 ${done ? "opacity-100" : "opacity-0"}`} />
              </li>
            );
          })}
        </ul>
      </div>

      <div className={card}>
        <p className="mb-2 font-(family-name:--font-heading) font-semibold">
          {monthName} <span className="font-normal text-(--ink-3)">{year}</span>
        </p>
        <div className="grid grid-cols-7 gap-0.5 text-center text-xs tabular-nums">
          {WEEKDAYS.map((w, i) => (
            <span key={`w${i}`} className="pb-0.5 text-(--ink-3)">
              {w}
            </span>
          ))}
          {Array.from({ length: firstWeekday }, (_, i) => (
            <span key={`b${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const k = ITEMS.findIndex((item) => item.day === day);
            const on = k >= 0 && k < placed;
            const isNew = on && k === placed - 1 && !reduce;
            return (
              <span
                key={day}
                className={`relative h-6 rounded-md leading-5 transition-colors duration-300 ${
                  day === today ? "font-semibold text-(--accent)" : "text-(--ink-2)"
                } ${isNew ? "bg-(--accent-subtle)" : ""}`}
              >
                {day}
                {on && (
                  <i
                    className={`absolute bottom-0.5 left-1/2 -ml-1.5 h-[3px] w-3 rounded-sm bg-(--c) ${
                      isNew ? "animate-[login-pop_360ms_cubic-bezier(0.2,0,0,1)_both]" : ""
                    }`}
                    style={{ "--c": ITEMS[k].color } as CSSProperties}
                  />
                )}
              </span>
            );
          })}
        </div>
      </div>

      {/* Frosted "done" toast that floats over the calendar once every line is placed */}
      <div
        className={`absolute bottom-0 -right-3 inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-white/65 px-3 py-2 text-xs font-medium shadow-[0_1px_2px_rgba(28,26,23,0.06),0_8px_24px_rgba(28,26,23,0.1)] backdrop-blur-lg backdrop-saturate-150 transition-all duration-300 max-md:right-3 ${ease} ${
          step >= ITEMS.length ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0"
        }`}
      >
        <CheckIcon className="size-3.5 text-(--accent)" /> Added {ITEMS.length} deadlines
      </div>
    </div>
  );
}

export default LoginDemo;
