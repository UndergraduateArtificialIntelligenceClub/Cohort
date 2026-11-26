import { useRef, useState, type CSSProperties } from "react";
import ColorPopover from "./ColorPopover";
import { PERSONAL_LABEL } from "../lib/courses";
import type { ColorChoices } from "../lib/courseColors";
import { filterSummary, toggleCourse, type Filters } from "../lib/filters";

// The course chips under the Calendar title (#79). Each chip is two buttons: its color dot opens the color
// picker, and its name shows or hides that course. A hidden course's chip dims. When anything is filtered,
// a line says so, so nobody thinks deadlines went missing. The rules live in lib/filters.ts.
type Props = {
  courseColors: Record<string, string>; // every course, filtered or not, keyed by courseLabel
  colorChoices: ColorChoices; // course -> palette position (no Personal: it's always grey)
  filters: Filters;
  onChange: (update: (filters: Filters) => Filters) => void;
  onPickColor: (course: string, color: number) => void;
};

const courseVar = (color: string) => ({ "--c": color }) as CSSProperties;

function CalendarFilters({ courseColors, colorChoices, filters, onChange, onPickColor }: Props) {
  // The course whose color picker is open
  const [picking, setPicking] = useState<string | null>(null);
  const dots = useRef<Record<string, HTMLButtonElement | null>>({});
  const summary = filterSummary(filters, Object.keys(courseColors));

  function closePicker(refocus: boolean) {
    if (refocus && picking) dots.current[picking]?.focus();
    setPicking(null);
  }

  return (
    <div className="cal-filters">
      <ul className="chips" aria-label="Courses">
        {Object.entries(courseColors).map(([course, color]) => {
          const shown = !filters.hidden.includes(course);
          return (
            <li key={course} className={`chip cal-course${shown ? "" : " is-hidden"}`} style={courseVar(color)}>
              {course === PERSONAL_LABEL ? (
                // Personal is always grey, so its dot is just a dot
                <span className="cal-course-dot">
                  <i className="dot" />
                </span>
              ) : (
                <button
                  ref={(el) => {
                    dots.current[course] = el;
                  }}
                  type="button"
                  className="cal-course-dot"
                  title="Change color"
                  aria-label={`Change the color for ${course}`}
                  aria-haspopup="dialog"
                  aria-expanded={picking === course}
                  onClick={() => setPicking(picking === course ? null : course)}
                >
                  <i className="dot" />
                </button>
              )}
              <button
                type="button"
                className="cal-course-name"
                aria-pressed={shown}
                title={shown ? `Hide ${course}` : `Show ${course}`}
                onClick={() => onChange((f) => toggleCourse(f, course))}
              >
                {course}
              </button>
              {picking === course && (
                <ColorPopover
                  course={course}
                  current={colorChoices[course]}
                  onPick={(c) => {
                    onPickColor(course, c);
                    closePicker(true);
                  }}
                  onClose={closePicker}
                />
              )}
            </li>
          );
        })}
      </ul>
      {summary && (
        <p className="cal-filter-note" role="status">
          {summary} ·{" "}
          <button type="button" className="cal-filter-clear" onClick={() => onChange((f) => ({ ...f, hidden: [] }))}>
            Show all
          </button>
        </p>
      )}
    </div>
  );
}

export default CalendarFilters;
