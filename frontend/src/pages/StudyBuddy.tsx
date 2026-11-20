// Study buddy page: issue #67
// Pick one of your courses, get paired with a classmate who's also looking, then chat.
// The rules (who can match, what a match sees, block and report) live in
// supabase/migrations/20261119120000_study_buddy.sql. Calls to Supabase are in lib/studyBuddy.ts.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { normalizeCourse } from "../lib/courses";
import { loadDeadlines } from "../lib/deadlines";
import { todayISO } from "../lib/library";
import {
  MAX_MESSAGE,
  MAX_REPORT,
  REQUEST_DAYS,
  block,
  cancelRequest,
  findBuddy,
  loadMatches,
  loadMessages,
  loadRequests,
  markRead,
  partnerName,
  report,
  sendMessage,
  unmatch,
  type StudyMatch,
  type StudyMessage,
  type StudyRequest,
} from "../lib/studyBuddy";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { IconSend, IconUsers, IconX } from "../components/Icons";

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

// "Nov 19"
function shortDate(timestamp: string) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// "3:05 PM" today, "Nov 19, 3:05 PM" on other days
function messageTime(timestamp: string) {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString() ? time : `${shortDate(timestamp)}, ${time}`;
}

function StudyBuddy() {
  const [me, setMe] = useState<string | null>(null);
  // Courses with an upcoming deadline on my calendar. null while loading.
  const [myCourses, setMyCourses] = useState<string[] | null>(null);
  const [requests, setRequests] = useState<StudyRequest[]>([]);
  const [matches, setMatches] = useState<StudyMatch[]>([]);
  // The chat on screen. Kept even if the match ends, so we can say whose chat ended.
  const [openMatch, setOpenMatch] = useState<StudyMatch | null>(null);
  const [busyCourse, setBusyCourse] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  // Reload my requests and matches from Supabase
  const refresh = useCallback(
    () =>
      Promise.all([loadRequests(), loadMatches()])
        .then(([newRequests, newMatches]) => {
          setRequests(newRequests);
          setMatches(newMatches);
        })
        .catch((e) => setError(errorText(e, "Couldn't load study buddies."))),
    []
  );

  // Who I am, and which courses I can look for a buddy in
  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => setMe(data.session?.user.id ?? null));
    loadDeadlines()
      .then((deadlines) => {
        const today = todayISO();
        const upcoming = deadlines.filter((d) => d.date >= today).map((d) => normalizeCourse(d.course));
        setMyCourses([...new Set(upcoming)].filter(Boolean));
      })
      .catch((e) => {
        setMyCourses([]);
        setError(errorText(e, "Couldn't load your courses."));
      });
  }, []);

  // Load my requests and matches, then keep them live: someone matching with me, or ending a chat
  useEffect(() => {
    if (!supabaseConfigured || !me) return;
    refresh();
    const channel = supabase
      .channel("study-buddy-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "study_matches" }, (payload) => {
        if (payload.eventType === "INSERT") {
          const m = payload.new as StudyMatch;
          // Whoever clicked last made the match (user_a), so only the person who was waiting needs telling
          if (m.user_b === me) setNotice(`You're matched with ${m.user_a_name} in ${m.course}. Say hi!`);
        }
        refresh();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [me, refresh]);

  if (!supabaseConfigured) {
    return (
      <main className="page">
        <h1 className="page-title">Study buddy</h1>
        <p className="page-sub">Study buddy needs login. Add the Supabase keys to frontend/.env (see the README).</p>
      </main>
    );
  }

  // My calendar's courses, plus any I'm still waiting or matched in
  const courses = [
    ...new Set([...(myCourses ?? []), ...requests.map((r) => r.course), ...matches.map((m) => m.course)]),
  ].sort();
  const openIsActive = openMatch !== null && matches.some((m) => m.id === openMatch.id);

  async function find(course: string) {
    setBusyCourse(course);
    setError("");
    setNotice("");
    try {
      const match = await findBuddy(course);
      // Refresh first, so the new match is in the list before its chat opens
      await refresh();
      if (match) {
        setOpenMatch(match);
      } else {
        setNotice(`You're in the queue for ${course}. You'll be paired as soon as a classmate joins.`);
      }
    } catch (e) {
      setError(errorText(e, "Couldn't search for a buddy."));
    } finally {
      setBusyCourse(null);
    }
  }

  async function stopSearching(course: string) {
    setBusyCourse(course);
    setError("");
    try {
      await cancelRequest(course);
      setNotice("");
      await refresh();
    } catch (e) {
      setError(errorText(e, "Couldn't stop searching."));
    } finally {
      setBusyCourse(null);
    }
  }

  // After unmatching, blocking or reporting from the chat
  function leaveChat(message: string) {
    setOpenMatch(null);
    setNotice(message);
    refresh();
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Study buddy</h1>
          <p className="page-sub">
          Get paired with a classmate who's also looking in one of your courses, then message them here. Your buddy
          only sees your first name, never your email.
          </p>
        </div>
      </div>

      {error && <p className="notice notice-error mb-4">{error}</p>}
      {notice && <p className="notice notice-info mb-4">{notice}</p>}

      <div className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <section aria-labelledby="buddy-courses" className="panel p-4">
          <div className="section-head mb-1">
            <h2 id="buddy-courses" className="section-title">
              Your courses
            </h2>
            <span className="muted text-xs">One buddy per course</span>
          </div>

          {myCourses === null && <p className="muted">Loading…</p>}
          {myCourses !== null && courses.length === 0 && (
            <p className="muted">
              No upcoming deadlines yet.{" "}
              <Link to="/upload" className="link">
                Upload a syllabus
              </Link>{" "}
              and your courses show up here.
            </p>
          )}

          <ul className="rows">
            {courses.map((course) => {
              const match = matches.find((m) => m.course === course);
              const waiting = requests.find((r) => r.course === course);
              const busy = busyCourse !== null;
              return (
                <li key={course} className="row">
                  <div className="row-text">
                    <p className={`row-title ${match && openMatch?.id === match.id ? "text-accent" : ""}`}>{course}</p>
                    {waiting && !match && (
                      <p className="row-meta">
                        Waiting since {shortDate(waiting.created_at)}. We stop looking after {REQUEST_DAYS} days.
                      </p>
                    )}
                  </div>
                  {match && me ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMatch(match);
                        setNotice("");
                      }}
                      aria-pressed={openMatch?.id === match.id}
                      className={`btn btn-sm ${openMatch?.id === match.id ? "btn-primary" : ""}`}
                    >
                      Chat with {partnerName(match, me)}
                    </button>
                  ) : waiting ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => stopSearching(course)}
                      className="btn btn-quiet btn-sm"
                    >
                      <IconX size={14} />
                      Stop searching
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => find(course)}
                      className="btn btn-sm"
                    >
                      {busyCourse === course && <span className="spinner" />}
                      {busyCourse === course ? "Searching…" : "Find a buddy"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-label="Chat" className="panel flex h-[min(640px,75vh)] min-h-[28rem] flex-col">
          {openMatch && me && openIsActive ? (
            // A fresh chat for each match, so messages and drafts don't carry over
            <Chat key={openMatch.id} match={openMatch} me={me} onLeave={leaveChat} />
          ) : openMatch && me ? (
            <div className="m-auto flex max-w-sm flex-col items-center gap-3 p-6 text-center">
              <p className="muted">
                Your chat with {partnerName(openMatch, me)} in {openMatch.course} has ended.
              </p>
              <button
                type="button"
                onClick={() => setOpenMatch(null)}
                className="btn btn-sm"
              >
                Close
              </button>
            </div>
          ) : (
            <div className="m-auto flex max-w-sm flex-col items-center p-6 text-center">
              <span className="icon-tile">
                <IconUsers />
              </span>
              <h2 className="section-title">{matches.length ? "Pick a buddy" : "No buddies yet"}</h2>
              <p className="muted mt-1">
                {matches.length
                  ? "Choose Chat on one of your courses to open the conversation."
                  : "Choose Find a buddy on a course. If no one is waiting, you'll be paired with the next classmate who joins."}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

type ChatProps = {
  match: StudyMatch;
  me: string;
  onLeave: (notice: string) => void;
};

function Chat({ match, me, onLeave }: ChatProps) {
  const [messages, setMessages] = useState<StudyMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const name = partnerName(match, me);

  // Add messages we don't have yet (my own send and the live echo both arrive)
  const merge = useCallback((incoming: StudyMessage[]) => {
    setMessages((current) => {
      const seen = new Set(current.map((m) => m.id));
      const added = incoming.filter((m) => !seen.has(m.id));
      return added.length ? [...current, ...added].sort((a, b) => a.id - b.id) : current;
    });
  }, []);

  // Load the chat, mark it read, and listen for new messages while it's open
  useEffect(() => {
    loadMessages(match.id)
      .then(merge)
      .catch((e) => setError(errorText(e, "Couldn't load messages.")));
    markRead(match.id).catch(console.error);
    const channel = supabase
      .channel(`study-chat-${match.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "study_messages", filter: `match_id=eq.${match.id}` },
        (payload) => {
          const message = payload.new as StudyMessage;
          merge([message]);
          // I'm looking at it, so it's not unread
          if (message.sender !== me) markRead(match.id).catch(console.error);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [match.id, me, merge]);

  // Keep the newest message in view
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    setError("");
    try {
      merge([await sendMessage(match.id, body)]);
    } catch (err) {
      // Put it back so it isn't lost
      setDraft(body);
      setError(errorText(err, "Couldn't send."));
    }
  }

  // Run unmatch, block or report, then close the chat with a message
  async function run(action: () => Promise<void>, notice: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      onLeave(notice);
    } catch (e) {
      setError(errorText(e, "Something went wrong. Please try again."));
      setBusy(false);
    }
  }

  function confirmUnmatch() {
    if (!window.confirm(`Unmatch with ${name}? The chat closes for both of you, and you won't be paired again in ${match.course}.`)) return;
    run(() => unmatch(match.id), `You unmatched with ${name}. You won't be paired again in ${match.course}.`);
  }

  function confirmBlock() {
    if (!window.confirm(`Block ${name}? The chat ends now and you'll never be paired with them again, in any course. They'll only see that the chat ended.`)) return;
    run(() => block(match.id), `You blocked ${name}. You won't be paired with them again.`);
  }

  function sendReport(e: FormEvent) {
    e.preventDefault();
    run(() => report(match.id, reason), `Thanks for telling us. The Cohort team will look at your report, and ${name} is blocked.`);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-4 py-3">
        <div className="row-text">
          <p className="row-title">{name}</p>
          <p className="row-meta">{match.course}</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={confirmUnmatch}
          className="btn btn-quiet btn-sm"
        >
          Unmatch
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={confirmBlock}
          className="btn btn-quiet btn-sm btn-danger-text"
        >
          Block
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setReporting(!reporting)}
          className="btn btn-quiet btn-sm btn-danger-text"
        >
          Report
        </button>
      </div>

      {reporting && (
        <form onSubmit={sendReport} className="flex flex-col gap-2 border-b border-border bg-danger-subtle px-4 py-3">
          <label className="field">
            <span className="field-label">
              What happened? This goes to the Cohort team with a copy of this chat, not to {name}. Reporting also
              blocks them.
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={MAX_REPORT}
              className="input h-20"
              autoFocus
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !reason.trim()}
              className="btn btn-danger btn-sm"
            >
              Send report and block
            </button>
            <button
              type="button"
              onClick={() => setReporting(false)}
              className="btn btn-quiet btn-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <p className="border-b border-border bg-bg px-4 py-2 text-xs text-ink-3">
        Meet somewhere public on campus, and don't share personal details until you're comfortable.
      </p>

      <div ref={listRef} aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="muted m-auto text-xs">No messages yet. Say hi and suggest a time and place to study.</p>
        )}
        {messages.map((m) => {
          const mine = m.sender === me;
          return (
            <div key={m.id} className={`bubble${mine ? " mine" : ""}`}>
              {m.body}
              <time dateTime={m.created_at}>{messageTime(m.created_at)}</time>
            </div>
          );
        })}
      </div>

      {error && <p className="error-text px-4 pb-2">{error}</p>}

      <form onSubmit={send} className="flex gap-2 border-t border-border px-4 py-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_MESSAGE}
          placeholder={`Message ${name}`}
          aria-label="Message"
          className="input min-w-0 flex-1"
          autoFocus
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="btn btn-primary"
        >
          <IconSend />
          Send
        </button>
      </form>
    </>
  );
}

export default StudyBuddy;
