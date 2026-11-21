// Course name helpers shared by saved deadlines, the course library (#66) and study buddy matching (#67).

// "cmput  174 " and "CMPUT 174" are the same course. Keep in sync with the CHECK on
// shared_syllabi.course in supabase/migrations/20261118120000_shared_syllabi.sql.
export function normalizeCourse(course: string): string {
  return course.trim().replace(/\s+/g, " ").toUpperCase();
}
