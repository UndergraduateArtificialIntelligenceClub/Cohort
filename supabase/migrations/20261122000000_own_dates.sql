-- Add your own dates from the calendar: school ones (a quiz announced in class) and personal ones
-- (a dentist appointment, a shift at work). Run after 20261121120000_notifications.sql.
--
-- What changes on public.deadlines:
--   source_text  Can be null. A date you add yourself has no syllabus sentence behind it.
--   course       Can be null, and is null exactly for personal items. Personal items are never stored under a
--                made-up course like "PERSONAL", so nothing keyed on course can pick them up:
--                  - Study buddy (find_study_buddy) compares course to the course you picked. NULL never equals
--                    anything, so a personal item can't let you, or anyone, into a course's queue.
--                  - The course library's "Added" check (loadMyCourses) and sharing (shareDeadlines) skip them.
--                  - The (user_id, course, title, date) unique key treats NULL courses as all different,
--                    so it doesn't apply to personal items (adding a personal item twice is the person's call).
--   category     Adds 'personal'. School items keep the parser's categories.
--   personal     New, read-only: true when course is null. Worked out by the database, so it can never
--                disagree with course. Use it in SQL wherever personal items need leaving out.
--   weight       Always null for personal items. They aren't part of a grade.
--
-- Notifications: personal items get the evening-before reminder like any deadline, but never the 3-day
-- heads-up. That's on purpose: the heads-up is for exams and big assignments, so it only looks at school items.

ALTER TABLE public.deadlines ALTER COLUMN source_text DROP NOT NULL;
ALTER TABLE public.deadlines ALTER COLUMN course DROP NOT NULL;

ALTER TABLE public.deadlines ADD COLUMN IF NOT EXISTS personal BOOLEAN GENERATED ALWAYS AS (course IS NULL) STORED;

-- Replace the category CHECK from 20261026065713_create_deadlines.sql. Postgres named it itself, so find it
-- by what it checks rather than by name (this also drops the new ones below if the file is run again).
DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'public.deadlines'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%category%'
    LOOP
        EXECUTE format('ALTER TABLE public.deadlines DROP CONSTRAINT %I', c.conname);
    END LOOP;
END $$;
ALTER TABLE public.deadlines DROP CONSTRAINT IF EXISTS deadlines_personal_no_weight;

ALTER TABLE public.deadlines ADD CONSTRAINT deadlines_category_check CHECK (
    category IN ('assignment', 'lab', 'quiz', 'midterm', 'final', 'other', 'personal')
    -- Personal items, and only personal items, have no course
    AND (category = 'personal') = (course IS NULL)
);

ALTER TABLE public.deadlines ADD CONSTRAINT deadlines_personal_no_weight CHECK (course IS NOT NULL OR weight IS NULL);

-- Same as in 20261121120000_notifications.sql, except personal items never get the 3-day heads-up.
-- (They have no weight and aren't exams, so the old rule already skipped them; this makes it explicit
-- so a later change to the heads-up rule can't start sending them by accident.)
CREATE OR REPLACE FUNCTION public.pending_deadline_reminders(p_now TIMESTAMPTZ DEFAULT now())
RETURNS TABLE (
    user_id UUID, deadline_id UUID, kind TEXT, course TEXT, title TEXT, due DATE, category TEXT, weight DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT d.user_id, d.id, k.kind, d.course, d.title, d.date, d.category, d.weight
    FROM public.deadlines d
    CROSS JOIN (VALUES ('day_before', 1), ('heads_up', 3)) AS k (kind, days_ahead)
    WHERE extract(HOUR FROM p_now AT TIME ZONE 'America/Edmonton') BETWEEN 19 AND 22
      AND d.date = (p_now AT TIME ZONE 'America/Edmonton')::date + k.days_ahead
      AND NOT d.done
      -- Heads-ups are only for school exams and anything worth 15% or more. Personal items only get the evening before.
      AND (k.kind = 'day_before' OR (NOT d.personal AND (d.category IN ('midterm', 'final') OR d.weight >= 15)))
      AND EXISTS (SELECT 1 FROM public.push_subscriptions p WHERE p.user_id = d.user_id)
      AND coalesce((SELECT s.deadlines FROM public.notification_settings s WHERE s.user_id = d.user_id), TRUE)
      AND NOT EXISTS (
          SELECT 1 FROM public.deadline_reminders_sent r
          WHERE r.deadline_id = d.id AND r.kind = k.kind AND r.due_date = d.date
      );
$$;

REVOKE EXECUTE ON FUNCTION public.pending_deadline_reminders(TIMESTAMPTZ) FROM public, anon, authenticated;
