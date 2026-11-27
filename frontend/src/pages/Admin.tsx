// Launch metrics for the team (supabase/migrations/20261127140000_usage_events.sql). Not linked from the nav.
// Everything here is a total from admin_metrics(): no names, emails or anyone's own data, as the Privacy Policy
// promises. What each number means and why it matters is in the README's Launch metrics section.
import { useEffect, useState } from "react";
import { loadMetrics, type Metrics, type ParseStats } from "../lib/metrics";

// "42%", or a dash when there's nothing to divide by yet
function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

// "Nov 27, 4:17 p.m." in Edmonton time, like the rest of the app's server-side times
function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Edmonton",
  });
}

// "Dec 3" from "2026-12-03", without the browser's time zone moving it a day
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
}

function Admin() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [includeTeam, setIncludeTeam] = useState(false);

  // State only changes once the totals arrive, so the first load can run straight from the effect
  function load(team = includeTeam) {
    loadMetrics(team)
      .then((m) => {
        setMetrics(m);
        setError("");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load metrics."))
      .finally(() => setLoading(false));
  }

  function refresh(team = includeTeam) {
    setLoading(true);
    load(team);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- first load only; the switch and Refresh reload
  useEffect(() => load(), []);

  if (error === "Not allowed.") {
    return (
      <main className="page">
        <h1 className="page-title">Not available</h1>
        <p className="page-sub">This page is only for the Cohort team.</p>
      </main>
    );
  }

  return (
    <main className="page admin">
      <div className="page-head">
        <div>
          <h1 className="page-title">Launch metrics</h1>
          <p className="page-sub">
            Totals across everyone{includeTeam ? ", including the team's own accounts" : ", with the team's own accounts left out"}.
            {metrics && ` Updated ${timeLabel(metrics.generated_at)}.`}
          </p>
        </div>
        <div className="page-actions">
          <label className="admin-switch">
            <input
              type="checkbox"
              checked={includeTeam}
              disabled={loading}
              onChange={(e) => {
                setIncludeTeam(e.target.checked);
                refresh(e.target.checked);
              }}
            />
            Include team accounts
          </label>
          <button type="button" className="btn" onClick={() => refresh()} disabled={loading}>
            {loading ? <span className="spinner" /> : null} Refresh
          </button>
        </div>
      </div>

      {error && <p className="notice notice-error">{error}</p>}
      {metrics && <CountingSince since={metrics.counting_since} />}
      {!metrics && loading && <p className="muted">Loading…</p>}
      {metrics && <Dashboard m={metrics} />}
    </main>
  );
}

// Active users, uploads and retention come from usage counts, which only exist from the day they went live.
// Signups, activation, courses and study buddy come from tables with full history.
function CountingSince({ since }: { since: string | null }) {
  return (
    <p className="notice notice-info">
      {since
        ? `Usage counts started ${timeLabel(since)}. Active students, uploads and retention only cover the time since then, and earlier days show as not recorded. Signups, activation, courses and study buddy go back to the start.`
        : "No usage counts yet. Active students, uploads and retention start filling in once someone opens the app."}
    </p>
  );
}

function Dashboard({ m }: { m: Metrics }) {
  const a24 = m.activation_24h;
  const w1 = m.week1_retention;
  const w4 = m.week4_retention;
  const cpp = m.courses_per_person;
  const courseRows = (["1", "2", "3", "4", "5+"] as const).map((k) => ({ label: k === "1" ? "1 course" : `${k} courses`, value: cpp[k] }));
  const sources = Object.entries(m.sources)
    .sort((x, y) => y[1] - x[1])
    .map(([label, value]) => ({ label, value }));
  const sb = m.study_buddy;

  return (
    <>
      <section className="admin-tiles" aria-label="Headline numbers">
        <Tile label="Activated in 24h" value={pct(a24.activated ?? 0, a24.cohort)} note={`${a24.activated ?? 0} of ${a24.cohort} signups, last 30 days`} />
        <Tile label="Active this week" value={m.active_7d.toLocaleString()} note={`${m.active_today} today · ${m.active_30d} in 30 days`} />
        <Tile label="Week 1 retention" value={pct(w1.returned ?? 0, w1.cohort)} note={`came back days 7–13 (${w1.cohort} people)`} />
        <Tile label="Week 4 retention" value={pct(w4.returned ?? 0, w4.cohort)} note={`came back days 28–34 (${w4.cohort} people)`} />
      </section>

      <section className="admin-tiles" aria-label="Accounts">
        <Tile label="Accounts" value={m.users.toLocaleString()} note={`${m.new_7d} new this week`} />
        <Tile label="Have a school deadline" value={m.activated.toLocaleString()} note={`${pct(m.activated, m.users)} of accounts`} />
        <Tile label="Courses per student" value={cpp.average?.toString() ?? "—"} note="this term, students with at least one" />
        <Tile label="Notifications on" value={pct(m.push_people, m.activated)} note={`${m.push_people} students`} />
      </section>

      <div className="admin-grid">
        <DailyBars title="Signups per day" rows={m.daily} field="signups" unit="signups" />
        <DailyBars title="Active students per day" rows={m.daily} field="active" unit="active" />
      </div>

      <section className="panel admin-panel">
        <h2 className="section-title">Uploads, last 30 days{m.counting_since ? ` (counted since ${timeLabel(m.counting_since)})` : ""}</h2>
        <p className="muted admin-note">
          "Saved unchanged" means nothing was removed and no course renamed. How much people remove is the best
          sign of how accurate the parser is.
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">From</th>
                <th scope="col">Read</th>
                <th scope="col">Failed</th>
                <th scope="col">Saved</th>
                <th scope="col">Saved unchanged</th>
                <th scope="col">Dates removed</th>
                <th scope="col">Undated given a date</th>
              </tr>
            </thead>
            <tbody>
              <ParseRow label="Syllabus" s={m.parsing.syllabus} />
              <ParseRow label="Canvas" s={m.parsing.canvas} />
              <ParseRow label="Course library" s={m.parsing.library} reads={false} />
            </tbody>
          </table>
        </div>
        <p className="muted admin-note">
          Library share of saves: {pct(m.parsing.library?.saved ?? 0, (m.parsing.library?.saved ?? 0) + (m.parsing.syllabus?.saved ?? 0))}{" "}
          · {m.library_live} shared syllabi live
        </p>
      </section>

      <div className="admin-grid">
        <section className="panel admin-panel">
          <h2 className="section-title">Courses per student, this term</h2>
          <MeterList rows={courseRows} />
        </section>
        <section className="panel admin-panel">
          <h2 className="section-title">Where new accounts came from</h2>
          {sources.length ? (
            <MeterList rows={sources} />
          ) : (
            <p className="muted admin-note">None yet. Share links with ?utm_source=reddit (or discord, poster...).</p>
          )}
        </section>
      </div>

      <section className="admin-tiles" aria-label="Study buddy">
        <Tile label="Study buddy matches" value={sb.matches.toLocaleString()} note="last 30 days" />
        <Tile label="Both wrote" value={pct(sb.both_wrote, sb.matches)} note={`${sb.both_wrote} real chats`} />
        <Tile label="Messages" value={sb.messages.toLocaleString()} note="last 30 days" />
        <Tile label="Waiting for a buddy" value={sb.waiting.toLocaleString()} note="right now" />
      </section>

      <section className="panel admin-panel">
        <h2 className="section-title">Biggest courses this term</h2>
        <p className="muted admin-note">The library and study buddy only work once a course has enough students.</p>
        {m.top_courses.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Course</th>
                  <th scope="col">Students</th>
                  <th scope="col">Shared syllabi</th>
                  <th scope="col">Waiting for a buddy</th>
                </tr>
              </thead>
              <tbody>
                {m.top_courses.map((c) => (
                  <tr key={c.course}>
                    <th scope="row">{c.course}</th>
                    <td>{c.students}</td>
                    <td>{c.shared}</td>
                    <td>{c.waiting}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted admin-note">No courses yet.</p>
        )}
      </section>
    </>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="panel admin-tile">
      <p className="admin-tile-label">{label}</p>
      <p className="admin-tile-value tabular">{value}</p>
      <p className="admin-tile-note">{note}</p>
    </div>
  );
}

function ParseRow({ label, s, reads = true }: { label: string; s: ParseStats | undefined; reads?: boolean }) {
  const x = s ?? { parsed: 0, failed: 0, saved: 0, found: 0, removed: 0, renamed: 0, undated: 0, added: 0, unchanged: 0 };
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{reads ? x.parsed : "—"}</td>
      <td>{reads ? `${x.failed} (${pct(x.failed, x.parsed + x.failed)})` : "—"}</td>
      <td>{x.saved}</td>
      <td>{pct(x.unchanged, x.saved)}</td>
      <td>{pct(x.removed, x.found)}</td>
      <td>{x.undated ? pct(x.added, x.undated) : "—"}</td>
    </tr>
  );
}

// One series of daily columns. Hovering or focusing a day shows its number above the chart; the same numbers are
// in the table under "Show as table".
function DailyBars({
  title,
  rows,
  field,
  unit,
}: {
  title: string;
  rows: Metrics["daily"];
  field: "signups" | "active";
  unit: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const value = (r: Metrics["daily"][number]) => r[field];
  const label = (r: Metrics["daily"][number]) => (value(r) === null ? "not recorded" : `${value(r)} ${unit}`);
  const max = Math.max(1, ...rows.map((r) => value(r) ?? 0));
  const shown = hover ?? rows.length - 1;
  const day = rows[shown];

  return (
    <section className="panel admin-panel">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        {day && (
          <span className="muted tabular" aria-live="polite">
            {shortDate(day.date)}: {label(day)}
          </span>
        )}
      </div>
      <div className="admin-bars" onMouseLeave={() => setHover(null)}>
        {rows.map((r, i) => (
          <button
            key={r.date}
            type="button"
            className={`admin-bar-hit${i === shown ? " is-current" : ""}`}
            aria-label={`${shortDate(r.date)}: ${label(r)}`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            {value(r) === null ? (
              <span className="admin-bar-missing" />
            ) : (
              <span className="admin-bar" style={{ height: `${((value(r) ?? 0) / max) * 100}%` }} />
            )}
          </button>
        ))}
      </div>
      <div className="admin-axis muted">
        <span>{rows[0] && shortDate(rows[0].date)}</span>
        <span>max {max}</span>
        <span>{rows.at(-1) && shortDate(rows.at(-1)!.date)}</span>
      </div>
      <details className="admin-details">
        <summary>Show as table</summary>
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.date}>
                <th scope="row">{shortDate(r.date)}</th>
                <td>{value(r) ?? "not recorded"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

// A name, a bar and a number per row, bars on one baseline so they compare
function MeterList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="admin-meters">
      {rows.map((r) => (
        <li key={r.label} className="admin-meter">
          <span className="admin-meter-label">{r.label}</span>
          <span className="admin-meter-track">
            <span className="admin-meter-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="admin-meter-value tabular">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

export default Admin;
