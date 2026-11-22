import { useState } from "react";
import { API } from "../lib/config";
import { logOut } from "../lib/logout";
import { authHeaders } from "../lib/supabase";
import Sheet from "./Sheet";

// Confirm popup for deleting your account. The backend deletes the login (DELETE /account),
// and the database cascades away everything tied to it. Then we log this browser out.
function DeleteAccount({ onClose }: { onClose: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
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
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
      setDeleting(false);
    }
  }

  return (
    <Sheet title="Delete your account?" onClose={deleting ? () => {} : onClose}>
      <p className="mb-3">
        This deletes your account, your deadlines, the syllabi you've shared, and your study-buddy chats.
        This can't be undone.
      </p>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-quiet" onClick={onClose} disabled={deleting}>
          Cancel
        </button>
        <button type="button" className="btn" onClick={handleDelete} disabled={deleting}>
          {deleting ? "Deleting…" : "Delete account"}
        </button>
      </div>
    </Sheet>
  );
}

export default DeleteAccount;