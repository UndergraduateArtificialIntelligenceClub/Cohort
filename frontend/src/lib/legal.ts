import { supabase } from "./supabase";

// Terms of Service and Privacy Policy agreement: issue #61 (supabase/migrations/20261127130000_terms_acceptances.sql).
// The version people agree to. Change it whenever the wording changes in a way people need to agree to again:
// everyone is asked once more the next time they open the app.
// While it starts with "draft", the Terms and Privacy pages show a "Draft, not final" banner.
export const TERMS_VERSION = "2026-11-27";
export const LEGAL_IS_DRAFT = TERMS_VERSION.startsWith("draft");

// Shown as "Last updated" on both pages. Change it together with TERMS_VERSION.
export const LEGAL_UPDATED = "November 27, 2026";

// Where the Terms and Privacy pages send questions, reports and data requests.
export const CONTACT_EMAIL = "cohort.app.team@gmail.com";

// "current": agreed to this version. "updated": agreed only to an older one. "never": hasn't agreed yet.
export type TermsStatus = "current" | "updated" | "never";

// Has the logged in user agreed to the current version?
export async function loadTermsStatus(): Promise<TermsStatus> {
  const { data, error } = await supabase.from("terms_acceptances").select("version");
  if (error) throw new Error(`Couldn't check the Terms: ${error.message}`);
  if (data.some((row) => row.version === TERMS_VERSION)) return "current";
  return data.length > 0 ? "updated" : "never";
}

// Save that the logged in user agreed to the current version. The database records the time.
export async function acceptTerms(): Promise<void> {
  const { error } = await supabase.rpc("accept_terms", { p_version: TERMS_VERSION });
  if (error) throw new Error(`Couldn't save your agreement: ${error.message}`);
}
