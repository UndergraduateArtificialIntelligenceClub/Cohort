// The deadline shape the AI parser returns. Keep Category and the parser's fields in sync with backend/models.py.

export type Category = "assignment" | "lab" | "quiz" | "midterm" | "final" | "other";

// The parser's categories, i.e. the ones a school item can have
export const CATEGORIES: Category[] = ["assignment", "lab", "quiz", "midterm", "final", "other"];

// Saved items can also be personal dates the user added themselves (supabase/migrations/20261122000000_own_dates.sql)
export type DeadlineCategory = Category | "personal";

export type Deadline = {
  id?: string;
  done?: boolean;
  // e.g. "CMPUT 174". null for a personal item, and only for those (see isPersonal in lib/courses.ts)
  course: string | null;
  title: string; // e.g. "Assignment 2"
  date: string; // "YYYY-MM-DD"
  // "HH:MM", 24-hour, Edmonton time: when it's due, or when an exam starts. null when the syllabus doesn't say.
  // Optional because rows and shared syllabi saved before times existed don't have it.
  time?: string | null;
  category: DeadlineCategory;
  // The exact sentence from the syllabus. null for dates the user added themselves
  source_text: string | null;
  weight?: number | null; // percent of final grade, e.g. 15. The backend sends null when unknown
};

// A graded item the syllabus gives no date for (a final exam scheduled later, participation, "TBA").
// The review popup warns about these so the student can add a date; skipped ones aren't saved.
export type UndatedItem = {
  course: string;
  title: string;
  category: Category;
  source_text: string;
  weight?: number | null;
};

// What POST /parse, POST /parse-pdf and POST /import-canvas return (ParseResponse and SyllabusParse in backend/models.py)
export type ParseResponse = {
  deadlines: Deadline[];
  // Optional so an older backend that doesn't send it still works
  undated?: UndatedItem[];
  instructor: string | null; // e.g. "Dr. Smith". null when the syllabus doesn't say
  // The syllabus text that was read, for the review popup's course name check. Not sent by the Canvas import.
  text?: string;
};
