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
      <main className="p-6">
        <h1 className="text-2xl font-bold">Study buddy</h1>
        <p className="text-gray-600">Study buddy needs login. Add the Supabase keys to frontend/.env (see the README).</p>
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
    <main className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Study buddy</h1>
        <p className="text-gray-600">
          Get paired with a classmate who's also looking in one of your courses, then message them here. Your buddy
          only sees your first name, never your email.
        </p>
      </div>

      {error && <p className="text-red-600">{error}</p>}
      {notice && <p className="rounded border-l-4 border-blue-500 bg-blue-50 p-3 text-sm">{notice}</p>}

      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-labelledby="buddy-courses" className="flex flex-col gap-3 rounded-lg border p-4">
          <div>
            <h2 id="buddy-courses" className="text-lg font-semibold">
              Your courses
            </h2>
            <p className="text-sm text-gray-600">One buddy per course.</p>
          </div>

          {myCourses === null && <p className="text-gray-600">Loading…</p>}
          {myCourses !== null && courses.length === 0 && (
            <p className="text-sm text-gray-600">
              No upcoming deadlines yet.{" "}
              <Link to="/upload" className="text-blue-600 underline">
                Upload a syllabus
              </Link>{" "}
              and your courses show up here.
            </p>
          )}

          <ul className="flex flex-col divide-y">
            {courses.map((course) => {
              const match = matches.find((m) => m.course === course);
              const waiting = requests.find((r) => r.course === course);
              const busy = busyCourse !== null;
              return (
                <li key={course} className="flex flex-wrap items-center gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{course}</p>
                    {waiting && !match && (
                      <p className="text-sm text-gray-500">
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
                      className={`rounded px-3 py-1 text-sm ${
                        openMatch?.id === match.id ? "bg-blue-600 text-white" : "border text-blue-600 hover:bg-blue-50"
                      }`}
                    >
                      Chat with {partnerName(match, me)}
                    </button>
                  ) : waiting ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => stopSearching(course)}
                      className="rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                    >
                      Stop searching
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => find(course)}
                      className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                    >
                      {busyCourse === course ? "Searching…" : "Find a buddy"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-label="Chat" className="flex min-h-[28rem] flex-col rounded-lg border">
          {openMatch && me && openIsActive ? (
            // A fresh chat for each match, so messages and drafts don't carry over
            <Chat key={openMatch.id} match={openMatch} me={me} onLeave={leaveChat} />
          ) : openMatch && me ? (
            <div className="m-auto flex max-w-sm flex-col items-center gap-3 p-6 text-center">
              <p>
                Your chat with {partnerName(openMatch, me)} in {openMatch.course} has ended.
              </p>
              <button
                type="button"
                onClick={() => setOpenMatch(null)}
                className="rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          ) : (
            <div className="m-auto max-w-sm p-6 text-center text-gray-600">
              <p className="font-medium text-gray-800">{matches.length ? "Pick a buddy" : "No buddies yet"}</p>
              <p className="text-sm">
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
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{name}</p>
          <p className="text-sm text-gray-500">{match.course}</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={confirmUnmatch}
          className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >
          Unmatch
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={confirmBlock}
          className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Block
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setReporting(!reporting)}
          className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Report
        </button>
      </div>

      {reporting && (
        <form onSubmit={sendReport} className="flex flex-col gap-2 border-b bg-red-50 p-3">
          <label className="flex flex-col gap-1 text-sm">
            What happened? This goes to the Cohort team with a copy of this chat, not to {name}. Reporting also blocks
            them.
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={MAX_REPORT}
              className="h-20 rounded border bg-white p-2"
              autoFocus
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !reason.trim()}
              className="rounded bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-50"
            >
              Send report and block
            </button>
            <button
              type="button"
              onClick={() => setReporting(false)}
              className="rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <p className="bg-gray-50 px-3 py-2 text-xs text-gray-600">
        Meet somewhere public on campus, and don't share personal details until you're comfortable.
      </p>

      <div ref={listRef} aria-live="polite" className="flex h-80 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="m-auto text-sm text-gray-500">No messages yet. Say hi and suggest a time and place to study.</p>
        )}
        {messages.map((m) => {
          const mine = m.sender === me;
          return (
            <div
              key={m.id}
              className={`max-w-[80%] rounded-lg px-3 py-2 ${mine ? "self-end bg-blue-600 text-white" : "self-start bg-gray-100"}`}
            >
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className={`text-right text-xs ${mine ? "text-blue-100" : "text-gray-500"}`}>{messageTime(m.created_at)}</p>
            </div>
          );
        })}
      </div>

      {error && <p className="px-3 text-sm text-red-600">{error}</p>}

      <form onSubmit={send} className="flex gap-2 border-t p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_MESSAGE}
          placeholder={`Message ${name}`}
          aria-label="Message"
          className="min-w-0 flex-1 rounded border p-2"
          autoFocus
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </>
  );
}

export default StudyBuddy;
