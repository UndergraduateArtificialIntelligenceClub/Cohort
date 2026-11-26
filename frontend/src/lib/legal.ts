import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// Terms and Privacy agreement: issue #61.
// Which version of the Terms and Privacy Policy someone agreed to. It's saved on their account when they sign up.
// Change it whenever the wording changes in a way people need to agree to again.
// While it starts with "draft", the Terms and Privacy pages show a "Draft, not final" banner.
export const TERMS_VERSION = "draft-2026-11-22";
export const LEGAL_IS_DRAFT = TERMS_VERSION.startsWith("draft");

// Saved in the Supabase user's metadata (auth.users.raw_user_meta_data).
// Users can edit their own metadata, so this is a record of what the app saw, not tamper-proof proof.
export type ConsentStamp = { terms_version: string; terms_accepted_at: string };

export function consentStamp(): ConsentStamp {
  return { terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() };
}

// Google sign-in leaves the site, so the stamp waits in the browser until the user comes back logged in
const PENDING_KEY = "cohort.pendingConsent";
// An old tick (e.g. they backed out of Google) shouldn't count for a later, unrelated login
const PENDING_MAX_AGE_MS = 15 * 60 * 1000;

export function rememberConsentForRedirect() {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(consentStamp()));
  } catch {
    // Storage blocked (private mode): the stamp is skipped, sign-in still works
  }
}

// Google sent them back with an error (e.g. not a UAlberta account), so that tick shouldn't carry over to another login
export function clearPendingConsent() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage blocked: nothing was saved anyway
  }
}

// Called once someone is logged in. Writes a waiting Google stamp to their account,
// unless they already agreed to this same version (keeps the first time they agreed).
export async function savePendingConsent(user: User) {
  let pending: ConsentStamp;
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return;
    // Removed before saving, so a second call (React runs effects twice in dev) doesn't save it twice
    localStorage.removeItem(PENDING_KEY);
    pending = JSON.parse(raw) as ConsentStamp;
  } catch {
    return;
  }

  const age = Date.now() - new Date(pending.terms_accepted_at).getTime();
  if (!(age >= 0 && age < PENDING_MAX_AGE_MS)) return;
  if (user.user_metadata?.terms_version === pending.terms_version) return;

  const { error } = await supabase.auth.updateUser({ data: pending });
  if (error) {
    // Put it back so the next page load can try again (until it expires)
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch {
      // Nothing more to do
    }
  }
}
