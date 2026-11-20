// Upload page UI: issue #28
import { useState } from "react";
import { useNavigate } from "react-router";
import ReviewPopup from "../components/ReviewPopup";
import SharedLibrary from "../components/SharedLibrary";
import { IconUpload } from "../components/Icons";
import { API } from "../lib/config";
import { saveDeadlines } from "../lib/deadlines";
import { markUsed, shareDeadlines, type SharedSyllabus } from "../lib/library";
import type { Deadline, ParseResponse } from "../types";
import { authHeaders } from "../lib/supabase";

function Upload() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File|null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Deadline[] | null>(null);
  const [saving, setSaving] = useState(false);
  // Confirmed deadlines that failed to save, kept so the user can retry instead of losing them
  const [unsaved, setUnsaved] = useState<Deadline[] | null>(null);
  // Where the deadlines under review came from: a classmate's shared syllabus (its id), or null for your own upload
  const [fromShared, setFromShared] = useState<string | null>(null);
  const [instructor, setInstructor] = useState<string | null>(null);
  // Share your own uploads to the course library (#66)
  const [share, setShare] = useState(true);
  const navigate = useNavigate();

  // Save what the user confirmed in the review popup, then show it on the calendar
  async function save(confirmed: Deadline[]) {
    if (confirmed.length === 0) return;
    setSaving(true);
    setError("");
    try {
      await saveDeadlines(confirmed);
      setUnsaved(null);
      // The library is a bonus: if it fails, the user's own deadlines are already saved, so carry on
      try {
        if (fromShared) await markUsed(fromShared);
        else if (share) await shareDeadlines(confirmed, instructor);
      } catch (e) {
        console.error(e);
      }
      navigate("/");
    } catch (e) {
      setUnsaved(confirmed);
      setError(e instanceof Error ? e.message : "Couldn't save deadlines.");
    } finally {
      setSaving(false);
    }
  }

  function pickFile(f: File | undefined){
    if (!f) return;
    if (f.type !== "application/pdf"){
      setError("That file isn't a PDF.");
      return;
    }
    setError("");
    setFile(f);
  }

  // Turns a failed backend response into a readable message.
  // FastAPI sends errors as { "detail": "..." }
  async function readError(res: Response) {
    try {
      const body = await res.json();
      if (typeof body.detail === "string") return body.detail;
    } catch {
      // the body wasn't JSON, so fall through to the generic message
    }
    return `Server error (${res.status})`;
  }

  async function handleSubmit() {
    setLoading(true);
    setError("");
    try {
      let data: ParseResponse;
      const auth = await authHeaders(); // the backend only parses for logged in users

      if (file) {
        const form = new FormData();
        form.append("file", file);    // matches the /parse-pdf endpoint (#25)
        const res = await fetch(`${API}/parse-pdf`, { method: "POST", headers: auth, body: form });
        if (!res.ok) throw new Error(await readError(res));
        data = await res.json();
      } else {
        const res = await fetch(`${API}/parse`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...auth },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error(await readError(res));
        data = await res.json();
      }

      setFromShared(null);
      setInstructor(data.instructor);
      setPending(data.deadlines);
    } catch (e) {
      if (e instanceof TypeError) {
        setError("Couldn't reach the server. Is the backend running?");
      } else if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Upload</h1>
          <p className="page-sub">
            Add a syllabus as a PDF or pasted text. You'll check each deadline before it's saved.
          </p>
        </div>
      </div>

      <SharedLibrary
        disabled={loading || saving}
        onUse={(s: SharedSyllabus) => {
          setError("");
          setFromShared(s.id);
          setInstructor(s.instructor);
          setPending(s.deadlines);
        }}
      />

      <div className="add-grid">
        <label
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {e.preventDefault(); pickFile(e.dataTransfer.files[0]);}}
          className="dropzone"
        >
          <span className="icon-tile">
            <IconUpload />
          </span>
          <span className="font-semibold">{file ? file.name : "Drop a PDF here"}</span>
          <span className="muted">
            {file ? "Click to choose a different file" : <>or <span className="link">click to browse</span></>}
          </span>
          <input
            type = "file"
            accept = "application/pdf"
            className = "sr-only"
            onChange = {(e) => pickFile(e.target.files?.[0])}
            />
        </label>

        <div className="panel flex flex-col p-4">
          <label htmlFor="syllabus-text" className="field-label mb-1">
            Or paste the text
          </label>
          <textarea
            id="syllabus-text"
            value = {text}
            onChange={(e) => setText(e.target.value)}
            placeholder = "Paste your syllabus text here..."
            className = "input min-h-44 flex-1"
          />
        </div>
      </div>

      <label className="mt-5 flex cursor-pointer items-start gap-3 border-t border-border py-3">
        <input
          type="checkbox"
          className="checkbox mt-0.5"
          checked={share}
          onChange={(e) => setShare(e.target.checked)}
        />
        <span>
          <span className="block font-medium">Share with classmates</span>
          <span className="muted block text-xs">
            Add the deadlines you confirm to the course library. Your name and email are never shown.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={loading || saving || (!text.trim() && !file)}
          className="btn btn-primary"
        >
          {loading && <span className="spinner" />}
          {loading ? "Parsing..." : "Parse syllabus"}
        </button>

        {saving && (
          <span className="muted inline-flex items-center gap-2">
            <span className="spinner" /> Saving deadlines...
          </span>
        )}

        {unsaved && !saving && (
          <button onClick={() => save(unsaved)} className="btn">
            Try saving again
          </button>
        )}
      </div>

      {error && <p className="notice notice-error mt-4">{error}</p>}

      {pending && (
        <ReviewPopup
          pending={pending}
          onDone={(confirmed) => {
            setPending(null);
            save(confirmed);
          }}
        />
      )}
    </main>
  );
}

export default Upload;
