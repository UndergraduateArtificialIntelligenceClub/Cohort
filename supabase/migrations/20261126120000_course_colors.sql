-- Course colors: each person's color for each of their courses, so colors stay put and can be changed.
-- Run after 20261124120000_due_times.sql. Safe to run twice.
--
-- Before this, the calendar handed out colors in alphabetical order, so adding or deleting a course
-- changed the color of every course after it. Now the app saves a course's color the first time it
-- shows up, and the student can pick another by clicking a course's color dot above the calendar.
--
-- color is a position in the app's 12-color palette (PALETTE in frontend/src/lib/courseColors.ts), not a
-- hex value, so the palette can be retuned without touching saved rows and nobody can save an unreadable
-- color. Rows stay when a course is deleted, so adding it back brings its color back.
-- Personal items have no course and are always grey, so they never have a row here.

CREATE TABLE IF NOT EXISTS public.course_colors (
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    -- Stored normalized ("cmput  174" -> "CMPUT 174"), same rule as normalizeCourse in frontend/src/lib/courses.ts
    course TEXT NOT NULL CHECK (
        course = upper(regexp_replace(btrim(course), '\s+', ' ', 'g'))
        AND char_length(course) BETWEEN 1 AND 50
    ),
    color SMALLINT NOT NULL CHECK (color BETWEEN 0 AND 11),
    PRIMARY KEY (user_id, course)
);

ALTER TABLE public.course_colors ENABLE ROW LEVEL SECURITY;

-- Only your own colors: nobody else ever sees which courses you have
DROP POLICY IF EXISTS "Users can read their own course colors" ON public.course_colors;
CREATE POLICY "Users can read their own course colors"
ON public.course_colors
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can add their own course colors" ON public.course_colors;
CREATE POLICY "Users can add their own course colors"
ON public.course_colors
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can change their own course colors" ON public.course_colors;
CREATE POLICY "Users can change their own course colors"
ON public.course_colors
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.course_colors FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.course_colors TO authenticated;
