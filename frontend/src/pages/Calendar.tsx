import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router";
import { addDeadline, deleteCourse, deleteDeadline, loadDeadlines, setDone, updateDeadline } from "../lib/deadlines";
import { courseLabel, PERSONAL_LABEL } from "../lib/courses";
import { applyFilters, loadFilters, saveFilters, toggleCourse } from "../lib/filters";
import {
  assignColors,
  colorMap,
  loadCourseColors,
  rememberCourseColors,
  setCourseColor,
  type ColorChoices,
} from "../lib/courseColors";
import type { Deadline } from "../types";
import FullCalendar from "@fullcalendar/react";
import themePlugin from "@fullcalendar/react/themes/monarch";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import AgendaList, { AgendaRow } from "../components/AgendaList";
import CalendarSidebar from "../components/CalendarSidebar";
import CalendarFilters from "../components/CalendarFilters";
import DeadlineModal from "../components/DeadlineModal";
import NotificationPrompt from "../components/NotificationPrompt";
import { IconPlus } from "../components/Icons";
import { addDays, bySchedule, courseCount, longDate, makeForecast, shortTimeLabel, todayISO, toISO, weekLabel, WEEK_START } from "../lib/planner";
import { useIsPhone } from "../lib/useIsPhone";

import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/monarch/theme.css";
import "@fullcalendar/react/themes/monarch/palettes/purple.css";

// Lets a course color be passed to CSS as --c (used by .dot and .ev-pill in index.css)
const courseVar = (color: string) => ({ "--c": color }) as CSSProperties;

// A blank one for the Add popup. It starts as a school item; the popup can switch it to personal.
function draft(date: string): Deadline {
  return { course: "", title: "", date, category: "assignment", source_text: null, weight: null };
}

function Calendar() {
  const [deadlines, setDeadlines] = useState<Deadline[] | null>(null);
  const [error, setError] = useState("");
  // The one open in the popup. Without an id it's a new one being added.
  const [selectedDeadline, setSelectedDeadline] = useState<Deadline | null>(null);
  // The day a sidebar row is hovered over, outlined on the grid
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  // Phones: a list of what's coming (components/AgendaList.tsx) or the month grid with the tapped day's
  // deadlines under it. Desktop always shows the grid with the sidebar.
  const isPhone = useIsPhone();
  const [view, setView] = useState<"list" | "month">("list");
  const [pickedDay, setPickedDay] = useState(todayISO);
  // Where the month grid opens (it remounts each time Month is picked)
  const [gridDate, setGridDate] = useState(todayISO);
  // Saved course colors (lib/courseColors.ts). null when they couldn't be loaded, e.g. before the
  // course_colors migration is run: colors are then worked out the old way and nothing is saved.
  const [savedColors, setSavedColors] = useState<ColorChoices | null>(null);
  // Courses switched off and Hide done (#79), kept in this browser
  const [filters, setFilters] = useState(loadFilters);
  useEffect(() => saveFilters(filters), [filters]);
  // Something just added or moved into a hidden course would seem to vanish, so show that course again
  function showCourseOf(d: Deadline) {
    setFilters((f) => (f.hidden.includes(courseLabel(d)) ? toggleCourse(f, courseLabel(d)) : f));
  }

  // Load the logged in user's saved deadlines and course colors from Supabase, together so the calendar
  // never shows in one set of colors and then switches. Colors are only looks, so failing to load them
  // never stops the calendar.
  useEffect(() => {
    Promise.all([loadDeadlines(), loadCourseColors().catch(() => null)])
      .then(([loaded, colors]) => {
        setSavedColors(colors);
        setDeadlines(loaded);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // A course that's new to the calendar (first load, an upload, a typed-in course) gets its color saved,
  // so adding or removing other courses never changes it. Saved colors win over these.
  useEffect(() => {
    if (!deadlines || savedColors === null) return;
    const { added } = assignColors(deadlines, savedColors);
    if (Object.keys(added).length === 0) return;
    rememberCourseColors(added)
      .then(() => setSavedColors((current) => current && { ...added, ...current }))
      .catch(() => {}); // tried again next time; until then the colors are the same, just not saved
  }, [deadlines, savedColors]);

  // Picked in the color picker. Shown at once, put back if saving fails. The other courses keep the colors
  // on screen right now: any that weren't saved yet are saved with it, so none of them can shift afterwards.
  async function pickColor(course: string, color: number) {
    const before = savedColors;
    const unsaved = Object.fromEntries(
      Object.entries(colorChoices).filter(([other]) => other !== course && !(before && other in before))
    );
    setSavedColors({ ...colorChoices, ...before, [course]: color });
    try {
      await Promise.all([setCourseColor(course, color), rememberCourseColors(unsaved)]);
    } catch (e) {
      setSavedColors(before);
      setError((e as Error).message);
    }
  }

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

  // The phone list's hell week card: switch to Month on that week and pick its first deadline
  function showWeek(start: string) {
    const first = (deadlines ?? [])
      .map((d) => d.date)
      .filter((date) => date >= start && date <= addDays(start, 6))
      .sort()[0];
    setGridDate(start);
    setPickedDay(first ?? start);
    setView("month");
    window.scrollTo({ top: 0 });
  }

  const colorChoices = assignColors(deadlines ?? [], savedColors ?? {}).choices;
  const courseColors = colorMap(deadlines ?? [], colorChoices);
  // Suggestions for the popup's course box
  const myCourses = Object.keys(courseColors).filter((c) => c !== PERSONAL_LABEL);
  const today = todayISO();
  // What the grid, the sidebar and the phone's day list show. The phone's List view has no filter chips,
  // so it always shows everything. Course colors always come from every course.
  const shown = applyFilters(deadlines ?? [], filters);
  // The heaviest week coming up (hell week, lib/planner.ts), if there is one: its row on the grid is tinted
  // and labeled. Counted like the sidebar: only what's still to do (not done, today or later) in the courses
  // being shown, so the label and the sidebar never disagree. The forecast starts at this week.
  // Hide done only changes the look: the label already leaves done items out, and they still count toward
  // the term's usual week.
  const hell = makeForecast(applyFilters(deadlines ?? [], { ...filters, hideDone: false }), today, { openOnly: true }).hell;
  const inHellWeek = (date: string) => !!hell && date >= hell.start && date <= addDays(hell.start, 6);
  const hellCourses = hell ? courseCount(hell.items) : 0;
  const hellLabel = hell && `Heaviest week ahead · ${hell.items.length} due across ${hellCourses} course${hellCourses === 1 ? "" : "s"}`;
  const showHellLabel = !!hell && !isPhone;
  const isHellStart = (date: Date) => !!hell && toISO(date) === hell.start;
  const hasDeadlines = !!deadlines && deadlines.length > 0;
  const showList = isPhone && view === "list" && hasDeadlines;
  const pickedDeadlines = shown.filter((d) => d.date === pickedDay).sort(bySchedule);
  // Convert Deadline objects into FullCalendar events.
  const events = shown.map((deadline) => ({
    title: deadline.title,
    date: deadline.date,
    extendedProps: {
      deadline,
      // Within a day: earliest first, untimed ones last (eventOrder below)
      timeOrder: deadline.time ?? "99",
    },
  }));

  // Course chips on their own row under the title: the dot picks a color, the name shows or hides the course.
  // The phone's List view names the course on every row and has no filters, so it doesn't get this.
  const filterBar = !showList && Object.keys(courseColors).length > 0 && (
    <CalendarFilters
      courseColors={courseColors}
      colorChoices={colorChoices}
      filters={filters}
      onChange={setFilters}
      onPickColor={pickColor}
    />
  );

  return (
    <main className="page">
      <div className="page-head">
        <h1 className="page-title">Calendar</h1>
        <div className="page-actions">
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
          {/* The page's main action, unless the calendar is empty: then it's Upload a syllabus, below.
              Phones: just the icon, so it fits next to List / Month. */}
          <button
            type="button"
            className={`btn${hasDeadlines ? " btn-primary" : ""}${isPhone ? " btn-icon" : ""}`}
            aria-label={isPhone ? "Add an event" : undefined}
            onClick={() => setSelectedDeadline(draft(isPhone && view === "month" ? pickedDay : today))}
          >
            <IconPlus />
            {!isPhone && "Add event"}
          </button>
        </div>
      </div>
      {filterBar}
      {error && <p className="notice notice-error mb-4">{error}</p>}
      {!deadlines && !error && <p className="muted mb-4">Loading deadlines...</p>}
      {deadlines?.some((d) => !d.done && d.date >= today) && (
        <NotificationPrompt
          id="deadlines"
          title="Want a reminder before things are due?"
          text="Cohort can remind you the evening before anything on your calendar, and 3 days before exams and anything worth 15% or more."
        />
      )}
      {deadlines?.length === 0 && (
        <div className="empty mb-4">
          <h2 className="modal-title">No deadlines yet</h2>
          <p className="muted">
            Upload a syllabus and its deadlines show up here after you check them. You can also add events yourself,
            for school or anything else{isPhone ? "." : ": click any day."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/upload" className="btn btn-primary">
              Upload a syllabus
            </Link>
            <button type="button" className="btn" onClick={() => setSelectedDeadline(draft(today))}>
              <IconPlus />
              Add an event
            </button>
          </div>
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
          <section className="panel cal-panel" aria-label="Month">
            {/* The label on the grid is hidden from screen readers (FullCalendar's week labels are), so say it here */}
            {hell && <p className="sr-only">{`${hellLabel}: ${weekLabel(hell.start)}`}</p>}
            <FullCalendar
              plugins={[themePlugin, dayGridPlugin, interactionPlugin]}
              firstDay={WEEK_START}
              initialView="dayGridMonth"
              initialDate={isPhone ? gridDate : undefined}
              // Phones: tapping a day lists its deadlines under the grid (the bars are too small to aim at).
              // Desktop: clicking a day (not one of its deadlines) adds something on that day.
              dateClick={(info) =>
                isPhone ? setPickedDay(toISO(info.date)) : setSelectedDeadline(draft(toISO(info.date)))
              }
              events={events}
              fixedWeekCount={false}
              height="auto"
              borderless
              eventClick={(info) => setSelectedDeadline(info.event.extendedProps.deadline)}
              eventOrder="timeOrder,title"
              // Only the heaviest week's row shows its label, in the spot FullCalendar keeps for week numbers.
              // Phones only get the tint: their cells are too narrow for it.
              weekNumbers={showHellLabel}
              inlineWeekNumberClass={(info) => (isHellStart(info.date) ? "cal-busy" : "cal-busy-none")}
              inlineWeekNumberContent={(info) =>
                isHellStart(info.date) ? <span className="cal-busy-text">{hellLabel}</span> : null
              }
              dayCellTopClass={(arg) => (showHellLabel && inHellWeek(toISO(arg.date)) ? "cal-busy-top" : "")}
              eventClass="cal-event"
              dayCellClass={(arg) => {
                const date = toISO(arg.date);
                return [
                  arg.isToday && "cal-today",
                  inHellWeek(date) && "cal-hell",
                  date === hoveredDate && "cal-hover",
                  isPhone && date === pickedDay && "cal-picked",
                  !isPhone && "cal-addable",
                ]
                  .filter(Boolean)
                  .join(" ");
              }}
              eventContent={(info) => {
                const deadline: Deadline = info.event.extendedProps.deadline;
                // A tinted bar in the course color; done ones are grey and crossed out (.ev-pill in index.css)
                return (
                  <span className={`ev-pill${deadline.done ? " is-done" : ""}`} style={courseVar(courseColors[courseLabel(deadline)])}>
                    <span className="ev-text">
                      {deadline.time && <span className="ev-time">{shortTimeLabel(deadline.time)}</span>}
                      {info.event.title}
                    </span>
                  </span>
                );
              }}
              // Hide done changes how the calendar looks, so it sits with the calendar's own controls (#79)
              toolbarElements={{
                hideDone: () => (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={filters.hideDone}
                    className="cal-switch"
                    // From the latest filters: FullCalendar may still hold an older copy of this button
                    onClick={() => setFilters((f) => ({ ...f, hideDone: !f.hideDone }))}
                  >
                    <span className="cal-switch-track" aria-hidden="true" />
                    Hide done
                  </button>
                ),
              }}
              headerToolbar={{ start: "title", center: "", end: "hideDone today prev,next" }}
            />
          </section>
          {hasDeadlines && !isPhone && (
            <CalendarSidebar
              deadlines={shown}
              courseColors={courseColors}
              today={today}
              onOpen={setSelectedDeadline}
              onToggleDone={toggleDone}
              onHoverDate={setHoveredDate}
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
                  color={courseColors[courseLabel(d)]}
                  onOpen={setSelectedDeadline}
                  onToggleDone={toggleDone}
                />
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-lg btn-block" onClick={() => setSelectedDeadline(draft(pickedDay))}>
            <IconPlus />
            Add on this day
          </button>
        </section>
      )}
      {selectedDeadline && !selectedDeadline.id && (
        <DeadlineModal
          key={`new-${selectedDeadline.date}`}
          deadline={selectedDeadline}
          courses={myCourses}
          onClose={() => setSelectedDeadline(null)}
          onSave={async (changes) => {
            const created = await addDeadline({ ...selectedDeadline, ...changes });
            setDeadlines((current) => [...(current ?? []), created].sort(bySchedule));
            showCourseOf(created);
            setSelectedDeadline(null);
            // Phones: show the day it went on
            if (isPhone && view === "month") setPickedDay(created.date);
          }}
        />
      )}
      {selectedDeadline?.id && (
        <DeadlineModal
          // A fresh popup for each deadline, so its edits start from that deadline
          key={selectedDeadline.id}
          deadline={selectedDeadline}
          courses={myCourses}
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
          // Dropped a course: delete all its dates at once instead of one by one
          courseDates={selectedDeadline.course === null ? 0 : (deadlines ?? []).filter((d) => d.course === selectedDeadline.course).length}
          onDeleteCourse={async () => {
            const course = selectedDeadline.course;
            if (course === null) return;
            await deleteCourse(course);
            setDeadlines((current) => current?.filter((d) => d.course !== course) ?? null);
            setSelectedDeadline(null);
          }}
          onSave={async (changes) => {
            await updateDeadline(selectedDeadline.id!, changes);
            replaceDeadline({ ...selectedDeadline, ...changes });
            showCourseOf({ ...selectedDeadline, ...changes });
            setSelectedDeadline(null);
          }}
        />
      )}
    </main>
  );
}

export default Calendar;
