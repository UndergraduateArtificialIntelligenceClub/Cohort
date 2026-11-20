import { useEffect, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router";
import type { Session } from "@supabase/supabase-js";
import { APP_NAME } from "./lib/config";
import { supabase, supabaseConfigured } from "./lib/supabase";
import StudyBuddyBadge from "./components/StudyBuddyBadge";
import { IconLogout, Logo } from "./components/Icons";
import { InstallButton, IosInstallTip } from "./components/InstallPrompt";
import Calendar from "./pages/Calendar";
import Login from "./pages/Login";
import StudyBuddy from "./pages/StudyBuddy";
import Upload from "./pages/Upload";

// Each page lives in its own file in src/pages so pairs don't edit the same file.
// Popups (like the review step after upload) live in src/components.
// Add new pages here and in the nav below.
const links = [
  { to: "/", label: "Calendar" },
  { to: "/upload", label: "Upload" },
  { to: "/study-buddy", label: "Study buddy" },
];

function App() {
  const [session, setSession] = useState<Session | null>(null);
  // True until Supabase tells us whether someone is already logged in (skipped when there are no keys)
  const [checking, setChecking] = useState(supabaseConfigured);

  // On page load: are we already logged in? Then keep listening for login/logout
  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
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

  return (
    <BrowserRouter>
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
                {/* Unread study buddy chats (#67) */}
                {link.to === "/study-buddy" && <StudyBuddyBadge />}
              </NavLink>
            ))}
          </div>
          {session && (
            <div className="nav-right">
              <span className="nav-email" title={session.user.email}>
                {session.user.email}
              </span>
              <InstallButton />
              {/* "local" logs out this browser even if the network request fails */}
              <button
                type="button"
                onClick={() => supabase.auth.signOut({ scope: "local" })}
                className="btn btn-quiet btn-sm"
              >
                <IconLogout />
                Log out
              </button>
            </div>
          )}
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Calendar />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/study-buddy" element={<StudyBuddy />} />
      </Routes>
      <IosInstallTip />
    </BrowserRouter>
  );
}

export default App;
