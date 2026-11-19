import { useEffect, useId, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import LoginDemo from "../components/LoginDemo";
import { APP_NAME } from "../lib/config";
import { supabase } from "../lib/supabase";

// Login and signup with @ualberta.ca emails: issue #31. Continue with Google: issue #65.
// Shown by App.tsx instead of the whole app when nobody is logged in (no route of its own).
// The real domain check is the Supabase signup hook in supabase/migrations/. The check here just gives a faster message.
// The same hook also blocks new Google accounts that aren't @ualberta.ca.
// Look ported from CalendarAI Mini's login page: intro and demo on the left, sign-in card on the right.
const SCHOOL_DOMAIN = "ualberta.ca";
// Sign-up is UAlberta-only, so visitors (recruiters, mostly) get a hosted walkthrough instead
const TOUR_URL = "https://cohort-landing-pg.vercel.app/";

type Mode = "signin" | "signup";
type Message = { text: string; kind: "error" | "info" };
// Which button is waiting, so only that one shows a spinner
type Busy = Mode | "google" | null;

// If Supabase rejected a Google login (e.g. the signup hook blocked a non-UAlberta account),
// it sends the browser back here with ?error_description=... or #error_description=...
function oauthError(): Message | null {
  const params = new URLSearchParams(window.location.search + "&" + window.location.hash.slice(1));
  const text = params.get("error_description");
  return text ? { text, kind: "error" } : null;
}

const FACTS = [
  "Reads PDFs and pasted text",
  "Nothing is added until you confirm it",
  "Use deadlines a classmate already shared",
  "Find a study buddy in the same course",
];

// Mini's colors and fonts, only for this page. Fonts are loaded in index.html.
const tokens = {
  "--bg": "#faf9f7",
  "--surface": "#ffffff",
  "--subtle": "#f3f2ef",
  "--border": "#e7e5e0",
  "--border-strong": "#d6d3cc",
  "--border-hover": "#bfbab0",
  "--ink": "#1c1a17",
  "--ink-hover": "#3a3732",
  "--ink-2": "#5c574f",
  "--ink-3": "#78736a",
  "--accent": "#1f7a5a",
  "--accent-subtle": "#e8f2ed",
  "--danger": "#b42318",
  "--danger-subtle": "#fdf0ee",
  "--font-heading": '"Source Serif 4", Georgia, serif',
  "--font-body": '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  "--font-mono": "ui-monospace, SFMono-Regular, Menlo, monospace",
} as CSSProperties;

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)";
const btn = `inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-3 font-medium transition-colors active:enabled:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`;
const btnSecondary = `${btn} border-(--border-strong) bg-(--surface) shadow-[0_1px_2px_rgba(28,26,23,0.05)] hover:enabled:border-(--border-hover) hover:enabled:bg-(--subtle)`;
const btnPrimary = `${btn} border-(--ink) bg-(--ink) text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(28,26,23,0.2)] hover:enabled:border-(--ink-hover) hover:enabled:bg-(--ink-hover)`;
const input =
  "h-8 w-full rounded-md border border-(--border-strong) bg-(--surface) px-2.5 shadow-[0_1px_2px_rgba(28,26,23,0.05)] transition-[border-color,box-shadow] placeholder:text-(--ink-3) hover:not-focus:border-(--border-hover) focus:border-(--accent) focus:shadow-[0_0_0_3px_var(--accent-subtle)] focus:outline-none";

function Login() {
  const id = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<Message | null>(oauthError);
  const [busy, setBusy] = useState<Busy>(null);

  // Clear a Google error out of the address bar so a refresh doesn't show it again
  useEffect(() => {
    if (oauthError()) window.history.replaceState(null, "", window.location.pathname);
  }, []);

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

  // "Sign in" submits the form (so Enter works); "Create account" calls this with "signup"
  async function submit(mode: Mode) {
    setMessage(null);
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setMessage({ text: "Enter your email and password.", kind: "error" });
      return;
    }
    if (mode === "signup" && !cleanEmail.endsWith(`@${SCHOOL_DOMAIN}`)) {
      setMessage({ text: `Please sign up with your @${SCHOOL_DOMAIN} email.`, kind: "error" });
      return;
    }

    setBusy(mode);
    try {
      if (mode === "signin") {
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

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit("signin");
  }

  return (
    <div
      style={tokens}
      className="min-h-svh bg-(--bg) font-(family-name:--font-body) text-sm leading-normal text-(--ink) antialiased"
    >
      <main className="mx-auto grid min-h-svh max-w-[960px] grid-cols-1 content-start gap-8 px-4 py-8 md:px-6 md:py-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:content-center lg:items-center lg:gap-12">
        {/* On one column, display: contents lets the sign-in card sit between the intro and the demo */}
        <section className="max-lg:contents">
          <div className="inline-flex items-center gap-2 font-semibold max-lg:-mb-3 lg:mb-8">
            <Logo />
            <span>{APP_NAME}</span>
          </div>
          <h1 className="max-w-[18ch] text-balance font-(family-name:--font-heading) text-[28px] leading-[1.2] font-semibold tracking-[-0.01em] max-lg:-mt-3">
            Every deadline from your syllabi, on one calendar.
          </h1>
          <p className="mt-3 max-w-[48ch] text-pretty text-(--ink-2) max-lg:-mt-3">
            Upload a course syllabus and {APP_NAME} finds the assignments, labs, quizzes and exams in it. You check each
            date before it's saved.
          </p>
          <LoginDemo />
          <ul className="mt-6 grid grid-cols-1 gap-x-6 text-xs text-(--ink-2) md:grid-cols-2 max-lg:order-2 max-lg:mt-0">
            {FACTS.map((fact) => (
              <li key={fact} className="flex min-w-0 items-center gap-2 border-t border-(--border) py-2">
                <Icon className="text-(--accent)" size={14}>
                  <path d="M20 6 9 17l-5-5" />
                </Icon>
                {fact}
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby={`${id}-heading`}
          className="flex flex-col gap-4 rounded-md border border-(--border) bg-(--surface) p-6 shadow-[0_1px_2px_rgba(28,26,23,0.06),0_8px_24px_rgba(28,26,23,0.1)]"
        >
          <div>
            <h2 id={`${id}-heading`} className="font-semibold">
              Sign in
            </h2>
            <p className="mt-1 text-(--ink-2)">
              For University of Alberta students. Use your @{SCHOOL_DOMAIN} account.
            </p>
          </div>

          {/* Works for both signing in and creating an account */}
          <button type="button" onClick={signInWithGoogle} disabled={busy !== null} className={`${btnSecondary} w-full`}>
            {busy === "google" ? <Spinner /> : <GoogleIcon />}
            {busy === "google" ? "Opening Google…" : "Continue with Google"}
          </button>

          <div className="flex items-center gap-3 text-xs text-(--ink-3) before:h-px before:flex-1 before:bg-(--border) after:h-px after:flex-1 after:bg-(--border)">
            or
          </div>

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-email`} className="text-xs font-medium text-(--ink-2)">
                Email
              </label>
              <input
                id={`${id}-email`}
                type="email"
                autoComplete="email"
                placeholder={`you@${SCHOOL_DOMAIN}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={input}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-password`} className="text-xs font-medium text-(--ink-2)">
                Password
              </label>
              <div className="relative">
                <input
                  id={`${id}-password`}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${input} pr-9`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className={`absolute top-1/2 right-0.5 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-(--ink-3) hover:text-(--ink) ${focusRing}`}
                >
                  {showPassword ? (
                    <Icon>
                      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                      <path d="m2 2 20 20" />
                    </Icon>
                  ) : (
                    <Icon>
                      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                      <circle cx="12" cy="12" r="3" />
                    </Icon>
                  )}
                </button>
              </div>
            </div>

            {message && (
              <p
                role="status"
                className={`flex items-start gap-2 rounded-md border px-3 py-2 ${
                  message.kind === "error"
                    ? "border-(--danger)/25 bg-(--danger-subtle) text-(--danger)"
                    : "border-(--border) bg-(--subtle) text-(--ink-2)"
                }`}
              >
                <Icon className="mt-0.5">
                  {message.kind === "error" ? (
                    <>
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                      <path d="M12 9v4M12 17h.01" />
                    </>
                  ) : (
                    <>
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4M12 8h.01" />
                    </>
                  )}
                </Icon>
                <span>{message.text}</span>
              </p>
            )}

            <div className="mt-1 flex gap-2 max-md:[&>button]:flex-1">
              <button type="submit" disabled={busy !== null} className={btnPrimary}>
                {busy === "signin" && <Spinner />}
                Sign in
              </button>
              <button type="button" onClick={() => submit("signup")} disabled={busy !== null} className={btnSecondary}>
                {busy === "signup" && <Spinner />}
                Create account
              </button>
            </div>
          </form>

          <p className="border-t border-(--border) pt-4 text-xs text-(--ink-3)">
            Just exploring?{" "}
            <a
              href={TOUR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1 font-medium text-(--accent) no-underline underline-offset-[3px] hover:underline ${focusRing}`}
            >
              Take a tour of the app
              <Icon size={13}>
                <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              </Icon>
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}

// Line icons drawn like Mini's (Lucide shapes, 1.75 stroke)
function Icon({ children, size = 16, className = "" }: { children: ReactNode; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`flex-none ${className}`}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function Spinner() {
  return <span className="inline-block size-3 flex-none animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />;
}

// Calendar mark with an accent square, from Mini
function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="26" height="23" rx="5" fill="var(--ink)" />
      <path d="M10 3v6M22 3v6" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="18" y="19" width="6" height="6" rx="1.5" fill="var(--accent)" />
    </svg>
  );
}

// Google's "G" logo for the sign-in button
function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true" className="flex-none">
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
