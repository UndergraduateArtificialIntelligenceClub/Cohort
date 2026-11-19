import { supabase } from "./supabase";
import { normalizeCourse } from "./courses";
import { CATEGORIES, type Category, type Deadline } from "../types";

// Shared course library (issue #66). No UI here; SharedLibrary.tsx and the Upload page call these.
// Tables and row-level security come from supabase/migrations/20261118120000_shared_syllabi.sql.

export type SharedSyllabus = {
  id: string;
  course: string; // normalized, e.g. "CMPUT 174"
  instructor: string | null;
  deadlines: Deadline[];
  uploaded_by: string;
  use_count: number;
  updated_at: string;
};

// A "report a mistake" note. Supabase only returns the ones you filed or that are about your own uploads.
export type MistakeReport = {
  id: string;
  syllabus_id: string;
  reported_by: string;
  message: string;
  created_at: string;
};

// Older than this is probably last term's syllabus, so it's left out of search
const FRESH_DAYS = 150;
const MAX_RESULTS = 8;

// Anyone can write any JSON into a shared row, so only keep entries that look like real deadlines
function cleanDeadlines(raw: unknown, course: string): Deadline[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((d) => {
    if (typeof d !== "object" || d === null) return [];
    const { title, date, category, source_text, weight } = d as Record<string, unknown>;
    if (typeof title !== "string" || !title.trim()) return [];
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    if (!CATEGORIES.includes(category as Category)) return [];
    return [
      {
        course,
        title,
        date,
        category: category as Category,
        source_text: typeof source_text === "string" ? source_text : "",
        weight: typeof weight === "number" && Number.isFinite(weight) ? weight : null,
      },
    ];
  });
}

// Search by course code ("cmput174" finds "CMPUT 174") or instructor name, most used first.
// An empty search lists the most used courses.
export async function searchLibrary(query: string): Promise<SharedSyllabus[]> {
  const since = new Date(Date.now() - FRESH_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let request = supabase
    .from("shared_syllabi")
    .select("id, course, instructor, deadlines, uploaded_by, use_count, updated_at")
    .gte("updated_at", since)
    .order("use_count", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(MAX_RESULTS);

  // Values are quoted in the filter below; drop characters that could break out of the quotes or act as wildcards
  const q = query.trim().replace(/[%_\\,()"*]/g, "");
  if (q) {
    const key = q.replace(/\s+/g, "").toUpperCase();
    request = request.or(`search_key.ilike."*${key}*",instructor.ilike."*${q}*"`);
  }

  const { data, error } = await request;
  if (error) throw new Error(`Couldn't search the course library: ${error.message}`);
  return data
    .map((row) => ({ ...row, deadlines: cleanDeadlines(row.deadlines, row.course) }))
    .filter((s) => s.deadlines.length > 0);
}

// Share deadlines the user just confirmed, one library entry per course.
// Sharing the same course again replaces the user's earlier copy.
export async function shareDeadlines(deadlines: Deadline[], instructor: string | null): Promise<void> {
  const byCourse = new Map<string, Deadline[]>();
  for (const d of deadlines) {
    const course = normalizeCourse(d.course);
    if (!course) continue;
    // Only the syllabus facts; never the user's own id or done status
    const entry = {
      course,
      title: d.title,
      date: d.date,
      category: d.category,
      source_text: d.source_text,
      weight: d.weight ?? null,
    };
    byCourse.set(course, [...(byCourse.get(course) ?? []), entry]);
  }
  if (byCourse.size === 0) return;

  const rows = [...byCourse].map(([course, list]) => ({
    course,
    instructor: instructor?.trim().slice(0, 100) || null,
    deadlines: list,
  }));
  // uploaded_by is filled in by the database from the login, so it can't be faked
  const { error } = await supabase.from("shared_syllabi").upsert(rows, { onConflict: "course,uploaded_by" });
  if (error) throw new Error(`Couldn't share deadlines: ${error.message}`);
}

// Count the current user as one more classmate using this shared syllabus
export async function markUsed(id: string): Promise<void> {
  const { error } = await supabase.rpc("use_shared_syllabus", { p_id: id });
  if (error) throw new Error(`Couldn't update the use count: ${error.message}`);
}

// Remove one of the user's own entries from the library
export async function stopSharing(id: string): Promise<void> {
  const { error } = await supabase.from("shared_syllabi").delete().eq("id", id);
  if (error) throw new Error(`Couldn't stop sharing: ${error.message}`);
}

// File (or replace) the user's mistake report on a shared syllabus
export async function reportMistake(syllabusId: string, message: string): Promise<void> {
  const text = message.trim();
  if (!text) throw new Error("Say what's wrong first.");
  const { error } = await supabase
    .from("shared_syllabus_reports")
    .upsert({ syllabus_id: syllabusId, message: text.slice(0, 1000) }, { onConflict: "syllabus_id,reported_by" });
  if (error) throw new Error(`Couldn't send the report: ${error.message}`);
}

// Reports on these entries that the user can see: their own, and any on entries they uploaded
export async function loadReports(syllabusIds: string[]): Promise<MistakeReport[]> {
  if (syllabusIds.length === 0) return [];
  const { data, error } = await supabase
    .from("shared_syllabus_reports")
    .select("id, syllabus_id, reported_by, message, created_at")
    .in("syllabus_id", syllabusIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Couldn't load reports: ${error.message}`);
  return data;
}

// Uploader marks a report as dealt with (or a reporter withdraws theirs)
export async function dismissReport(id: string): Promise<void> {
  const { error } = await supabase.from("shared_syllabus_reports").delete().eq("id", id);
  if (error) throw new Error(`Couldn't dismiss the report: ${error.message}`);
}
