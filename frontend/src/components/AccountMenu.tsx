import { useState } from "react";
import { isInstalled, useInstallDialog } from "../lib/install";
import { supabase } from "../lib/supabase";
import { IconLogout, IconPhone, IconShare, IconUserCircle } from "./Icons";
import Sheet from "./Sheet";

// Phones only (hidden on desktop by .nav-account in index.css): the account button in the top bar.
// Holds what the desktop nav shows inline: your email, installing Cohort, and logging out.
function AccountMenu({ email }: { email: string | undefined }) {
  const [open, setOpen] = useState<"menu" | "steps" | null>(null);
  const installDialog = useInstallDialog();
  const close = () => setOpen(null);

  return (
    <>
      <button type="button" className="icon-btn nav-account" aria-label="Account" onClick={() => setOpen("menu")}>
        <IconUserCircle size={22} />
      </button>

      {open === "menu" && (
        <Sheet title="Account" showTitle={false} onClose={close}>
          {email && <p className="muted mb-2 truncate text-xs">Signed in as {email}</p>}
          <ul className="sheet-list">
            {!isInstalled() && (
              <li>
                <button
                  type="button"
                  className="sheet-item"
                  onClick={() => {
                    // Android Chrome has an install dialog; everywhere else, show how to do it by hand
                    if (installDialog) {
                      close();
                      installDialog();
                    } else {
                      setOpen("steps");
                    }
                  }}
                >
                  <IconPhone size={20} className="text-accent" />
                  Add Cohort to your Home Screen
                </button>
              </li>
            )}
            <li>
              <button
                type="button"
                className="sheet-item"
                // "local" logs out this browser even if the network request fails
                onClick={() => supabase.auth.signOut({ scope: "local" })}
              >
                <IconLogout size={20} />
                Log out
              </button>
            </li>
          </ul>
        </Sheet>
      )}

      {open === "steps" && (
        <Sheet title="Add Cohort to your Home Screen" onClose={close}>
          <p className="muted">It opens like an app, without the browser bars. Takes about 10 seconds.</p>
          <ol className="steps">
            {/* Each step's text sits in one span, so the bold words and icon flow inside the sentence */}
            <li>
              <span>
                Open your browser's menu: <strong>•••</strong>, <strong>⋮</strong> or the Share button{" "}
                <IconShare size={16} className="inline align-[-3px]" />
              </span>
            </li>
            <li>
              <span>
                If you don't see it straight away, tap <strong>Share</strong> and scroll down
              </span>
            </li>
            <li>
              <span>
                Tap <strong>Add to Home Screen</strong>
              </span>
            </li>
          </ol>
          <button type="button" className="btn btn-primary btn-block btn-lg" onClick={close}>
            Got it
          </button>
        </Sheet>
      )}
    </>
  );
}

export default AccountMenu;
