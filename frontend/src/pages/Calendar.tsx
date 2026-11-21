import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { deleteDeadline, loadDeadlines, setDone, updateDeadline } from "../lib/deadlines";
import type { Deadline } from "../types";
import FullCalendar, { type CalendarRef } from "@fullcalendar/react";
import themePlugin from "@fullcalendar/react/themes/monarch";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import AgendaList, { AgendaRow } from "../components/AgendaList";
import CalendarSidebar from "../components/CalendarSidebar";
import DeadlineModal from "../components/DeadlineModal";
import NotificationPrompt from "../components/NotificationPrompt";
import { addDays, longDate, makeForecast, todayISO, toISO, WEEK_START } from "../lib/planner";
import { useIsPhone } from "../lib/useIsPhone";

import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/monarch/theme.css";
import "@fullcalendar/react/themes/monarch/palettes/purple.css";

// Each course gets the next color in this list, so the same course is always the same color
const palette = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

// Lets a course color be passed to CSS as --c (used by .dot and .ev-pill in index.css)
const courseVar = (color: string) => ({ "--c": color }) as CSSProperties;

function colorCourses(deadlines: Deadline[]): Record<string, string> {
  const courses = [...new Set(deadlines.map((d) => d.course))].sort();
  return Object.fromEntries(courses.map((course, i) => [course, palette[i % palette.length]]));
}

function Calendar() {
  const [deadlines, setDeadlines] = useState<Deadline[] | null>(null);
  const [error, setError] = useState("");
  const [selectedDeadline, setSelectedDeadline] = useState<Deadline | null>(null);
  // The day a sidebar row is hovered over, outlined on the grid
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const calendarRef = useRef<CalendarRef>(null);
  const calendarPanel = useRef<HTMLElement>(null);
  // Phones: a list of what's coming (components/AgendaList.tsx) or the month grid with the tapped day's
  // deadlines under it. Desktop always shows the grid with the sidebar.
  const isPhone = useIsPhone();
  const [view, setView] = useState<"list" | "month">("list");
  const [pickedDay, setPickedDay] = useState(todayISO);
  // Where the month grid opens (it remounts each time Month is picked)
  const [gridDate, setGridDate] = useState(todayISO);

  // Load the logged in user's saved deadlines from Supabase
  useEffect(() => {
    loadDeadlines()
      .then(setDeadlines)
      .catch((e: Error) => setError(e.message));
  }, []);

  // Put an edited deadline back into the list and the open popup
  function replaceDeadline(updated: Deadline) {
    setDeadlines((current) => current?.map((d) => (d.id === updated.id ? updated : d)) ?? null);
    setSelectedDeadline(updated);
  }

  // Tick or untick from the sidebar. Shown at once, put back if saving fails.
  async function toggleDone(deadline: Deadline) {
    const done = !deadline.done;
    const apply = (value: boolean) =>
      setDeadlines((current) => current?.map((d) => (d.id === deadline.id ? { ...d, done: value } : d)) ?? null);
    apply(done);
    try {
      await setDone(deadline.id!, done);
    } catch (e) {
      apply(!done);
      setError((e as Error).message);
    }
  }

  // Sidebar's forecast: move the grid to that week and bring it into view (it sits below the sidebar on tablets).
  // On phones the list's hell week card switches to Month and picks that week's first deadline.
  function showWeek(start: string) {
    if (isPhone) {
      const first = (deadlines ?? [])
        .map((d) => d.date)
        .filter((date) => date >= start && date <= addDays(start, 6))
        .sort()[0];
      setGridDate(start);
      setPickedDay(first ?? start);
      setView("month");
      window.scrollTo({ top: 0 });
      return;
    }
    calendarRef.current?.getApi().gotoDate(start);
    calendarPanel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const courseColors = colorCourses(deadlines ?? []);
  const today = todayISO();
  // Tint the hell week's row on the grid, if there is one
  const hell = makeForecast(deadlines ?? [], today).hell;
  const inHellWeek = (date: string) => !!hell && date >= hell.start && date <= addDays(hell.start, 6);
  // Convert Deadline objects into FullCalendar events.
  const hasDeadlines = !!deadlines && deadlines.length > 0;
  const showList = isPhone && view === "list" && hasDeadlines;
  const pickedDeadlines = (deadlines ?? []).filter((d) => d.date === pickedDay);
  const events = (deadlines ?? []).map((deadline) => ({
    title: deadline.title,
    date: deadline.date,
    extendedProps: {
      deadline,
    },
  }));

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Calendar</h1>
        {isPhone && hasDeadlines && (
          <div className="seg" role="group" aria-label="Calendar view">
            <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>
              List
            </button>
            <button
              type="button"
              aria-pressed={view === "month"}
              onClick={() => {
                setGridDate(pickedDay);
                setView("month");
              }}
            >
              Month
            </button>
          </div>
        )}
        {/* Which color is which course (the list names the course on every row, so it doesn't need this) */}
        {!showList && Object.keys(courseColors).length > 0 && (
          <ul className="chips" aria-label="Courses">
            {Object.entries(courseColors).map(([course, color]) => (
              <li key={course} className="chip" style={courseVar(color)}>
                <i className="dot" />
                {course}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="notice notice-error mb-4">{error}</p>}
      {!deadlines && !error && <p className="muted mb-4">Loading deadlines...</p>}
      {deadlines?.some((d) => !d.done && d.date >= today) && (
        <NotificationPrompt
          id="deadlines"
          title="Want a reminder before things are due?"
          text="Cohort can remind you the evening before each deadline, and 3 days before exams and anything worth 15% or more."
        />
      )}
      {deadlines?.length === 0 && (
        <div className="empty mb-4">
          <h2 className="modal-title">No deadlines yet</h2>
          <p className="muted">Upload a syllabus and its deadlines show up here after you check them.</p>
          <Link to="/upload" className="btn btn-primary mt-5">
            Upload a syllabus
          </Link>
        </div>
      )}
      {showList ? (
        <AgendaList
          deadlines={deadlines!}
          courseColors={courseColors}
          today={today}
          onOpen={setSelectedDeadline}
          onToggleDone={toggleDone}
          onShowWeek={showWeek}
        />
      ) : (
        <div className={hasDeadlines && !isPhone ? "cal-layout" : undefined}>
          <section ref={calendarPanel} className="panel cal-panel" aria-label="Month">
            <FullCalendar
              ref={calendarRef}
              plugins={[themePlugin, dayGridPlugin, interactionPlugin]}
              firstDay={WEEK_START}
              initialView="dayGridMonth"
              initialDate={isPhone ? gridDate : undefined}
              // Phones: tapping a day lists its deadlines under the grid (the bars are too small to aim at)
              dateClick={isPhone ? (info) => setPickedDay(toISO(info.date)) : undefined}
              events={events}
              fixedWeekCount={false}
              height="auto"
              borderless
              eventClick={(info) => setSelectedDeadline(info.event.extendedProps.deadline)}
              eventClass="cal-event"
              dayCellClass={(arg) => {
                const date = toISO(arg.date);
                return [
                  arg.isToday && "cal-today",
                  inHellWeek(date) && "cal-hell",
                  date === hoveredDate && "cal-hover",
                  isPhone && date === pickedDay && "cal-picked",
                ]
                  .filter(Boolean)
                  .join(" ");
              }}
              eventContent={(info) => {
                const deadline: Deadline = info.event.extendedProps.deadline;
                // A tinted bar in the course color; done ones are grey and crossed out (.ev-pill in index.css)
                return (
                  <span className={`ev-pill${deadline.done ? " is-done" : ""}`} style={courseVar(courseColors[deadline.course])}>
                    <span className="ev-text">{info.event.title}</span>
                  </span>
                );
              }}
              headerToolbar={{ start: "title", center: "", end: "today prev,next" }}
            />
          </section>
          {hasDeadlines && !isPhone && (
            <CalendarSidebar
              deadlines={deadlines}
              courseColors={courseColors}
              today={today}
              onOpen={setSelectedDeadline}
              onToggleDone={toggleDone}
              onHoverDate={setHoveredDate}
              onShowWeek={showWeek}
            />
          )}
        </div>
      )}
      {isPhone && view === "month" && hasDeadlines && (
        <section className="ag-sec mt-4" aria-labelledby="picked-day">
          <h2 id="picked-day" className="ag-h">
            {pickedDay === today ? `Today · ${longDate(pickedDay)}` : longDate(pickedDay)}
          </h2>
          {pickedDeadlines.length === 0 ? (
            <p className="ag-calm muted">Nothing due this day. Tap another day to see what's due.</p>
          ) : (
            <ul className="ag-list">
              {pickedDeadlines.map((d) => (
                <AgendaRow
                  key={d.id ?? `${d.course}-${d.title}`}
                  deadline={d}
                  color={courseColors[d.course]}
                  onOpen={setSelectedDeadline}
                  onToggleDone={toggleDone}
                />
              ))}
            </ul>
          )}
        </section>
      )}
      {selectedDeadline?.id && (
        <DeadlineModal
          // A fresh popup for each deadline, so its edits start from that deadline
          key={selectedDeadline.id}
          deadline={selectedDeadline}
          onClose={() => setSelectedDeadline(null)}
          // Stays open after marking done, so unsaved edits in the popup aren't lost
          onDone={async () => {
            const done = !selectedDeadline.done;
            await setDone(selectedDeadline.id!, done);
            replaceDeadline({ ...selectedDeadline, done });
          }}
          onDelete={async () => {
            await deleteDeadline(selectedDeadline.id!);
            setDeadlines((current) => current?.filter((d) => d.id !== selectedDeadline.id) ?? null);
            setSelectedDeadline(null);
          }}
          onSave={async (changes) => {
            await updateDeadline(selectedDeadline.id!, changes);
            replaceDeadline({ ...selectedDeadline, ...changes });
            setSelectedDeadline(null);
          }}
        />
      )}
    </main>
  );
}

export default Calendar;
