import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { deleteDeadline, loadDeadlines, setDone, updateDeadline } from "../lib/deadlines";
import type { Deadline } from "../types";
import FullCalendar from "@fullcalendar/react";
import themePlugin from "@fullcalendar/react/themes/monarch";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import DeadlineModal from "../components/DeadlineModal";

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

  const courseColors = colorCourses(deadlines ?? []);
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
      <section className="panel cal-panel" aria-label="Month">
        <FullCalendar
          plugins={[themePlugin, dayGridPlugin]}
          initialView="dayGridMonth"
          events={events}
          fixedWeekCount={false}
          height="auto"
          borderless
          eventClick={(info) => setSelectedDeadline(info.event.extendedProps.deadline)}
          eventClass="cal-event"
          dayCellClass={(arg) => (arg.isToday ? "cal-today" : undefined)}
          eventContent={(info) => {
            const deadline: Deadline = info.event.extendedProps.deadline;
            // A tinted bar in the course color; done ones are grey and crossed out (.ev-pill in index.css)
            return (
              <span className={`ev-pill${deadline.done ? " is-done" : ""}`} style={courseVar(courseColors[deadline.course])}>
                <span className="ev-text">{info.event.title}</span>
              </span>
            );
          }}
          headerToolbar={{ start: "title", center: "", end: "prev,next" }}
        />
      </section>
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
