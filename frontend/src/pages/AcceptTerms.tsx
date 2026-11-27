import { useId, useRef, useState, type FormEvent } from "react";
import AuthCard, { AuthMessage, type Message } from "../components/AuthCard";
import { APP_NAME } from "../lib/config";
import { acceptTerms, type TermsStatus } from "../lib/legal";
import { logOut } from "../lib/logout";

// Shown by App.tsx after login, instead of the app, until the account has agreed to the current Terms of Service
// and Privacy Policy (issue #61). One check for everyone: new Google and email accounts, accounts from before #61,
// and everyone again when TERMS_VERSION changes. People who already agreed never see it.
type Props = {
  email: string | undefined;
  status: Exclude<TermsStatus, "current">;
  onAccepted: () => void;
};

function AcceptTerms({ email, status, onAccepted }: Props) {
  const id = useId();
  // Starts unticked on purpose: agreeing has to be the user's own click
  const [agreed, setAgreed] = useState(false);
  const [agreeError, setAgreeError] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const agreeRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!agreed) {
      setAgreeError(true);
      agreeRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await acceptTerms();
      onAccepted();
    } catch {
      setMessage({ text: "Couldn't save that. Check your connection and try again.", kind: "error" });
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={status === "updated" ? "We've updated our terms" : "Before you start"}
      description={
        status === "updated"
          ? `Please read the new Terms of Service and Privacy Policy and agree to them to keep using ${APP_NAME}.`
          : `Please read our Terms of Service and Privacy Policy and agree to them to start using ${APP_NAME}.`
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-start gap-2 text-ink-2">
            <input
              ref={agreeRef}
              id={`${id}-agree`}
              type="checkbox"
              checked={agreed}
              onChange={(e) => {
                setAgreed(e.target.checked);
                if (e.target.checked) setAgreeError(false);
              }}
              aria-invalid={agreeError}
              aria-describedby={agreeError ? `${id}-agree-error` : undefined}
              className="checkbox mt-0.5"
            />
            {/* Clicking a link inside the label opens it without ticking the box (browsers skip links in labels).
                The pages open in a new tab so this screen keeps its place; App.tsx lets them load before agreeing. */}
            <label htmlFor={`${id}-agree`}>
              I agree to the{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="link">
                Terms of Service
                <span className="sr-only"> (opens in a new tab)</span>
              </a>{" "}
              and{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="link">
                Privacy Policy
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </label>
          </div>
          {agreeError && (
            <p id={`${id}-agree-error`} className="error-text text-xs">
              Please tick the box to agree first.
            </p>
          )}
        </div>

        {message && <AuthMessage message={message} />}

        <button type="submit" disabled={busy} className="btn btn-primary btn-block">
          {busy && <span className="spinner" />}
          Continue
        </button>

        {/* A way out for someone who doesn't agree, or who signed in with the wrong account */}
        <p className="muted text-center text-xs">
          {email ? `Signed in as ${email}. ` : ""}
          <button type="button" onClick={logOut} className="link">
            Log out
          </button>
        </p>
      </form>
    </AuthCard>
  );
}

export default AcceptTerms;
