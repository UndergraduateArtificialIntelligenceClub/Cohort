// Course name helpers shared by saved deadlines, the course library (#66) and study buddy matching (#67).

// "cmput  174 ", "cmput174" and "CMPUT 174" are the same course. Keep in sync with public.normalize_course()
// in supabase/migrations/20261127120000_course_code_spacing.sql, which the database's CHECKs use.
// Only the first place where the subject's letters meet the number gets a space, so codes like "INT D 137B"
// and "MATH 100 A1" are otherwise kept as written. There's no strict format to fit.
export function normalizeCourse(course: string): string {
  return course
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase()
    .replace(/^([^0-9]*[A-Z])([0-9])/, "$1 $2");
}

// Whether a course code appears in syllabus text, however it's spaced or punctuated there ("CMPUT 174",
// "Cmput-174", "CMPUT174"). The whole code has to match: "CMPUT 17" isn't found in "CMPUT 174".
export function mentionsCourse(text: string, course: string): boolean {
  const chars = course.toUpperCase().replace(/[^A-Z0-9]/g, "").split("");
  if (chars.length === 0) return false;
  // Only letters and digits are left, so nothing needs escaping
  return new RegExp(`(?<![A-Z0-9])${chars.join("[^A-Z0-9]*")}(?![0-9])`, "i").test(text);
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
