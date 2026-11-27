import { supabase, supabaseConfigured } from "./supabase";

// Launch metrics: usage counts and the team's /admin page (supabase/migrations/20261127140000_usage_events.sql).
// The Privacy Policy promises these are counts only: never put syllabus text, deadlines, course names or
// messages in an event. log_event() in the database rejects anything else anyway.

export type EventName = "app_open" | "parsed" | "parse_failed" | "review_saved" | "signup_source";
export type EventCounts = Partial<Record<"found" | "undated" | "removed" | "renamed" | "added", number>>;

// Record an event. Never throws and never waits on the caller: a metric failing must not break the app.
export function logEvent(name: EventName, source: string | null = null, counts: EventCounts = {}): void {
  if (!supabaseConfigured) return;
  // The database only takes whole numbers from 0 to 1000; a huge Canvas feed shouldn't lose the whole event
  const clamped = Object.fromEntries(
    Object.entries(counts).map(([key, n]) => [key, Math.min(1000, Math.max(0, Math.round(n ?? 0)))])
  );
  supabase
    .rpc("log_event", { p_name: name, p_source: source, p_counts: clamped })
    .then(({ error }) => {
      if (error) console.warn(`Couldn't log ${name}: ${error.message}`);
    });
}

// Where a new account came from: links we post carry ?utm_source=reddit (or discord, instagram, poster...).
// The visitor usually isn't logged in yet, so the source waits in localStorage until they are.
const SOURCE_KEY = "cohort.signupSource";

// Call once on page load, before login. Keeps the first source seen on this device.
export function rememberSource(): void {
  const raw = new URLSearchParams(window.location.search).get("utm_source");
  const source = raw?.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 40);
  if (source && !localStorage.getItem(SOURCE_KEY)) localStorage.setItem(SOURCE_KEY, source);
}

// Call once someone is logged in. The database keeps it only for a new account's first source.
export function logSignupSource(): void {
  const source = localStorage.getItem(SOURCE_KEY);
  if (!source) return;
  localStorage.removeItem(SOURCE_KEY);
  logEvent("signup_source", source);
}

// Totals from admin_metrics(), for the /admin page
type Share = { cohort: number; activated?: number; returned?: number };
export type ParseStats = {
  parsed: number;
  failed: number;
  saved: number;
  found: number;
  removed: number;
  renamed: number;
  undated: number;
  added: number;
  unchanged: number;
};
export type Metrics = {
  generated_at: string;
  // When usage counts began (the first event logged). Active users, uploads and retention only exist from here.
  counting_since: string | null;
  include_team: boolean;
  users: number;
  new_7d: number;
  activated: number;
  activation_24h: Share;
  active_today: number;
  active_7d: number;
  active_30d: number;
  week1_retention: Share;
  week4_retention: Share;
  courses_per_person: { "1": number; "2": number; "3": number; "4": number; "5+": number; average: number | null };
  push_people: number;
  // active is null for days before counting_since: not recorded, which isn't the same as nobody
  daily: { date: string; signups: number; activated: number; active: number | null }[];
  parsing: Partial<Record<"syllabus" | "canvas" | "library", ParseStats>>;
  library_live: number;
  top_courses: { course: string; students: number; waiting: number; shared: number }[];
  study_buddy: { waiting: number; matches: number; both_wrote: number; messages: number };
  sources: Record<string, number>;
};

// Only works for people in metrics_admins; everyone else gets "Not allowed."
// includeTeam: count the team's own accounts too, to check your own activity is being recorded
export async function loadMetrics(includeTeam = false): Promise<Metrics> {
  const { data, error } = await supabase.rpc("admin_metrics", { p_include_team: includeTeam });
  if (error) throw new Error(error.message === "Not allowed." ? "Not allowed." : `Couldn't load metrics: ${error.message}`);
  return data as Metrics;
}
