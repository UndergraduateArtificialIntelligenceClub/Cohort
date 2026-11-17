import { supabase } from "./supabase";
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

// Add deadlines (e.g. the ones confirmed in the review popup) to the user's saved list
export async function saveDeadlines(deadlines: Deadline[]): Promise<void> {
  if (deadlines.length === 0) return;
  const user_id = await currentUserId();
  // Every row needs user_id, or the insert policy rejects it
  const rows = deadlines.map((d) => ({ ...d, weight: d.weight ?? null, user_id }));
  const { error } = await supabase.from("deadlines").insert(rows);
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
