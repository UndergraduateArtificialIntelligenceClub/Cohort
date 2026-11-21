import { isInstalled, useInstallDialog } from "../lib/install";
import { IconDownload } from "./Icons";

// Goes in the desktop nav bar. Only shows once the browser says Cohort can be installed.
export function InstallButton() {
  const install = useInstallDialog();
  if (!install || isInstalled()) return null;
  return (
    <button type="button" onClick={install} className="btn btn-quiet btn-sm">
      <IconDownload />
      Install Cohort
    </button>
  );
}
