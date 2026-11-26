import { supabase } from "./supabase";
import { isPersonal, PERSONAL_LABEL } from "./courses";
import type { Deadline } from "../types";

// Each course's color (supabase/migrations/20261126120000_course_colors.sql). No UI here; Calendar.tsx calls these.
// A saved color is a position in PALETTE, never a hex value, so the palette can change without touching saved rows.

// The 12 course colors, in the order new courses get them (the most distinct first). Built from the
// Okabe-Ito and Paul Tol colorblind-safe palettes: they differ in lightness as well as hue, so every pair stays
// apart for red-green and blue-yellow colorblindness too (checked by simulating each).
// Course names are always written next to their color anyway, so color is never the only clue.
// Keep the length in sync with the CHECK in supabase/migrations/20261126120000_course_colors.sql.
export const PALETTE = [
  { name: "Blue", hex: "#0072b2" },
  { name: "Vermillion", hex: "#d55e00" },
  { name: "Green", hex: "#117733" },
  { name: "Gold", hex: "#e69f00" },
  { name: "Purple", hex: "#aa4499" },
  { name: "Sky", hex: "#56b4e9" },
  { name: "Wine", hex: "#882255" },
  { name: "Teal", hex: "#44aa99" },
  { name: "Rose", hex: "#cc6677" },
  { name: "Indigo", hex: "#332288" },
  { name: "Olive", hex: "#999933" },
  { name: "Brown", hex: "#8c510a" },
];

// Personal items are all one warm grey, so they never look like another course. Not changeable.
export const PERSONAL_COLOR = "#8a8378";

// Course -> position in PALETTE
export type ColorChoices = Record<string, number>;

// The logged in user's saved colors
export async function loadCourseColors(): Promise<ColorChoices> {
  const { data, error } = await supabase.from("course_colors").select("course, color");
  if (error) throw new Error(`Couldn't load course colors: ${error.message}`);
  return Object.fromEntries(data.map((row) => [row.course, row.color]));
}

// Save colors the app picked for new courses. A color already saved (say, picked on another device a moment ago) wins.
export async function rememberCourseColors(choices: ColorChoices): Promise<void> {
  const rows = Object.entries(choices).map(([course, color]) => ({ course, color }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("course_colors").upsert(rows, { onConflict: "user_id,course", ignoreDuplicates: true });
  if (error) throw new Error(`Couldn't save course colors: ${error.message}`);
}

// The student picked a color for a course
export async function setCourseColor(course: string, color: number): Promise<void> {
  const { error } = await supabase.from("course_colors").upsert({ course, color }, { onConflict: "user_id,course" });
  if (error) throw new Error(`Couldn't save the color: ${error.message}`);
}

// Every course on the calendar with its color: saved ones as saved, and new ones given the least used color
// (the first one on a tie), so with nothing saved courses go down the palette in alphabetical order.
// `added` is the new ones, for rememberCourseColors.
export function assignColors(deadlines: Deadline[], saved: ColorChoices): { choices: ColorChoices; added: ColorChoices } {
  const courses = [...new Set(deadlines.flatMap((d) => (d.course === null ? [] : [d.course])))].sort();
  const choices: ColorChoices = {};
  const uses = PALETTE.map(() => 0);
  for (const course of courses) {
    if (course in saved) {
      choices[course] = saved[course];
      uses[saved[course]] += 1;
    }
  }
  const added: ColorChoices = {};
  for (const course of courses) {
    if (course in choices) continue;
    const color = uses.indexOf(Math.min(...uses));
    choices[course] = added[course] = color;
    uses[color] += 1;
  }
  return { choices, added };
}

// Course -> hex for drawing, keyed by courseLabel so personal items are under "Personal" (listed last)
export function colorMap(deadlines: Deadline[], choices: ColorChoices): Record<string, string> {
  const colors: Record<string, string> = Object.fromEntries(
    Object.entries(choices)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([course, color]) => [course, PALETTE[color]?.hex ?? PALETTE[0].hex])
  );
  if (deadlines.some(isPersonal)) colors[PERSONAL_LABEL] = PERSONAL_COLOR;
  return colors;
}
