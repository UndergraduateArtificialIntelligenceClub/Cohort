import { useEffect, useState } from "react";
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
const palette = ["#6366f1", "#22c55e", "#ef4444", "#f59e0b", "#06b6d4", "#ec4899", "#8b5cf6", "#84cc16"];

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
    <main className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">Calendar</h1>
      {error && <p className="text-red-600">{error}</p>}
      {!deadlines && !error && <p className="text-gray-600">Loading deadlines...</p>}
      {deadlines?.length === 0 && (
        <p className="text-gray-600">
          No deadlines yet.{" "}
          <Link to="/upload" className="text-blue-600 underline">
            Upload a syllabus
          </Link>{" "}
          to add some.
        </p>
      )}
      {Object.keys(courseColors).length > 0 && (
        <ul className="flex flex-wrap gap-4 text-sm">
          {Object.entries(courseColors).map(([course, color]) => (
            <li key={course} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: color }} />
              {course}
            </li>
          ))}
        </ul>
      )}
      <FullCalendar
        plugins={[themePlugin, dayGridPlugin]}
        initialView="dayGridMonth"
        events={events}
        fixedWeekCount={false}
        height="auto"
        eventClick={(info) => setSelectedDeadline(info.event.extendedProps.deadline)}
        eventClass={() => "custom-event"}
        eventContent={(info) => {
          const deadline: Deadline = info.event.extendedProps.deadline;
          const color = deadline.done ? "#9ca3af" : courseColors[deadline.course];
          return (
            <div
              className="rounded-full px-2 py-1 text-xs font-medium"
              style={{
                backgroundColor: `${color}30`,
                color,
                border: `1px solid ${color}`,
                textDecoration: deadline.done ? "line-through" : "none",
              }}
            >
              {info.event.title}
            </div>
          );
        }}
        headerToolbar={{ left: "prev,next", center: "title", right: "" }}
      />
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
