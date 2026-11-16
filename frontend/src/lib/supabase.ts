import { createClient } from "@supabase/supabase-js";

// The one Supabase client the whole app uses. Import it from here instead of creating another.
// The URL and public key come from frontend/.env (see the README's env setup step).
const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

// False when frontend/.env has no Supabase keys yet. App.tsx shows a setup message instead of the app.
export const supabaseConfigured = url !== "" && key !== "";

// createClient crashes on an empty URL, so without keys it gets a placeholder that is never called.
export const supabase = createClient(url || "http://localhost", key || "missing-key");
