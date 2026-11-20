import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { deleteDeadline, loadDeadlines, setDone, updateDeadline } from "../lib/deadlines";
import type { Deadline } from "../types";
import FullCalendar, { type CalendarRef } from "@fullcalendar/react";
import themePlugin from "@fullcalendar/react/themes/monarch";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import CalendarSidebar from "../components/CalendarSidebar";
import DeadlineModal from "../components/DeadlineModal";
import { addDays, makeForecast, todayISO, toISO, WEEK_START } from "../lib/planner";

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

  // Sidebar's forecast: move the grid to that week and bring it into view (it sits below the sidebar on phones)
  function showWeek(start: string) {
    calendarRef.current?.getApi().gotoDate(start);
    calendarPanel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const courseColors = colorCourses(deadlines ?? []);
  const today = todayISO();
  // Tint the hell week's row on the grid, if there is one
  const hell = makeForecast(deadlines ?? [], today).hell;
  const inHellWeek = (date: string) => !!hell && date >= hell.start && date <= addDays(hell.start, 6);
  // Convert Deadline objects into FullCalendar events.
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
        {/* Which color is which course */}
        {Object.keys(courseColors).length > 0 && (
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
      {deadlines?.length === 0 && (
        <div className="empty mb-4">
          <h2 className="modal-title">No deadlines yet</h2>
          <p className="muted">Upload a syllabus and its deadlines show up here after you check them.</p>
          <Link to="/upload" className="btn btn-primary mt-5">
            Upload a syllabus
          </Link>
        </div>
      )}
      <div className={deadlines?.length ? "cal-layout" : undefined}>
        <section ref={calendarPanel} className="panel cal-panel" aria-label="Month">
          <FullCalendar
            ref={calendarRef}
            plugins={[themePlugin, dayGridPlugin]}
            firstDay={WEEK_START}
            initialView="dayGridMonth"
            events={events}
            fixedWeekCount={false}
            height="auto"
            borderless
            eventClick={(info) => setSelectedDeadline(info.event.extendedProps.deadline)}
            eventClass="cal-event"
            dayCellClass={(arg) => {
              const date = toISO(arg.date);
              return [arg.isToday && "cal-today", inHellWeek(date) && "cal-hell", date === hoveredDate && "cal-hover"]
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
        {deadlines && deadlines.length > 0 && (
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
