import { useEffect, useRef, useState, type ReactNode } from "react";
import { isInstalled, useInstallDialog } from "../lib/install";
import { logOut } from "../lib/logout";
import { useIsPhone } from "../lib/useIsPhone";
import DeleteAccount from "./DeleteAccount";
import { IconBell, IconDownload, IconLogout, IconPhone, IconTrash, IconUserCircle } from "./Icons";
import InstallSteps from "./InstallSteps";
import NotificationSettings from "./NotificationSettings";
import Sheet from "./Sheet";

// The account button at the right of the top bar: your email on desktop, a person icon on phones.
// It opens the account menu: notifications, installing Cohort, logging out and deleting your account.
// The Terms and Privacy links are in the footer at the bottom of every page (#61).
// Desktop shows the menu as a dropdown under the button; phones show it as a bottom sheet.
function AccountMenu({ email }: { email: string | undefined }) {
  const [open, setOpen] = useState<"menu" | "steps" | "notifications" | "delete" | null>(null);
  const isPhone = useIsPhone();
  const installDialog = useInstallDialog();
  const close = () => setOpen(null);

  // Phones get the install steps when the browser has no install dialog (always on iPhone).
  // Desktop only offers it when the browser can install Cohort itself.
  const canInstall = !isInstalled() && (isPhone || installDialog !== null);

  const items = (
    <ul className="sheet-list">
      <li>
        <button type="button" className="sheet-item" onClick={() => setOpen("notifications")}>
          <IconBell size={20} />
          Notifications
        </button>
      </li>
      {canInstall && (
        <li>
          <button
            type="button"
            className="sheet-item"
            onClick={() => {
              if (installDialog) {
                close();
                installDialog();
              } else {
                setOpen("steps");
              }
            }}
          >
            {isPhone ? <IconPhone size={20} className="text-accent" /> : <IconDownload size={20} />}
            {isPhone ? "Add Cohort to your Home Screen" : "Install Cohort"}
          </button>
        </li>
      )}
      <li>
        <button type="button" className="sheet-item" onClick={logOut}>
          <IconLogout size={20} />
          Log out
        </button>
      </li>
      {/* Last, and in red, so it's easy to find but hard to hit by accident. It still asks first. */}
      <li>
        <button type="button" className="sheet-item sheet-item-danger" onClick={() => setOpen("delete")}>
          <IconTrash size={20} />
          Delete account
        </button>
      </li>
    </ul>
  );

  return (
    <div className="account">
      <button
        type="button"
        className="nav-account"
        aria-label="Account"
        aria-haspopup="true"
        aria-expanded={open === "menu"}
        title={email}
        onClick={() => setOpen(open === "menu" ? null : "menu")}
      >
        <IconUserCircle size={isPhone ? 22 : 18} />
        <span className="nav-email">{email}</span>
      </button>

      {open === "menu" &&
        (isPhone ? (
          <Sheet title="Account" showTitle={false} onClose={close}>
            {email && <p className="muted mb-2 truncate text-xs">Signed in as {email}</p>}
            {items}
          </Sheet>
        ) : (
          <Dropdown onClose={close}>{items}</Dropdown>
        ))}

      {open === "notifications" && <NotificationSettings onClose={close} />}
      {open === "delete" && <DeleteAccount onClose={close} />}
      {open === "steps" && <InstallSteps onClose={close} />}
    </div>
  );
}

// Desktop: the menu hangs under the account button. Escape or a click anywhere else closes it.
function Dropdown({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // Clicks on the account button itself are left to its own toggle
    function onPointerDown(e: PointerEvent) {
      const account = ref.current?.parentElement;
      if (account && !account.contains(e.target as Node)) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="account-menu">
      {children}
    </div>
  );
}

export default AccountMenu;
