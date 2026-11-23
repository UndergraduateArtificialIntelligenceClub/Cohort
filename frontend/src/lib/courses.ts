// Course name helpers shared by saved deadlines, the course library (#66) and study buddy matching (#67).

// "cmput  174 " and "CMPUT 174" are the same course. Keep in sync with the CHECK on
// shared_syllabi.course in supabase/migrations/20261118120000_shared_syllabi.sql.
export function normalizeCourse(course: string): string {
  return course.trim().replace(/\s+/g, " ").toUpperCase();
}

// Personal items (a dentist appointment, a shift) have no course, and that's the only way to tell them apart.
// The database's personal column follows the same rule. Leave them out of anything keyed on course:
// study buddy, the course library, course counts.
export function isPersonal(d: { course: string | null }): d is { course: null } {
  return d.course === null;
}

// What to show where a course name goes, and the key for its color. Normalized course names are all
// upper case, so no real course can be called "Personal".
export const PERSONAL_LABEL = "Personal";

export function courseLabel(d: { course: string | null }): string {
  return d.course ?? PERSONAL_LABEL;
}
