import { useEffect, useState, type ReactNode } from "react";
import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router";
import type { Session } from "@supabase/supabase-js";
import { APP_NAME } from "./lib/config";
import { loadTermsStatus, type TermsStatus } from "./lib/legal";
import { supabase, supabaseConfigured } from "./lib/supabase";
import { useUnreadCount } from "./lib/useUnreadCount";
import AccountMenu from "./components/AccountMenu";
import Footer from "./components/Footer";
import StudyBuddyBadge from "./components/StudyBuddyBadge";
import { IconBell, IconCalendar, IconUpload, IconUsers, Logo } from "./components/Icons";
import NotificationListener from "./components/NotificationListener";
import NotificationSettings from "./components/NotificationSettings";
import AcceptTerms from "./pages/AcceptTerms";
import Calendar from "./pages/Calendar";
import Login from "./pages/Login";
import Privacy from "./pages/Privacy";
import ResetPassword from "./pages/ResetPassword";
import StudyBuddy from "./pages/StudyBuddy";
import Terms from "./pages/Terms";
import Upload from "./pages/Upload";

const openedFromResetLink = new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery";

// Each page lives in its own file in src/pages so pairs don't edit the same file.
// Popups (like the review step after upload) live in src/components.
// Add new pages here and in the routes below. Phones show them as bottom tabs with these icons.
const links = [
  { to: "/", label: "Calendar", icon: IconCalendar },
  { to: "/upload", label: "Upload", icon: IconUpload },
  { to: "/study-buddy", label: "Study buddy", icon: IconUsers },
];

function App() {
  const [session, setSession] = useState<Session | null>(null);
  // True until Supabase tells us whether someone is already logged in (skipped when there are no keys)
  const [checking, setChecking] = useState(supabaseConfigured);
  // Unread study buddy chats (#67), shown on the Study buddy tab
  const unread = useUnreadCount();
  // Desktop: the Notifications sheet, opened from the bell in the nav (phones open it from the account menu)
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [recovering, setRecovering] = useState(openedFromResetLink);
  // Has this account agreed to the current Terms and Privacy Policy? (issue #61). Kept with the user id it's for,
  // so logging in as someone else counts as not checked yet.
  const [terms, setTerms] = useState<{ userId: string; status: TermsStatus } | null>(null);
  const userId = session?.user.id;
  const termsStatus = userId && terms?.userId === userId ? terms.status : null;

  // On page load: are we already logged in? Then keep listening for login/logout
  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") setRecovering(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Once someone is logged in, check their Terms agreement. Keyed on the user id, not the session, so the
  // hourly token refresh doesn't check again.
  useEffect(() => {
    if (!userId) return;
    let stale = false;
    loadTermsStatus()
      .then((status) => !stale && setTerms({ userId, status }))
      // Couldn't check (offline, or the migration isn't run): ask rather than let them in unchecked.
      // Agreeing again is harmless, since the first time is kept.
      .catch(() => !stale && setTerms({ userId, status: "never" }));
    return () => {
      stale = true;
    };
  }, [userId]);

  // No Supabase keys in frontend/.env: in development, skip login so teammates can still work on other pages.
  // On the live site, show an error instead of letting anyone in.
  if (!supabaseConfigured && !import.meta.env.DEV) {
    return <p className="error-text p-8 text-center">Supabase isn't set up for this site. Ask the project lead.</p>;
  }
  if (checking) return <p className="muted p-8 text-center">Loading…</p>;

  // Logged out: the login page, plus the Terms and Privacy pages so people can read them before signing up
  if (supabaseConfigured && !session) {
    return (
      <OutsideApp
        homeLabel="Sign in"
        home={
          <>
            <Login />
            <Footer />
          </>
        }
      />
    );
  }
  if (recovering && session) {
    return <ResetPassword email={session.user.email} onDone={() => setRecovering(false)} />;
  }
  // Logged in but not agreed to the current Terms yet (issue #61): ask before showing the app
  if (session && userId) {
    if (termsStatus === null) return <p className="muted p-8 text-center">Loading…</p>;
    if (termsStatus !== "current") {
      return (
        <OutsideApp
          homeLabel="Back"
          home={
            <AcceptTerms
              email={session.user.email}
              status={termsStatus}
              onAccepted={() => setTerms({ userId, status: "current" })}
            />
          }
        />
      );
    }
  }

  return (
    <BrowserRouter>
      {session && <NotificationListener />}
      {!supabaseConfigured && (
        <p className="border-b border-border bg-subtle px-6 py-2 text-xs text-ink-2">
          Supabase isn't set up, so login is off. Add the keys to frontend/.env (see the README) to use login.
        </p>
      )}
      {/* Sticky frosted bar: brand, page tabs (NavLink adds "active" to the current one), then the account */}
      <header className="nav-wrap">
        <nav className="nav">
          <NavLink to="/" className="brand">
            <Logo />
            {APP_NAME}
          </NavLink>
          <div className="tabs">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end className="tab">
                {link.label}
                {link.to === "/study-buddy" && <StudyBuddyBadge count={unread} />}
              </NavLink>
            ))}
          </div>
          {session && (
            <div className="nav-right">
              {/* Desktop keeps the bell out in the bar. Everything else, and on phones the bell too, is in the account menu. */}
              <span className="nav-desktop">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Notifications"
                  title="Notifications"
                  onClick={() => setNotificationsOpen(true)}
                >
                  <IconBell size={18} />
                </button>
              </span>
              <AccountMenu email={session.user.email} />
            </div>
          )}
        </nav>
      </header>
      {notificationsOpen && <NotificationSettings onClose={() => setNotificationsOpen(false)} />}
      {/* Phones: the pages as tabs along the bottom, where thumbs reach (hidden on desktop in index.css) */}
      <nav className="bottom-tabs" aria-label="Pages">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end className="btab">
            <Icon size={22} />
            {label}
            {to === "/study-buddy" && <StudyBuddyBadge count={unread} />}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route path="/" element={<Calendar />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/study-buddy" element={<StudyBuddy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
      </Routes>
    </BrowserRouter>
  );
}

// Before the app opens (logged out, or not agreed to the Terms yet): no app nav, just `home` and the Terms and
// Privacy pages, which have to be readable before signing up or agreeing. Any other address shows `home`, and
// keeps that address, so it opens once they're in.
function OutsideApp({ home, homeLabel }: { home: ReactNode; homeLabel: string }) {
  return (
    <BrowserRouter>
      {/* A full-height column, so the footer (margin-top: auto) sits at the bottom of short pages */}
      <div className="flex min-h-svh flex-col">
        <Routes>
          <Route path="/terms" element={<LegalShell homeLabel={homeLabel}><Terms /></LegalShell>} />
          <Route path="/privacy" element={<LegalShell homeLabel={homeLabel}><Privacy /></LegalShell>} />
          <Route path="*" element={home} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

// Terms or Privacy before the app opens: a slim bar with a way back instead of the app's nav
function LegalShell({ homeLabel, children }: { homeLabel: string; children: ReactNode }) {
  return (
    <>
      <header className="nav-wrap">
        <nav className="nav">
          <Link to="/" className="brand">
            <Logo />
            {APP_NAME}
          </Link>
          <div className="nav-right">
            <Link to="/" className="btn btn-sm">
              {homeLabel}
            </Link>
          </div>
        </nav>
      </header>
      {children}
      <Footer />
    </>
  );
}

export default App;
