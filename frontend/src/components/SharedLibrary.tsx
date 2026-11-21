import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import {
  dismissReport,
  loadReports,
  reportMistake,
  searchLibrary,
  stopSharing,
  type MistakeReport,
  type SharedSyllabus,
} from "../lib/library";
import { useIsPhone } from "../lib/useIsPhone";
import { IconChevronRight, IconPlus, IconSearch, IconTrash, IconUsers } from "./Icons";

// Course library search on the upload page: issue #66
// Find a syllabus a classmate already parsed and review its deadlines instead of uploading your own.
type Props = {
  disabled: boolean;
  onUse: (syllabus: SharedSyllabus) => void;
};

// "today", "yesterday", "5 days ago"
function ago(timestamp: string) {
  const days = Math.floor((Date.now() - new Date(timestamp).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

function SharedLibrary({ disabled, onUse }: Props) {
  const [userId, setUserId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // null until the first search comes back
  const [results, setResults] = useState<SharedSyllabus[] | null>(null);
  const [reports, setReports] = useState<MistakeReport[]>([]);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  // The entry whose report form is open, and what's typed in it
  const [reporting, setReporting] = useState<string | null>(null);
  const [reportText, setReportText] = useState("");
  const [busy, setBusy] = useState(false);
  // Phones: folded into one row until tapped, so the upload button is the first thing you see
  const isPhone = useIsPhone();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
  }, []);

  // Search as you type, after a short pause
  useEffect(() => {
    if (!supabaseConfigured) return;
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const found = await searchLibrary(query);
        const foundReports = await loadReports(found.map((s) => s.id));
        if (stale) return;
        setResults(found);
        setReports(foundReports);
        setError("");
      } catch (e) {
        if (stale) return;
        setResults([]);
        setError(e instanceof Error ? e.message : "Couldn't search the course library.");
      }
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query, reload]);

  // Runs a library action, then refreshes the list
  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setReload((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function sendReport(syllabusId: string) {
    await act(async () => {
      await reportMistake(syllabusId, reportText);
      setReporting(null);
      setReportText("");
    });
  }

  // No login (Supabase not set up locally) or nothing shared yet: don't show an empty box
  if (!supabaseConfigured || results === null) return null;
  if (results.length === 0 && !query && !error) return null;

  // Never fold away classmates' reports on something you shared
  const reportsOnMine = results.some((s) => s.uploaded_by === userId && reports.some((r) => r.syllabus_id === s.id));
  const expanded = !isPhone || open || reportsOnMine;

  return (
    <section aria-labelledby="library-heading" className="panel shared">
      {isPhone ? (
        <button
          type="button"
          className="shared-toggle"
          aria-expanded={expanded}
          onClick={() => setOpen(!open)}
          disabled={reportsOnMine}
        >
          <IconUsers size={20} className="text-accent" />
          <span className="flex-1">
            <span id="library-heading" className="section-title block">
              Shared by classmates
            </span>
            <span className="muted block">Someone in your course may have added it already</span>
          </span>
          <IconChevronRight size={20} className={`text-ink-2 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
      ) : (
        <div className="section-head">
          <div>
            <h2 id="library-heading" className="section-title">
              Shared by classmates
            </h2>
            <p className="muted">
              If a classmate already added your course, use their deadlines and review them before saving.
            </p>
          </div>
        </div>
      )}

      {expanded && (
        <>
        <div className="input-wrap">
          <IconSearch />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Course or instructor, e.g. CMPUT 174"
            aria-label="Search the course library"
            className="input has-icon"
          />
        </div>

        {error && <p className="notice notice-error">{error}</p>}

        {results.length === 0 && query.trim() && !error && (
          <p className="muted">
            No one has shared “{query.trim()}” yet. Upload it below to be the first.
          </p>
        )}

        <ul className="rows">
          {results.map((s) => {
            const mine = s.uploaded_by === userId;
            const myReport = reports.find((r) => r.syllabus_id === s.id && r.reported_by === userId);
            // Reports from classmates on your own entry
            const onMine = mine ? reports.filter((r) => r.syllabus_id === s.id) : [];
            return (
              <li key={s.id} className="row shared-row flex-col items-stretch">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="row-text">
                    <p className="row-title">
                      {s.course}
                      {s.instructor && <span className="font-normal text-ink-2"> · {s.instructor}</span>}
                    </p>
                    <p className="row-meta">
                      {s.deadlines.length} upcoming {s.deadlines.length === 1 ? "deadline" : "deadlines"} · used by{" "}
                      {s.use_count}{" "}
                      {s.use_count === 1 ? "classmate" : "classmates"} · updated {ago(s.updated_at)}
                      {mine && " · shared by you"}
                    </p>
                  </div>
                  {mine ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => act(() => stopSharing(s.id))}
                      className="icon-btn"
                      aria-label={`Stop sharing ${s.course}`}
                      title="Stop sharing"
                    >
                      <IconTrash />
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setReporting(reporting === s.id ? null : s.id);
                        setReportText(myReport?.message ?? "");
                      }}
                      className="btn btn-quiet btn-sm"
                    >
                      {myReport ? "Edit report" : "Report a mistake"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={disabled || busy}
                    onClick={() => onUse(s)}
                    className="btn btn-sm"
                  >
                    <IconPlus size={14} /> Use
                  </button>
                </div>

                {reporting === s.id && (
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendReport(s.id);
                    }}
                  >
                    <label className="field">
                      <span className="field-label">
                        What's wrong? The person who shared it will see this, but not your name.
                      </span>
                      <textarea
                        value={reportText}
                        onChange={(e) => setReportText(e.target.value)}
                        maxLength={1000}
                        placeholder="e.g. Midterm is Oct 22, not Oct 15"
                        className="input h-20"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={busy || !reportText.trim()}
                        className="btn btn-primary btn-sm"
                      >
                        Send report
                      </button>
                      {myReport && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => act(async () => {
                            await dismissReport(myReport.id);
                            setReporting(null);
                          })}
                          className="btn btn-quiet btn-sm btn-danger-text"
                        >
                          Withdraw report
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setReporting(null)}
                        className="btn btn-quiet btn-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {onMine.length > 0 && (
                  <div className="notice flex-col">
                    <p className="font-medium">
                      Classmates reported {onMine.length === 1 ? "a mistake" : `${onMine.length} mistakes`}. Fix it by
                      uploading the syllabus again, then dismiss.
                    </p>
                    <ul className="mt-2 flex flex-col gap-2">
                      {onMine.map((r) => (
                        <li key={r.id} className="flex items-start gap-2">
                          <span className="flex-1">“{r.message}” <span className="text-ink-3">({ago(r.created_at)})</span></span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => act(() => dismissReport(r.id))}
                            className="btn btn-quiet btn-sm"
                          >
                            Dismiss
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        </>
      )}
    </section>
  );
}

export default SharedLibrary;
