// Sends Cohort's push notifications. pg_cron calls this through kick_notifications() whenever something is due
// (see supabase/migrations/20261121120000_notifications.sql); it doesn't run on a timer of its own.
//
// Deploy:   supabase functions deploy send-notifications --no-verify-jwt
//           (no Supabase login is involved: the cron job proves itself with NOTIFY_SECRET instead)
// Secrets:  supabase secrets set NOTIFY_SECRET=... VAPID_KEYS='...' VAPID_CONTACT=mailto:...
//           SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are already there on every project.
// The README's "Notifications" section has the full setup.

import { createClient } from "jsr:@supabase/supabase-js@2";
import * as webpush from "jsr:@negrel/webpush@0.5.0";
import { composeNotification, type DueRow, type PushPayload, type PushTarget } from "./compose.ts";

const env = (key: string) => Deno.env.get(key) ?? "";

const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

// VAPID keys prove to the browsers' push services that the pushes come from us.
// VAPID_KEYS is the JSON that supabase/scripts/generate-vapid-keys.mjs prints.
let vapidKeys: Promise<CryptoKeyPair> | null = null;
function loadVapidKeys() {
  vapidKeys ??= webpush.importVapidKeys(JSON.parse(env("VAPID_KEYS")));
  return vapidKeys;
}

// Same length check first, then compare every character, so the time taken doesn't hint at the secret
function sameSecret(given: string, expected: string): boolean {
  if (!expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// Push one notification to one browser. Returns false if the browser has dropped the subscription.
async function push(target: PushTarget, payload: PushPayload, kind: DueRow["kind"]): Promise<boolean> {
  // A fresh encryption key for every message, as the Web Push spec (RFC 8291) asks
  const server = await webpush.ApplicationServer.new({
    contactInformation: env("VAPID_CONTACT"),
    vapidKeys: await loadVapidKeys(),
  });
  try {
    await server.subscribe(target).pushTextMessage(JSON.stringify(payload), {
      // A chat alert is worth waking the phone for. "Due tomorrow" goes stale overnight, so it's dropped
      // if the phone stays offline for 3 hours; a chat alert keeps for a day.
      urgency: kind === "study_buddy" ? webpush.Urgency.High : webpush.Urgency.Normal,
      ttl: kind === "study_buddy" ? 24 * 60 * 60 : 3 * 60 * 60,
      // A newer push with the same topic replaces one that hasn't been delivered yet
      topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, ""),
    });
    return true;
  } catch (e) {
    if (e instanceof webpush.PushMessageError && [404, 410].includes(e.response.status)) return false;
    throw e;
  }
}

Deno.serve(async (req) => {
  if (!sameSecret(req.headers.get("x-notify-secret") ?? "", env("NOTIFY_SECRET"))) {
    return new Response("Not allowed", { status: 401 });
  }
  // Apple's push service turns away pushes without a real contact address, so both are required
  const missing = ["VAPID_KEYS", "VAPID_CONTACT"].filter((key) => !env(key));
  if (missing.length > 0) {
    console.error(`${missing.join(" and ")} not set. See the README's Notifications section.`);
    return new Response(`${missing.join(" and ")} not set`, { status: 500 });
  }

  // Everything due right now. The database marks it as sent in the same step, so it never goes out twice.
  const { data, error } = await db.rpc("claim_due_notifications");
  if (error) {
    console.error("claim_due_notifications failed:", error.message);
    return new Response(error.message, { status: 500 });
  }

  const rows = (data ?? []) as DueRow[];
  let sent = 0;
  let failed = 0;
  const gone: string[] = [];
  await Promise.all(
    rows.flatMap((row) => {
      const payload = composeNotification(row);
      return row.subscriptions.map(async (target) => {
        try {
          if (await push(target, payload, row.kind)) sent++;
          else gone.push(target.endpoint);
        } catch (e) {
          failed++;
          console.error(`Push to ${new URL(target.endpoint).host} failed:`, String(e));
        }
      });
    })
  );

  // Browsers that unsubscribed or expired: stop trying them.
  // Google's push service can call a subscription "gone" for a few seconds after it's made, so ones saved in the
  // last hour are kept; a really dead one is removed on a later push. (The app re-saves it on every visit.)
  if (gone.length > 0) {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { error: deleteError } = await db
      .from("push_subscriptions")
      .delete()
      .in("endpoint", gone)
      .lt("updated_at", hourAgo);
    if (deleteError) console.error("Couldn't remove expired subscriptions:", deleteError.message);
  }

  const summary = { notifications: rows.length, sent, failed, expired: gone.length };
  console.log(summary);
  return Response.json(summary);
});
