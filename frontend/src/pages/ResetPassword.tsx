import { useId, useState, type FormEvent } from "react";
import AuthCard, { AuthMessage, type Message } from "../components/AuthCard";
import { IconEye, IconEyeOff } from "../components/Icons";
import { supabase } from "../lib/supabase";

const MIN_LENGTH = 6;

type Props = {
  email: string | undefined;
  onDone: () => void;
};

function ResetPassword({ email, onDone }: Props) {
  const id = useId();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (password.length < MIN_LENGTH) {
      setMessage({ text: `Use at least ${MIN_LENGTH} characters.`, kind: "error" });
      return;
    }
    if (password !== confirm) {
      setMessage({ text: "The passwords don't match.", kind: "error" });
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage({ text: error.message, kind: "error" });
      } else {
        setSaved(true);
        setMessage({ text: "Password updated. Use it next time you sign in.", kind: "info" });
      }
    } catch {
      setMessage({ text: "Something went wrong. Check your connection and try again.", kind: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (saved && message) {
    return (
      <AuthCard title="Set a new password" description={email ? `For ${email}.` : "For your account."}>
        <AuthMessage message={message} />
        <button type="button" onClick={onDone} className="btn btn-primary btn-block">
          Continue to Cohort
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Set a new password"
      description={email ? `Choose a new password for ${email}.` : "Choose a new password for your account."}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
        <div className="field">
          <label htmlFor={`${id}-password`} className="field-label">
            New password
          </label>
          <div className="relative">
            <input
              id={`${id}-password`}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder={`At least ${MIN_LENGTH} characters`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pr-9"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide passwords" : "Show passwords"}
              className="icon-btn absolute top-1/2 right-0.5 -translate-y-1/2"
            >
              {showPassword ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor={`${id}-confirm`} className="field-label">
            Confirm password
          </label>
          <input
            id={`${id}-confirm`}
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input"
          />
        </div>

        {message && <AuthMessage message={message} />}

        <button type="submit" disabled={busy} className="btn btn-primary btn-block">
          {busy && <span className="spinner" />}
          Save password
        </button>
      </form>
    </AuthCard>
  );
}

export default ResetPassword;
