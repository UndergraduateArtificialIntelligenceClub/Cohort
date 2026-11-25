import { supabase } from "./supabase";
import { normalizeCourse } from "./courses";
import { cancelRequest } from "./studyBuddy";
import type { Deadline } from "../types";

// Postgres' "unique_violation": the user already has this course + title + date
const DUPLICATE = "23505";

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
  const rows = deadlines.map((d) => ({ ...d, course: d.course === null ? null : normalizeCourse(d.course), weight: d.weight ?? null, user_id }));
  // Matches the unique constraint in supabase/migrations/20261118000000_unique_deadlines.sql
  const { error } = await supabase
    .from("deadlines")
    .upsert(rows, { onConflict: "user_id,course,title,date", ignoreDuplicates: true });
  if (error) throw new Error(`Couldn't save deadlines: ${error.message}`);
}

// Add one date the user typed in on the calendar, school or personal, and return it as saved.
// Unlike saveDeadlines, a school item they already have is an error, so they find out instead of nothing happening.
export async function addDeadline(deadline: Deadline): Promise<Deadline> {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("deadlines")
    .insert({
      course: deadline.course === null ? null : normalizeCourse(deadline.course),
      title: deadline.title,
      date: deadline.date,
      category: deadline.category,
      source_text: deadline.source_text,
      weight: deadline.weight ?? null,
      user_id,
    })
    .select(COLUMNS)
    .single();
  if (error?.code === DUPLICATE) throw new Error("That's already on your calendar for that day.");
  if (error) throw new Error(`Couldn't add it: ${error.message}`);
  return data as Deadline;
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
// The course library uses it to mark courses that are already on the calendar. Personal items have no course.
export async function loadMyCourses(): Promise<Set<string>> {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("deadlines")
    .select("course")
    .eq("user_id", user_id)
    .not("course", "is", null);
  if (error) throw new Error(`Couldn't load your courses: ${error.message}`);
  // Rows saved before course names were normalized may still be "Stat 151"
  return new Set(data.flatMap((row) => (row.course ? [normalizeCourse(row.course)] : [])));
}

// Update the fields on an existing deadline
export async function updateDeadline(
  id: string,
  changes: Partial<Deadline>
): Promise<void> {
  // course is null when it's being turned into a personal item
  const row = changes.course == null ? changes : { ...changes, course: normalizeCourse(changes.course) };
  const { error } = await supabase
    .from("deadlines")
    .update(row)
    .eq("id", id);

  if (error?.code === DUPLICATE) throw new Error("That's already on your calendar for that day.");
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

// Delete every date in one course, so dropping a course doesn't mean deleting its dates one by one.
// Pass the course exactly as it's stored (deadline.course), so it removes the same rows the calendar groups
// under that course. Personal items have no course, so they can never be caught by this.
// Leaving a course also stops you waiting for a study buddy in it, since you can only look for one in your
// own courses (#67). Buddies you're already matched with stay, and so do syllabi shared to the course library.
export async function deleteCourse(course: string): Promise<void> {
  const user_id = await currentUserId();
  // First, so if it fails nothing is deleted and you can just try again.
  // Requests are stored normalized; older deadline rows might not be.
  await cancelRequest(normalizeCourse(course));
  const { error } = await supabase
    .from("deadlines")
    .delete()
    .eq("user_id", user_id)
    .eq("course", course);

  if (error) {
    throw new Error(`Couldn't delete ${course}: ${error.message}`);
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
