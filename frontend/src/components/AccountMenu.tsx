import { useState } from "react";
import { isInstalled, useInstallDialog } from "../lib/install";
import { logOut } from "../lib/logout";
import { IconBell, IconLogout, IconPhone, IconUserCircle } from "./Icons";
import InstallSteps from "./InstallSteps";
import NotificationSettings from "./NotificationSettings";
import Sheet from "./Sheet";
import DeleteAccount from "./DeleteAccount";

// Phones only (hidden on desktop by .nav-account in index.css): the account button in the top bar.
// Holds what the desktop nav shows inline: your email, notifications, installing Cohort, and logging out.
function AccountMenu({ email }: { email: string | undefined }) {
  const [open, setOpen] = useState<"menu" | "steps" | "notifications" | "delete" | null>(null);
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
            <li>
              <button type="button" className="sheet-item" onClick={() => setOpen("notifications")}>
                <IconBell size={20} />
                Notifications
              </button>
            </li>
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
              <button type="button" className="sheet-item" onClick={logOut}>
                <IconLogout size={20} />
                Log out
              </button>
            </li>
            <li>
              <button type="button" className="sheet-item" onClick={() => setOpen("delete")}>
                Delete account
              </button>
            </li>
          </ul>
        </Sheet>
      )}

      {open === "notifications" && <NotificationSettings onClose={close} />}
      {open === "delete" && <DeleteAccount onClose={close} />}
      {open === "steps" && <InstallSteps onClose={close} />}
    </>
  );
}

export default AccountMenu;
