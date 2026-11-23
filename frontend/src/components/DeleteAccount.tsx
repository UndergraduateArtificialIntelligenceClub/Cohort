import { useState, type FormEvent } from "react";
import { API } from "../lib/config";
import { logOut } from "../lib/logout";
import { authHeaders } from "../lib/supabase";
import Sheet from "./Sheet";

// The word you type to unlock the delete button.
const CONFIRM_WORD = "delete";

// Confirm popup for deleting your account. The backend deletes the login (DELETE /account),
// and the database cascades away everything tied to it. Then we log this browser out.
// You have to type "delete" first, so someone who opens this out of curiosity can't delete
// their account by clicking the red button without reading. Any capitals count, because
// phones often capitalize the first letter.
function DeleteAccount({ onClose }: { onClose: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");
  const confirmed = typed.trim().toLowerCase() === CONFIRM_WORD;

  async function handleDelete(e: FormEvent) {
    e.preventDefault();
    if (!confirmed || deleting) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`${API}/account`, { method: "DELETE", headers: await authHeaders() });
      if (!res.ok) {
        let message = `Server error (${res.status})`;
        try {
          const body = await res.json();
          if (body.detail) message = body.detail;
        } catch {
          // the body wasn't JSON, so keep the generic message
        }
        throw new Error(message);
      }
      await logOut();
    } catch (e) {
      // fetch throws a TypeError ("Failed to fetch") when the server can't be reached at all
      if (e instanceof TypeError) setError("Couldn't reach the server. Check your connection and try again.");
      else setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setDeleting(false);
    }
  }

  return (
    <Sheet title="Delete your account?" onClose={deleting ? () => {} : onClose}>
      <p className="mb-3">
        This deletes your account, your deadlines, the syllabi you've shared, and your study-buddy chats.
        This can't be undone.
      </p>
      <form onSubmit={handleDelete}>
        <label className="field mb-3">
          <span className="field-label">Type "{CONFIRM_WORD}" to confirm</span>
          <input
            className="input"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={CONFIRM_WORD}
            disabled={deleting}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        {error && <p className="error-text mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-quiet" onClick={onClose} disabled={deleting}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" disabled={!confirmed || deleting}>
            {deleting ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export default DeleteAccount;
