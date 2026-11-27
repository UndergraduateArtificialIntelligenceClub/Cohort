// Turns a row from claim_due_notifications (supabase/migrations/20261121120000_notifications.sql) into the
// notification people see. No Deno or network here, so it's easy to test.
// frontend/public/sw.js reads the same fields when the push arrives.

export type DueDeadline = {
  course: string | null; // null for a personal item. Those only ever come in tomorrow, never heads_up
  title: string;
  date: string; // "YYYY-MM-DD"
  // "23:59:00": when it's due, or when an exam starts. null when the syllabus didn't say.
  // Can be missing if this function is deployed before 20261124120000_due_times.sql has run.
  time?: string | null;
  category: string;
  weight: number | null;
};

export type DueRow =
  | {
      user_id: string;
      kind: "study_buddy";
      data: { match_id: number; course: string; partner_name: string; new_match: boolean };
      badge: number;
      subscriptions: PushTarget[];
    }
  | {
      user_id: string;
      kind: "deadlines";
      data: { tomorrow: DueDeadline[]; heads_up: DueDeadline[] };
      badge: number;
      subscriptions: PushTarget[];
    };

export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };

// What the service worker gets
export type PushPayload = {
  title: string;
  body: string;
  url: string; // where tapping it goes
  tag: string; // a newer notification with the same tag replaces the old one
  badge: number; // unread chats, for the number on the app icon
};

// How many deadlines a notification names before it says "and 2 more"
const MAX_LISTED = 3;

// "CMPUT 174 Assignment 2", or just "Dentist" for a personal item
const name = (d: DueDeadline) => (d.course === null ? d.title : `${d.course} ${d.title}`);

// "11:59 PM" for "23:59:00". Times are Edmonton wall-clock times, so there's nothing to convert.
// Same as timeLabel in frontend/src/lib/planner.ts.
function clock(time: string): string {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const isExam = (d: DueDeadline) => d.category === "midterm" || d.category === "final";

// "CMPUT 174 Assignment 2 at 11:59 PM", or just the name when there's no time
const nameAt = (d: DueDeadline) => (d.time ? `${name(d)} at ${clock(d.time)}` : name(d));

// "CMPUT 174 Quiz 3 at 9:00 AM, STAT 151 Lab 3 and 2 more"
function list(deadlines: DueDeadline[]): string {
  const names = deadlines.slice(0, MAX_LISTED).map(nameAt);
  const more = deadlines.length - names.length;
  if (more > 0) return `${names.join(", ")} and ${more} more`;
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// "Tuesday" for "2026-11-24"
function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "long", timeZone: "UTC" });
}

// "Due at 11:59 PM.", "Starts at 9:00 AM." for an exam, "At 2:30 PM." for a personal item
function atSentence(d: DueDeadline, time: string): string {
  const verb = d.course === null ? "At" : isExam(d) ? "Starts at" : "Due at";
  return `${verb} ${clock(time)}.`;
}

function deadlineMessage(tomorrow: DueDeadline[], headsUp: DueDeadline[]): { title: string; body: string } {
  if (tomorrow.length > 0) {
    // A dentist appointment isn't "due", so only say "due" and "deadlines" when it's all schoolwork
    const allSchool = tomorrow.every((d) => d.course !== null);
    const title =
      tomorrow.length === 1
        ? `${allSchool ? "Due tomorrow" : "Tomorrow"}: ${name(tomorrow[0])}`
        : allSchool
          ? `${tomorrow.length} deadlines due tomorrow`
          : `${tomorrow.length} things tomorrow`;
    const only = tomorrow.length === 1 ? tomorrow[0] : null;
    const parts = !only ? [`${list(tomorrow)}.`] : only.time ? [atSentence(only, only.time)] : [];
    if (headsUp.length > 0) parts.push(`Also coming up ${weekday(headsUp[0].date)}: ${list(headsUp)}.`);
    if (parts.length === 0) parts.push(allSchool ? "Open Cohort to check it off when it's done." : "Open Cohort to see your calendar.");
    return { title, body: parts.join(" ") };
  }
  if (headsUp.length === 1) {
    const d = headsUp[0];
    const worth = d.weight ? ` It's worth ${d.weight}% of your grade.` : "";
    const when = d.time ? `${isExam(d) ? "Starts" : "Due"} ${weekday(d.date)} at ${clock(d.time)}.` : `Due ${weekday(d.date)}.`;
    return { title: `${name(d)} is in 3 days`, body: `${when}${worth}` };
  }
  return { title: `${headsUp.length} big deadlines in 3 days`, body: `Due ${weekday(headsUp[0].date)}: ${list(headsUp)}.` };
}

export function composeNotification(row: DueRow): PushPayload {
  if (row.kind === "study_buddy") {
    const { match_id, course, partner_name, new_match } = row.data;
    // Who and which course only. The message text never leaves the app, since it would show on a lock screen.
    return {
      title: new_match ? "You have a study buddy" : `New message from ${partner_name}`,
      body: new_match ? `You're matched with ${partner_name} in ${course}. Say hi!` : `Your ${course} study buddy chat`,
      url: `/study-buddy?chat=${match_id}`,
      tag: `chat-${match_id}`,
      badge: row.badge,
    };
  }
  return { ...deadlineMessage(row.data.tomorrow, row.data.heads_up), url: "/", tag: "deadlines", badge: row.badge };
}
