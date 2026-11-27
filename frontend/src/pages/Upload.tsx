// Upload page UI: issue #28
import { useState } from "react";
import { useNavigate } from "react-router";
import CanvasImport from "../components/CanvasImport";
import ReviewPopup from "../components/ReviewPopup";
import SharedLibrary from "../components/SharedLibrary";
import { IconAlert, IconArrowRight, IconUpload } from "../components/Icons";
import { API } from "../lib/config";
import { saveDeadlines } from "../lib/deadlines";
import { markUsed, shareDeadlines, type SharedSyllabus } from "../lib/library";
import { logEvent, type EventCounts } from "../lib/metrics";
import type { Deadline, ParseResponse, UndatedItem } from "../types";
import { authHeaders } from "../lib/supabase";
import { useIsPhone } from "../lib/useIsPhone";

function Upload() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File|null>(null);
  // A file is being dragged over the drop area (only changes how it looks)
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // What the review popup is showing: undated items and the syllabus text only come from your own upload
  const [pending, setPending] = useState<{ deadlines: Deadline[]; undated: UndatedItem[]; text: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  // Confirmed deadlines that failed to save, kept so the user can retry instead of losing them
  const [unsaved, setUnsaved] = useState<{ parsed: Deadline[]; added: Deadline[]; fixes: EventCounts } | null>(null);
  // Where the deadlines under review came from: a classmate's shared syllabus (its id), or null for your own upload
  const [fromShared, setFromShared] = useState<string | null>(null);
  // A Canvas import only has upcoming items and no weights, so sharing it would replace a fuller syllabus in the library (#62)
  const [fromCanvas, setFromCanvas] = useState(false);
  const [instructor, setInstructor] = useState<string | null>(null);
  // Share your own uploads to the course library (#66)
  const [share, setShare] = useState(true);
  const navigate = useNavigate();
  // Phones: the paste box stays folded until asked for, and the main button is pinned above the tabs
  const isPhone = useIsPhone();
  const [pasteOpen, setPasteOpen] = useState(false);

  // Save what the user confirmed in the review popup, then show it on the calendar.
  // added is undated items the user gave a date. Those dates are the user's guess, not the syllabus's,
  // so they stay out of the course library for now.
  // fixes is what the student changed in the review popup, counted once the save works (lib/metrics.ts)
  async function save(parsed: Deadline[], added: Deadline[], fixes: EventCounts) {
    if (parsed.length + added.length === 0) return;
    setSaving(true);
    setError("");
    try {
      await saveDeadlines([...parsed, ...added]);
      setUnsaved(null);
      logEvent("review_saved", fromShared ? "library" : fromCanvas ? "canvas" : "syllabus", fixes);
      // The library is a bonus: if it fails, the user's own deadlines are already saved, so carry on
      try {
        if (fromShared) await markUsed(fromShared);
        else if (share && !fromCanvas && parsed.length > 0) await shareDeadlines(parsed, instructor);
      } catch (e) {
        console.error(e);
      }
      navigate("/");
    } catch (e) {
      setUnsaved({ parsed, added, fixes });
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
      logEvent("parsed", "syllabus", { found: data.deadlines.length, undated: data.undated?.length ?? 0 });

      setFromShared(null);
      setFromCanvas(false);
      setInstructor(data.instructor);
      // An older backend sends neither; fall back to what was pasted for the course name check
      setPending({ deadlines: data.deadlines, undated: data.undated ?? [], text: data.text ?? (file ? null : text) });
    } catch (e) {
      logEvent("parse_failed", "syllabus");
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

  // Saving status and the main button: in the paste box on desktop, pinned to the bottom on phones
  const actions = (
    <>
      {saving && (
        <span className="muted paste-status">
          <span className="spinner" /> Saving deadlines
        </span>
      )}
      {unsaved && !saving && (
        <button type="button" onClick={() => save(unsaved.parsed, unsaved.added, unsaved.fixes)} className="btn">
          Try saving again
        </button>
      )}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading || saving || (!text.trim() && !file)}
        className="btn btn-primary"
      >
        {loading ? (
          <>
            <span className="spinner" /> Finding deadlines
          </>
        ) : (
          <>
            Find deadlines <IconArrowRight />
          </>
        )}
      </button>
    </>
  );

  return (
    <main className="page add-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Upload</h1>
          <p className="page-sub">
            Upload a PDF or paste the text. Assignments, labs, quizzes and exams are pulled out, and you check them
            before they're saved to your calendar.
          </p>
        </div>
      </div>

      <SharedLibrary
        disabled={loading || saving}
        onUse={(s: SharedSyllabus) => {
          setError("");
          setFromShared(s.id);
          setFromCanvas(false);
          setInstructor(s.instructor);
          setPending({ deadlines: s.deadlines, undated: [], text: null });
        }}
      />

      <div className="add-grid">
        <label
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pickFile(e.dataTransfer.files[0]);
          }}
          className={`panel dropzone${dragging ? " is-drag" : ""}`}
        >
          <input
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          <span className="icon-tile">
            <IconUpload />
          </span>
          <span className="dz-title">{dragging ? "Drop to upload" : file ? file.name : "Upload a PDF"}</span>
          {/* Phones and tablets can't drag files in, so they get "Tap to..." instead (see .dz-touch in index.css) */}
          <span className="muted dz-pointer">
            {file ? "Drag another here or " : "Drag it here or "}
            <span className="dz-link">{file ? "choose a different file" : "choose a file"}</span>
          </span>
          <span className="muted dz-touch">
            Tap to <span className="dz-link">{file ? "choose a different PDF" : "choose a PDF"}</span>
          </span>
          <span className="dz-hint muted">The PDF needs selectable text. Scanned pages won't work.</span>
        </label>

        {!isPhone || pasteOpen || text ? (
          <div className="panel paste">
            <div className="section-head">
              <label className="section-title" htmlFor="syllabus-text">
                Paste text
              </label>
              <span className="muted tabular">{text.length.toLocaleString()} characters</span>
            </div>
            <textarea
              id="syllabus-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the schedule or assignment list from your syllabus"
              rows={9}
              className="input paste-area"
              // Phones: it was just unfolded on purpose, so bring up the keyboard
              autoFocus={isPhone && pasteOpen}
            />
            {!isPhone && <div className="paste-foot">{actions}</div>}
          </div>
        ) : (
          <button type="button" className="paste-open" onClick={() => setPasteOpen(true)}>
            Or paste the text instead
          </button>
        )}

        {loading && (
          <div className="busy-overlay" role="status" aria-live="polite">
            <span className="spinner" />
            <div>
              <p className="section-title">Reading your syllabus</p>
              <p className="muted">Finding assignments, labs, quizzes and exams. Long syllabi take longer.</p>
            </div>
          </div>
        )}
      </div>

      <CanvasImport
        disabled={loading || saving}
        onImported={(deadlines) => {
          setError("");
          setFromShared(null);
          setFromCanvas(true);
          setInstructor(null);
          setPending({ deadlines, undated: [], text: null });
        }}
      />

      {error && (
        <div className="notice notice-error" role="alert">
          <IconAlert />
          <span>{error}</span>
        </div>
      )}

      <fieldset className="options">
        <legend className="section-title">Options</legend>
        <label className="option">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
          <span>
            <span className="option-label">Share with classmates</span>
            <span className="muted">
              Add the deadlines you confirm to the course library. Your name and email are never shown.
            </span>
          </span>
        </label>
      </fieldset>

      {isPhone && <div className="phone-bar">{actions}</div>}

      {pending && (
        <ReviewPopup
          deadlines={pending.deadlines}
          undated={pending.undated}
          source={fromShared ? "library" : fromCanvas ? "canvas" : "syllabus"}
          syllabusText={pending.text}
          onDone={(parsed, added, fixes) => {
            setPending(null);
            save(parsed, added, fixes);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </main>
  );
}

export default Upload;
