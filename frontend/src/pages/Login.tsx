import { useState, type FormEvent } from "react";
import { APP_NAME } from "../lib/config";
import { supabase } from "../lib/supabase";

// Login and signup with @ualberta.ca emails: issue #31
// Shown by App.tsx instead of the whole app when nobody is logged in (no route of its own).
// The real domain check is the Supabase signup hook in supabase/migrations/. The check here just gives a faster message.
const SCHOOL_DOMAIN = "ualberta.ca";

type Tab = "signin" | "signup";
type Message = { text: string; kind: "error" | "info" };

const tabs: { id: Tab; label: string }[] = [
  { id: "signin", label: "Sign in" },
  { id: "signup", label: "Create account" },
];

function Login() {
  const [tab, setTab] = useState<Tab>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);

  function switchTab(next: Tab) {
    setTab(next);
    setMessage(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const cleanEmail = email.trim().toLowerCase();

    if (tab === "signup" && !cleanEmail.endsWith(`@${SCHOOL_DOMAIN}`)) {
      setMessage({ text: `Please sign up with your @${SCHOOL_DOMAIN} email.`, kind: "error" });
      return;
    }

    setBusy(true);
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
      setBusy(false);
    }
  }

  const submitLabel = tab === "signin" ? "Sign in" : "Create account";
  const busyLabel = tab === "signin" ? "Signing in…" : "Creating account…";

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm rounded-lg border border-gray-300 bg-white p-6">
        <h1 className="mb-4 text-center text-2xl font-bold text-blue-600">{APP_NAME}</h1>

        <div className="mb-4 flex gap-4 border-b border-gray-300">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => switchTab(t.id)}
              disabled={busy}
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
            disabled={busy}
            className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? busyLabel : submitLabel}
          </button>
        </form>
      </div>
    </main>
  );
}

export default Login;
