import { useEffect, useState } from "react";
import { Link } from "react-router";
import { loadDeadlines, setDone, deleteDeadline, updateDeadline} from "../lib/deadlines";
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
      eventClick={(info) =>
      setSelectedDeadline(info.event.extendedProps.deadline)}
      eventClass={() => "custom-event"}
      eventContent={(info) => {
        const deadline = info.event.extendedProps.deadline;
        const color = deadline.done ? "#9ca3af" : courseColors[deadline.course];
          return (
          <div className="rounded-full px-2 py-1 text-xs font-medium"  style={{ backgroundColor: `${color}30`, color, border: `1px solid ${color}`, textDecoration: deadline.done ? "line-through" : "none"}}>
            {info.event.title}
          </div>);
      }}
      headerToolbar={{left: "prev,next", center: "title", right: "",}}/>
      {selectedDeadline && (<DeadlineModal
        deadline={selectedDeadline}
        onClose={() => setSelectedDeadline(null)}
        onDone={async () => {
          if (!selectedDeadline.id) return;
          await setDone(selectedDeadline.id, !selectedDeadline.done);
          setDeadlines((current) => current?.map((d) => 
            d.id === selectedDeadline.id ? { ...d, done: !selectedDeadline.done} : d) ?? null);

          setSelectedDeadline(null);
        }}
        onDelete={async () => {
          if (!selectedDeadline.id) return;
          await deleteDeadline(selectedDeadline.id);
          setDeadlines((current) => current?.filter((d) => d.id !== selectedDeadline.id) ?? null);
          setSelectedDeadline(null);
        }}
        onSave={async (changes) => {
          if (!selectedDeadline?.id) return;
          await updateDeadline(selectedDeadline.id, changes);
          setDeadlines((current) => current?.map((d) => d.id === selectedDeadline.id ? { ...d, ...changes } : d) ?? null);
          setSelectedDeadline(null);
        }}
      />
    )}
    </main>
  );
}

export default Calendar;