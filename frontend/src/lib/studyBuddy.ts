import { supabase } from "./supabase";

// Study buddy (issue #67). No UI here; pages/StudyBuddy.tsx and components/StudyBuddyBadge.tsx call these.
// Tables, row-level security and functions come from supabase/migrations/20261119120000_study_buddy.sql.

export type StudyMatch = {
  id: number;
  course: string; // normalized, e.g. "CMPUT 174"
  user_a: string;
  user_b: string;
  user_a_name: string; // first name only, or "Classmate"
  user_b_name: string;
  ended_at: string | null;
  created_at: string;
};

export type StudyMessage = {
  id: number;
  match_id: number;
  sender: string;
  body: string;
  created_at: string;
};

export type StudyRequest = {
  course: string;
  created_at: string;
};

// Keep in sync with the 14 days in find_study_buddy
export const REQUEST_DAYS = 14;
export const MAX_MESSAGE = 2000;
export const MAX_REPORT = 1000;

const MATCH_COLUMNS = "id, course, user_a, user_b, user_a_name, user_b_name, ended_at, created_at";
const MESSAGE_COLUMNS = "id, match_id, sender, body, created_at";

// The other person's first name, from my side of the match
export function partnerName(match: StudyMatch, me: string): string {
  return match.user_a === me ? match.user_b_name : match.user_a_name;
}

// Courses I'm waiting for a buddy in. Older requests have expired, so they aren't shown.
export async function loadRequests(): Promise<StudyRequest[]> {
  const cutoff = new Date(Date.now() - REQUEST_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("study_requests")
    .select("course, created_at")
    .gt("created_at", cutoff)
    .order("created_at");
  if (error) throw new Error(`Couldn't load your study buddy requests: ${error.message}`);
  return data;
}

// My active matches (row-level security only returns my own), oldest first
export async function loadMatches(): Promise<StudyMatch[]> {
  const { data, error } = await supabase
    .from("study_matches")
    .select(MATCH_COLUMNS)
    .is("ended_at", null)
    .order("created_at");
  if (error) throw new Error(`Couldn't load your study buddies: ${error.message}`);
  return data;
}

// Match with whoever has waited longest in this course, or join the queue.
// Returns the match, or null if I'm now waiting.
export async function findBuddy(course: string): Promise<StudyMatch | null> {
  const { data, error } = await supabase.rpc("find_study_buddy", { p_course: course });
  if (error) throw new Error(error.message);
  // A function that returns null comes back as a row of nulls
  const match = data as StudyMatch | null;
  return match?.id ? match : null;
}

// Stop waiting in a course
export async function cancelRequest(course: string): Promise<void> {
  const { error } = await supabase.from("study_requests").delete().eq("course", course);
  if (error) throw new Error(`Couldn't stop searching: ${error.message}`);
}

export async function unmatch(matchId: number): Promise<void> {
  const { error } = await supabase.rpc("end_study_match", { p_match_id: matchId });
  if (error) throw new Error(`Couldn't unmatch: ${error.message}`);
}

// Ends every chat with this person and stops them being matched with me again, in any course
export async function block(matchId: number): Promise<void> {
  const { error } = await supabase.rpc("block_study_buddy", { p_match_id: matchId });
  if (error) throw new Error(`Couldn't block: ${error.message}`);
}

// Sends the note and a copy of the chat to the Cohort team, then blocks them
export async function report(matchId: number, reason: string): Promise<void> {
  const text = reason.trim();
  if (!text) throw new Error("Say what happened first.");
  const { error } = await supabase.rpc("report_study_buddy", {
    p_match_id: matchId,
    p_reason: text.slice(0, MAX_REPORT),
  });
  if (error) throw new Error(`Couldn't send the report: ${error.message}`);
}

// I've seen this chat, so it stops counting toward the nav badge
export async function markRead(matchId: number): Promise<void> {
  const { error } = await supabase.rpc("mark_study_match_read", { p_match_id: matchId });
  if (error) throw new Error(error.message);
}

// Active chats with a new match or a message I haven't seen
export async function unreadCount(): Promise<number> {
  const { data, error } = await supabase.rpc("study_buddy_unread_count");
  if (error) throw new Error(error.message);
  return (data as number | null) ?? 0;
}

export async function loadMessages(matchId: number): Promise<StudyMessage[]> {
  const { data, error } = await supabase
    .from("study_messages")
    .select(MESSAGE_COLUMNS)
    .eq("match_id", matchId)
    .order("created_at");
  if (error) throw new Error(`Couldn't load messages: ${error.message}`);
  return data;
}

// The sender is filled in by the database from the login, so it can't be faked
export async function sendMessage(matchId: number, body: string): Promise<StudyMessage> {
  const text = body.trim();
  if (!text) throw new Error("Type a message first.");
  const { data, error } = await supabase
    .from("study_messages")
    .insert({ match_id: matchId, body: text.slice(0, MAX_MESSAGE) })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw new Error(`Couldn't send: ${error.message}`);
  return data;
}
