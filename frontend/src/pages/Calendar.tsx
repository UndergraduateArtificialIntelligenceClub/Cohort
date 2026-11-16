import { useEffect, useState } from "react";
import { Link } from "react-router";
import { loadDeadlines } from "../lib/deadlines";
import type { Deadline } from "../types";
import FullCalendar from "@fullcalendar/react";
import themePlugin from "@fullcalendar/react/themes/monarch";
import dayGridPlugin from "@fullcalendar/react/daygrid";

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

  // Load the logged in user's saved deadlines from Supabase
  useEffect(() => {
    loadDeadlines()
      .then(setDeadlines)
      .catch((e: Error) => setError(e.message));
  }, []);

  const courseColors = colorCourses(deadlines ?? []);
  // Convert Deadline objects into FullCalendar events.
  const events = (deadlines ?? []).map((deadline) => ({
    title: `${deadline.course}: ${deadline.title}`,
    date: deadline.date,
    color: courseColors[deadline.course],
  }));

  return (
    <main className="flex flex-col gap-4 p-8">
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
      <FullCalendar plugins={[themePlugin, dayGridPlugin]} initialView="dayGridMonth" events={events} headerToolbar={{left: "prev,next", center: "title", right: "",}}/>
    </main>
  );
}

export default Calendar;
