import { useEffect, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router";
import type { Session } from "@supabase/supabase-js";
import { APP_NAME } from "./lib/config";
import { supabase, supabaseConfigured } from "./lib/supabase";
import { logOut } from "./lib/logout";
import { useUnreadCount } from "./lib/useUnreadCount";
import AccountMenu from "./components/AccountMenu";
import StudyBuddyBadge from "./components/StudyBuddyBadge";
import { IconBell, IconCalendar, IconLogout, IconUpload, IconUsers, Logo } from "./components/Icons";
import { InstallButton } from "./components/InstallPrompt";
import NotificationListener from "./components/NotificationListener";
import NotificationSettings from "./components/NotificationSettings";
import Calendar from "./pages/Calendar";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import StudyBuddy from "./pages/StudyBuddy";
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

  // No Supabase keys in frontend/.env: in development, skip login so teammates can still work on other pages.
  // On the live site, show an error instead of letting anyone in.
  if (!supabaseConfigured && !import.meta.env.DEV) {
    return <p className="error-text p-8 text-center">Supabase isn't set up for this site. Ask the project lead.</p>;
  }
  if (checking) return <p className="muted p-8 text-center">Loading…</p>;

  // Logged out: show only the login page, no nav. Logged in: show the app.
  if (supabaseConfigured && !session) return <Login />;
  if (recovering && session) {
    return <ResetPassword email={session.user.email} onDone={() => setRecovering(false)} />;
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
              {/* Desktop: email, notifications, install and log out inline. Phones: all of them live in the account menu. */}
              <span className="nav-email" title={session.user.email}>
                {session.user.email}
              </span>
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
                <InstallButton />
                <button type="button" onClick={logOut} className="btn btn-quiet btn-sm">
                  <IconLogout />
                  Log out
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
      </Routes>
    </BrowserRouter>
  );
}

export default App;
