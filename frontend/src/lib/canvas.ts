// Canvas calendar import (#62). Every Canvas user has a private Calendar Feed link (an .ics file of their
// due dates). The backend downloads it and returns deadlines in the same shape as a parsed syllabus.
import type { Deadline, ParseResponse } from "../types";
import { API } from "./config";
import { todayISO } from "./planner";
import { authHeaders } from "./supabase";

// Students sometimes copy a calendar-app link (webcal://), which is the same feed over https
export function cleanFeedUrl(url: string): string {
  return url.trim().replace(/^webcal:\/\//i, "https://");
}

// Fetches the feed and keeps only what's still coming up: the feed has the whole term, and nobody wants to
// review last month's labs. Sorted by date, then time, so the review popup goes in calendar order.
// The link is a private key to the student's calendar, so it's sent once and never saved anywhere.
export async function importCanvas(url: string): Promise<Deadline[]> {
  const res = await fetch(`${API}/import-canvas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ url: cleanFeedUrl(url) }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));

  const data: ParseResponse = await res.json();
  const today = todayISO();
  return data.deadlines
    .filter((d) => d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
}

// FastAPI sends errors as { "detail": "..." }
async function errorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // the body wasn't JSON, so fall through to the generic message
  }
  return `Server error (${res.status})`;
}
