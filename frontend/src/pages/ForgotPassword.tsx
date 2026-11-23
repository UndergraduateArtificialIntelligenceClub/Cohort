import { useId, useState, type FormEvent } from "react";
import AuthCard, { AuthMessage, type Message } from "../components/AuthCard";
import { supabase } from "../lib/supabase";

type Props = {
  email: string;
  onBack: () => void;
};

function ForgotPassword({ email: typedEmail, onBack }: Props) {
  const id = useId();
  const [email, setEmail] = useState(typedEmail);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setMessage({ text: "Enter your email.", kind: "error" });
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: window.location.origin,
      });
      if (error) {
        setMessage({ text: error.message, kind: "error" });
      } else {
        setSent(true);
        setMessage({
          text: "If an account exists for that email, we've sent a reset link. Check your inbox (and junk folder).",
          kind: "info",
        });
      }
    } catch {
      setMessage({ text: "Something went wrong. Check your connection and try again.", kind: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your @ualberta.ca email and we'll send you a link to set a new password."
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
        <div className="field">
          <label htmlFor={`${id}-email`} className="field-label">
            Email
          </label>
          <input
            id={`${id}-email`}
            type="email"
            autoComplete="email"
            placeholder="you@ualberta.ca"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </div>

        {message && <AuthMessage message={message} />}

        <button type="submit" disabled={busy} className="btn btn-primary btn-block">
          {busy && <span className="spinner" />}
          {sent ? "Resend link" : "Send reset link"}
        </button>
      </form>

      <button type="button" onClick={onBack} className="link-button self-start text-xs text-(--ink-2)">
        Back to sign in
      </button>
    </AuthCard>
  );
}

export default ForgotPassword;
