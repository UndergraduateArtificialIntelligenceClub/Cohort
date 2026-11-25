import { supabase } from "./supabase";
import { normalizeCourse } from "./courses";
import type { Deadline } from "../types";

// Postgres' "unique_violation": the user already has this course + title + date
const DUPLICATE = "23505";

// Save and load the logged in user's deadlines (issue #51). No UI here; pages call these.
// The deadlines table and its row-level security come from supabase/migrations (#30).

// Only the columns that make up a Deadline, so loaded rows match the type
const COLUMNS = "id, done, course, title, date, time, category, source_text, weight";

// Postgres sends a TIME back as "23:59:00"; the app uses "23:59" everywhere (types.ts)
function fromRow(row: Deadline): Deadline {
  return { ...row, time: row.time ? row.time.slice(0, 5) : null };
}

// The logged in user's id. Supabase rejects reads and writes from anyone else.
async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Please log in first.");
  return id;
}

// Add deadlines (e.g. the ones confirmed in the review popup) to the user's saved list.
// Deadlines the user already has (same course, title and date) are skipped, so uploading
// the same syllabus twice doesn't create duplicates (#64). The one thing a re-upload does change is a
// missing time: if the saved copy has none and the new one does, it's filled in. A time the user set stays.
// Course names are stored normalized ("Stat 151" -> "STAT 151"), so a syllabus you uploaded and
// the same course from the shared library count as the same course.
export async function saveDeadlines(deadlines: Deadline[]): Promise<void> {
  if (deadlines.length === 0) return;
  const user_id = await currentUserId();
  // Every row needs user_id, or the insert policy rejects it
  const rows = deadlines.map((d) => ({
    ...d,
    course: d.course === null ? null : normalizeCourse(d.course),
    time: d.time ?? null,
    weight: d.weight ?? null,
    user_id,
  }));
  // Matches the unique constraint in supabase/migrations/20261118000000_unique_deadlines.sql
  const { error } = await supabase
    .from("deadlines")
    .upsert(rows, { onConflict: "user_id,course,title,date", ignoreDuplicates: true });
  if (error) throw new Error(`Couldn't save deadlines: ${error.message}`);

  // Only rows that were skipped and have no time yet match, so this never touches the ones just added
  const fills = rows.flatMap((row) =>
    row.time && row.course !== null
      ? [
          supabase
            .from("deadlines")
            .update({ time: row.time })
            .match({ user_id, course: row.course, title: row.title, date: row.date })
            .is("time", null),
        ]
      : []
  );
  for (const { error: fillError } of await Promise.all(fills)) {
    if (fillError) throw new Error(`Couldn't save deadline times: ${fillError.message}`);
  }
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
      time: deadline.time ?? null,
      category: deadline.category,
      source_text: deadline.source_text,
      weight: deadline.weight ?? null,
      user_id,
    })
    .select(COLUMNS)
    .single();
  if (error?.code === DUPLICATE) throw new Error("That's already on your calendar for that day.");
  if (error) throw new Error(`Couldn't add it: ${error.message}`);
  return fromRow(data as Deadline);
}

// The user's saved deadlines, soonest first (same order as bySchedule in lib/planner.ts)
export async function loadDeadlines(): Promise<Deadline[]> {
  const user_id = await currentUserId();
  const { data, error } = await supabase
    .from("deadlines")
    .select(COLUMNS)
    .eq("user_id", user_id)
    .order("date")
    .order("time", { nullsFirst: false });
  if (error) throw new Error(`Couldn't load deadlines: ${error.message}`);
  return (data as Deadline[]).map(fromRow);
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
