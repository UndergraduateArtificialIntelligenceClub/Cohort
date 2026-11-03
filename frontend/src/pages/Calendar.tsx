import { useEffect, useState } from "react";
import { API } from "../lib/config";
import type { Deadline } from "../types";
import FullCalendar from "@fullcalendar/react";
import themePlugin from "@fullcalendar/react/themes/monarch";
import dayGridPlugin from "@fullcalendar/react/daygrid";

import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/monarch/theme.css";
import "@fullcalendar/react/themes/monarch/palettes/purple.css";

// Assign a color to each course (hardcoded for now for issue 27 since we're using mock data).
const courseColors: Record<string, string> = {
  "CMPUT 201": "#6366f1",
  "STAT 252": "#22c55e",
  "SPH 200": "#ef4444",
};

// Mock deadlines used for calendar page development.(issue 27)
// These will eventually be replaced with real backend data (hopefully).
const mockDeadlines: Deadline[] = [ 
  {
    course: "CMPUT 201",
    title: "Assignment 2",
    date: "2026-11-05",
    category: "assignment",
    source_text: "Assignment 2 due",
    weight: 15,
  },
  {
    course: "STAT 252",
    title: "Midterm",
    date: "2026-10-31",
    category: "midterm",
    source_text: "Midterm exam",
    weight: 25,
  },
  {
    course: "SPH 200",
    title: "Reflection Paper",
    date: "2026-12-01",
    category: "assignment",
    source_text: "Reflection paper due",
    weight: 10,
  },
    {
    course: "CMPUT 201",
    title: "Assignment 3",
    date: "2026-11-12",
    category: "assignment",
    source_text: "Assignment 3 due",
    weight: 15,
  },
  {
    course: "CMPUT 201",
    title: "Midterm",
    date: "2026-11-19",
    category: "midterm",
    source_text: "Midterm exam",
    weight: 25,
  },
  {
    course: "STAT 252",
    title: "Quiz 2",
    date: "2026-11-10",
    category: "quiz",
    source_text: "Quiz 2",
    weight: 5,
  },
  {
    course: "STAT 252",
    title: "Assignment 4",
    date: "2026-11-24",
    category: "assignment",
    source_text: "Assignment 4 due",
    weight: 10,
  },
  {
    course: "STAT 252",
    title: "Final Review",
    date: "2026-12-08",
    category: "assignment",
    source_text: "Review session",
    weight: null,
  },
  {
    course: "SPH 200",
    title: "Discussion Post",
    date: "2026-11-17",
    category: "assignment",
    source_text: "Discussion due",
    weight: 5,
  },
  {
    course: "SPH 200",
    title: "Final Reflection",
    date: "2026-12-10",
    category: "assignment",
    source_text: "Final reflection paper",
    weight: 20,
  },
];
// Convert Deadline objects into FullCalendar events.
const events = mockDeadlines.map((deadline) => ({
  title: deadline.title,
  date: deadline.date,
  color: courseColors[deadline.course],
}));

function Calendar() {
  const [status, setStatus] = useState("Checking backend...");

  useEffect(() => {//this verifies the backend connectivity and displays the status on the page.
    fetch(`${API}/`)
      .then((res) => res.json())
      .then((data) => setStatus(data.message))
      .catch(() => setStatus("Can't reach the backend. Is it running?"));
  }, []);

  return (
    <main className="flex flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">Calendar</h1>
      <p>{status}</p>
      <FullCalendar plugins={[themePlugin, dayGridPlugin]} initialView="dayGridMonth" events={events} headerToolbar={{left: "prev,next", center: "title", right: "",}}/>
    </main>
  );
}

export default Calendar;
