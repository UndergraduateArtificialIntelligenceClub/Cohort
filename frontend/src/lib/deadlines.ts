import { supabase } from "./supabase";
import { normalizeCourse } from "./courses";
import type { Deadline } from "../types";

// Save and load the logged in user's deadlines (issue #51). No UI here; pages call these.
// The deadlines table and its row-level security come from supabase/migrations (#30).

// Only the columns that make up a Deadline, so loaded rows match the type
const COLUMNS = "id, done, course, title, date, category, source_text, weight";

// The logged in user's id. Supabase rejects reads and writes from anyone else.
async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Please log in first.");
  return id;
}

// Add deadlines (e.g. the ones confirmed in the review popup) to the user's saved list.
// Deadlines the user already has (same course, title and date) are skipped, so uploading
// the same syllabus twice doesn't create duplicates (#64).
// Course names are stored normalized ("Stat 151" -> "STAT 151"), so a syllabus you uploaded and
// the same course from the shared library count as the same course.
export async function saveDeadlines(deadlines: Deadline[]): Promise<void> {
  if (deadlines.length === 0) return;
  const user_id = await currentUserId();
  // Every row needs user_id, or the insert policy rejects it
  const rows = deadlines.map((d) => ({ ...d, course: normalizeCourse(d.course), weight: d.weight ?? null, user_id }));
  // Matches the unique constraint in supabase/migrations/20261118000000_unique_deadlines.sql
  const { error } = await supabase
    .from("deadlines")
    .upsert(rows, { onConflict: "user_id,course,title,date", ignoreDuplicates: true });
  if (error) throw new Error(`Couldn't save deadlines: ${error.message}`);
}

// The user's saved deadlines, soonest first
export async function loadDeadlines(): Promise<Deadline[]> {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("deadlines")
    .select(COLUMNS)
    .eq("user_id", user_id)
    .order("date");
  if (error) throw new Error(`Couldn't load deadlines: ${error.message}`);
  return data as Deadline[];
}

// The courses the user has deadlines in, normalized, e.g. {"CMPUT 174", "STAT 151"}.
// The course library uses it to mark courses that are already on the calendar.
export async function loadMyCourses(): Promise<Set<string>> {
  const user_id = await currentUserId();
  const { data, error } = await supabase.from("deadlines").select("course").eq("user_id", user_id);
  if (error) throw new Error(`Couldn't load your courses: ${error.message}`);
  // Rows saved before course names were normalized may still be "Stat 151"
  return new Set(data.map((row) => normalizeCourse(row.course)));
}

// Update the fields on an existing deadline
export async function updateDeadline(
  id: string,
  changes: Partial<Deadline>
): Promise<void> {
  const row = changes.course === undefined ? changes : { ...changes, course: normalizeCourse(changes.course) };
  const { error } = await supabase
    .from("deadlines")
    .update(row)
    .eq("id", id);

  if (error) {
    throw new Error(`Couldn't update deadline: ${error.message}`);
  }
}

// Delete a deadline
export async function deleteDeadline(id: string): Promise<void> {
  const { error } = await supabase
    .from("deadlines")
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`Couldn't delete deadline: ${error.message}`);
  }
}

// Mark a deadline as done or not done
export async function setDone(
  id: string,
  done: boolean
): Promise<void> {
  const { error } = await supabase
    .from("deadlines")
    .update({ done })
    .eq("id", id);

  if (error) {
    throw new Error(`Couldn't update deadline status: ${error.message}`);
  }
}
