import { useEffect, useState } from "react";
import { API } from "../lib/config";
import type { Deadline } from "../types";

// Month calendar with mock data: issue #27
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
];

function Calendar() {
  const [status, setStatus] = useState("Checking backend...");

  useEffect(() => {
    fetch(`${API}/`)
      .then((res) => res.json())
      .then((data) => setStatus(data.message))
      .catch(() => setStatus("Can't reach the backend. Is it running?"));
  }, []);

  return (
    <main className="flex flex-col items-center gap-2 p-8">
      <h1 className="text-2xl font-bold">Calendar</h1>
      <p>{status}</p>
    </main>
  );
}

export default Calendar;
