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
  category: DeadlineCategory;
  // The exact sentence from the syllabus. null for dates the user added themselves
  source_text: string | null;
  weight?: number | null; // percent of final grade, e.g. 15. The backend sends null when unknown
};

// What POST /parse and POST /parse-pdf return
export type ParseResponse = {
  deadlines: Deadline[];
  instructor: string | null; // e.g. "Dr. Smith". null when the syllabus doesn't say
};
