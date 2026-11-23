// Turns a row from claim_due_notifications (supabase/migrations/20261121120000_notifications.sql) into the
// notification people see. No Deno or network here, so it's easy to test.
// frontend/public/sw.js reads the same fields when the push arrives.

export type DueDeadline = {
  course: string | null; // null for a personal item. Those only ever come in tomorrow, never heads_up
  title: string;
  date: string; // "YYYY-MM-DD"
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

// "CMPUT 174 Assignment 2, STAT 151 Lab 3 and 2 more"
function list(deadlines: DueDeadline[]): string {
  const names = deadlines.slice(0, MAX_LISTED).map(name);
  const more = deadlines.length - names.length;
  if (more > 0) return `${names.join(", ")} and ${more} more`;
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// "Tuesday" for "2026-11-24"
function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "long", timeZone: "UTC" });
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
    const parts = tomorrow.length === 1 ? [] : [`${list(tomorrow)}.`];
    if (headsUp.length > 0) parts.push(`Also coming up ${weekday(headsUp[0].date)}: ${list(headsUp)}.`);
    if (parts.length === 0) parts.push(allSchool ? "Open Cohort to check it off when it's done." : "Open Cohort to see your calendar.");
    return { title, body: parts.join(" ") };
  }
  if (headsUp.length === 1) {
    const d = headsUp[0];
    const worth = d.weight ? ` It's worth ${d.weight}% of your grade.` : "";
    return { title: `${name(d)} is in 3 days`, body: `Due ${weekday(d.date)}.${worth}` };
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
