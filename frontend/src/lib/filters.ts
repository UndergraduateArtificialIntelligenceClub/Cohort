import type { Deadline } from "../types";
import { courseLabel, PERSONAL_LABEL } from "./courses";

// Calendar filters (#79): hide some courses, and hide done items, to focus on what's left. No UI here:
// components/CalendarFilters.tsx draws the course chips, and Hide done is a switch on the calendar's header.
// Kept in this browser, so they survive a refresh. Course colors always come from every course.

export type Filters = {
  hidden: string[]; // courseLabels that are switched off, so "Personal" can be hidden too. New courses start shown.
  hideDone: boolean;
};

const NO_FILTERS: Filters = { hidden: [], hideDone: false };

const KEY = "cohort:calendar-filters";

export function loadFilters(): Filters {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return {
      hidden: Array.isArray(saved?.hidden) ? saved.hidden.filter((c: unknown) => typeof c === "string") : [],
      hideDone: saved?.hideDone === true,
    };
  } catch {
    return NO_FILTERS;
  }
}

export function saveFilters(filters: Filters) {
  try {
    localStorage.setItem(KEY, JSON.stringify(filters));
  } catch {
    // Storage blocked: the filters just reset next visit
  }
}

export function toggleCourse(filters: Filters, course: string): Filters {
  const hidden = filters.hidden.includes(course) ? filters.hidden.filter((c) => c !== course) : [...filters.hidden, course];
  return { ...filters, hidden };
}

export function applyFilters(deadlines: Deadline[], filters: Filters): Deadline[] {
  return deadlines.filter((d) => !filters.hidden.includes(courseLabel(d)) && !(filters.hideDone && d.done));
}

// "Showing 2 of 5 courses · personal hidden", or null when every course is shown. Personal isn't counted as
// a course. Only labels still on the calendar count, so a hidden course that was since deleted isn't a filter
// anymore. Hide done isn't mentioned: its switch sits right on the calendar, so it's never forgotten.
export function filterSummary(filters: Filters, labels: string[]): string | null {
  const courses = labels.filter((c) => c !== PERSONAL_LABEL);
  const hiddenCourses = courses.filter((c) => filters.hidden.includes(c)).length;
  const personalHidden = labels.includes(PERSONAL_LABEL) && filters.hidden.includes(PERSONAL_LABEL);
  const parts = [
    hiddenCourses > 0 && `Showing ${courses.length - hiddenCourses} of ${courses.length} course${courses.length === 1 ? "" : "s"}`,
    personalHidden && "personal hidden",
  ].filter((part): part is string => !!part);
  if (parts.length === 0) return null;
  // Capitalize whichever part comes first: "Personal hidden"
  parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return parts.join(" · ");
}
