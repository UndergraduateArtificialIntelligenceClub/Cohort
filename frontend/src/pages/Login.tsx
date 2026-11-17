import { useEffect, useState, type FormEvent } from "react";
import { APP_NAME } from "../lib/config";
import { supabase } from "../lib/supabase";

// Login and signup with @ualberta.ca emails: issue #31. Continue with Google: issue #65.
// Shown by App.tsx instead of the whole app when nobody is logged in (no route of its own).
// The real domain check is the Supabase signup hook in supabase/migrations/. The check here just gives a faster message.
// The same hook also blocks new Google accounts that aren't @ualberta.ca.
const SCHOOL_DOMAIN = "ualberta.ca";

type Tab = "signin" | "signup";
type Message = { text: string; kind: "error" | "info" };
// Which button is waiting, so only that one shows a loading label
type Busy = "form" | "google" | null;

// If Supabase rejected a Google login (e.g. the signup hook blocked a non-UAlberta account),
// it sends the browser back here with ?error_description=... or #error_description=...
function oauthError(): Message | null {
  const params = new URLSearchParams(window.location.search + "&" + window.location.hash.slice(1));
  const text = params.get("error_description");
  return text ? { text, kind: "error" } : null;
}

const tabs: { id: Tab; label: string }[] = [
  { id: "signin", label: "Sign in" },
  { id: "signup", label: "Create account" },
];

function Login() {
  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<Message | null>(oauthError);
  const [busy, setBusy] = useState<Busy>(null);

  // Clear a Google error out of the address bar so a refresh doesn't show it again
  useEffect(() => {
    if (oauthError()) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  function switchTab(next: Tab) {
    setTab(next);
    setMessage(null);
  }

  async function signInWithGoogle() {
    setMessage(null);
    setBusy("google");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        // hd tells Google to only offer UAlberta accounts in its account picker. It's only a hint, the signup hook enforces it.
        // Google sends the user back to this site afterwards (must be in Supabase's Redirect URLs)
        options: { redirectTo: window.location.origin, queryParams: { hd: SCHOOL_DOMAIN } },
      });
      if (error) {
        setMessage({ text: error.message, kind: "error" });
        setBusy(null);
      }
      // On success the browser is already leaving for Google, so keep the button disabled
    } catch {
      setMessage({ text: "Something went wrong. Check your connection and try again.", kind: "error" });
      setBusy(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const cleanEmail = email.trim().toLowerCase();

    if (tab === "signup" && !cleanEmail.endsWith(`@${SCHOOL_DOMAIN}`)) {
      setMessage({ text: `Please sign up with your @${SCHOOL_DOMAIN} email.`, kind: "error" });
      return;
    }

    setBusy("form");
    try {
      if (tab === "signin") {
        // On success App.tsx sees the new session and shows the app, so there's nothing else to do here
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) {
          const text =
            error.code === "email_not_confirmed"
              ? "Please confirm your email first. Check your inbox for the link."
              : error.message;
          setMessage({ text, kind: "error" });
        }
      } else {
        // The confirmation link brings the user back to this site (must be in Supabase's Redirect URLs)
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) {
          setMessage({ text: error.message, kind: "error" });
        } else if (!data.session) {
          // Email confirmation is on, so there's no session until they click the link
          setTab("signin");
          setPassword("");
          setMessage({ text: "Check your email to confirm your account, then sign in.", kind: "info" });
        }
      }
    } catch {
      // Supabase usually returns problems as `error` above. This catches anything unexpected so the button never stays stuck.
      setMessage({ text: "Something went wrong. Check your connection and try again.", kind: "error" });
    } finally {
      setBusy(null);
    }
  }

  const submitLabel = tab === "signin" ? "Sign in" : "Create account";
  const busyLabel = tab === "signin" ? "Signing in…" : "Creating account…";

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-lg border border-gray-300 bg-white p-6">
        <h1 className="mb-4 text-center text-2xl font-bold text-blue-600">{APP_NAME}</h1>

        {/* Works for both signing in and creating an account, so it sits above the tabs */}
        <button
          type="button"
          onClick={signInWithGoogle}
          disabled={busy !== null}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 px-4 py-2 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <GoogleIcon />
          {busy === "google" ? "Opening Google…" : "Continue with Google"}
        </button>

        <div className="my-4 flex items-center gap-3 text-sm text-gray-500">
          <span className="h-px flex-1 bg-gray-300" />
          or use email
          <span className="h-px flex-1 bg-gray-300" />
        </div>

        <div className="mb-4 flex gap-4 border-b border-gray-300">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => switchTab(t.id)}
              disabled={busy !== null}
              className={`-mb-px border-b-2 pb-2 ${
                tab === t.id ? "border-blue-600 font-semibold text-blue-600" : "border-transparent text-gray-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <p className="mb-4 text-sm text-gray-600">
          {tab === "signin"
            ? `Use your @${SCHOOL_DOMAIN} account.`
            : `Only @${SCHOOL_DOMAIN} emails can sign up. We'll email you a link to confirm.`}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              type="email"
              required
              autoComplete="email"
              placeholder={`you@${SCHOOL_DOMAIN}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-600 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Password
            <input
              type="password"
              required
              autoComplete={tab === "signin" ? "current-password" : "new-password"}
              placeholder={tab === "signup" ? "At least 6 characters" : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-600 focus:outline-none"
            />
          </label>

          {message && (
            <p role="status" className={`text-sm ${message.kind === "error" ? "text-red-600" : "text-blue-700"}`}>
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={busy !== null}
            className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy === "form" ? busyLabel : submitLabel}
          </button>
        </form>
      </div>
    </main>
  );
}

// Google's "G" logo for the sign-in button
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

export default Login;
