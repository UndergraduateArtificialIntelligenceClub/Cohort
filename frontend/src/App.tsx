import { useEffect, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router";
import type { Session } from "@supabase/supabase-js";
import { APP_NAME } from "./lib/config";
import { supabase, supabaseConfigured } from "./lib/supabase";
import Calendar from "./pages/Calendar";
import Login from "./pages/Login";
import Upload from "./pages/Upload";

// Each page lives in its own file in src/pages so pairs don't edit the same file.
// Popups (like the review step after upload) live in src/components.
// Add new pages here and in the nav below.
const links = [
  { to: "/", label: "Calendar" },
  { to: "/upload", label: "Upload" },
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
    return <p className="p-8 text-center text-red-600">Supabase isn't set up for this site. Ask the project lead.</p>;
  }
  if (checking) return <p className="p-8 text-center text-gray-600">Loading…</p>;

  // Logged out: show only the login page, no nav. Logged in: show the app.
  if (supabaseConfigured && !session) return <Login />;

  return (
    <BrowserRouter>
      {!supabaseConfigured && (
        <p className="bg-yellow-100 px-6 py-2 text-sm text-yellow-800">
          Supabase isn't set up, so login is off. Add the keys to frontend/.env (see the README) to use login.
        </p>
      )}
      <nav className="flex items-center gap-4 border-b px-6 py-3">
        <span className="text-xl font-bold text-blue-600">{APP_NAME}</span>
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end
            className={({ isActive }) => (isActive ? "font-semibold text-blue-600" : "text-gray-600")}
          >
            {link.label}
          </NavLink>
        ))}
        {session && (
          <div className="ml-auto flex items-center gap-4 text-sm">
            <span className="text-gray-600">{session.user.email}</span>
            {/* "local" logs out this browser even if the network request fails */}
            <button
              type="button"
              onClick={() => supabase.auth.signOut({ scope: "local" })}
              className="text-gray-600 hover:text-blue-600"
            >
              Log out
            </button>
          </div>
        )}
      </nav>
      <Routes>
        <Route path="/" element={<Calendar />} />
        <Route path="/upload" element={<Upload />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
