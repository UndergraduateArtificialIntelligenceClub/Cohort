// The deadline shape the AI parser returns. Keep it in sync with backend/models.py.

export type Category = "assignment" | "lab" | "quiz" | "midterm" | "final" | "other";

export type Deadline = {
  id?: string;
  done?: boolean;
  course: string; // e.g. "CMPUT 174"
  title: string; // e.g. "Assignment 2"
  date: string; // "YYYY-MM-DD"
  category: Category;
  source_text: string; // the exact sentence from the syllabus
  weight?: number | null; // percent of final grade, e.g. 15. The backend sends null when unknown
};

// What POST /parse and POST /parse-pdf return
export type ParseResponse = {
  deadlines: Deadline[];
  instructor: string | null; // e.g. "Dr. Smith". null when the syllabus doesn't say
};