-- Course codes: "cmput174" and "CMPUT 174" are now the same course.
-- Run after 20261126120000_course_colors.sql. Safe to run twice.
--
-- Course names were already stored trimmed, upper case and with single spaces. This adds one rule: a space
-- where the subject's letters first meet the number ("cmput174" -> "CMPUT 174", "math100 a1" -> "MATH 100 A1").
-- Only that first place, so codes like "INT D 137B" keep their own spelling. Without it, one student's
-- "CMPUT174" and another's "CMPUT 174" were two courses: two library entries, no study buddy match,
-- two colors on one calendar.
--
-- The rule now lives in one function, public.normalize_course(), used by every CHECK below and by
-- find_study_buddy. Keep it the same as normalizeCourse() in frontend/src/lib/courses.ts.
-- Changing it later? A CHECK isn't re-run on rows already saved, so write a migration like this one that
-- re-normalizes them.
--
-- This also adds the CHECK that deadlines.course is stored normalized. The frontend already normalizes every
-- save; this makes the database refuse anything else, so the unique key catches every duplicate (#64).
-- Deploy the frontend that has the new rule before running this, or an older page saving "cmput174" is refused.

CREATE OR REPLACE FUNCTION public.normalize_course(p_course TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT regexp_replace(
        upper(regexp_replace(btrim(p_course), '\s+', ' ', 'g')),
        '^([^0-9]*[A-Z])([0-9])', '\1 \2'
    );
$$;

-- ---------- Existing rows ----------
-- Rows that only differ by spacing would collide on each table's unique key once normalized, so drop the
-- extra copies first, keeping the same one earlier migrations kept.

-- Deadlines: one marked done if there is one, otherwise the oldest (as in 20261121000000_normalize_deadline_courses.sql)
DELETE FROM public.deadlines
WHERE id IN (
    SELECT id
    FROM (
        SELECT
            id,
            row_number() OVER (
                PARTITION BY user_id, public.normalize_course(course), title, date
                ORDER BY done DESC, created_at, id
            ) AS rn
        FROM public.deadlines
        WHERE course IS NOT NULL
    ) ranked
    WHERE rn > 1
);

UPDATE public.deadlines
SET course = public.normalize_course(course)
WHERE course IS DISTINCT FROM public.normalize_course(course);

-- Shared syllabi: an uploader's newest copy of the course, as if they had uploaded it again
DELETE FROM public.shared_syllabi
WHERE id IN (
    SELECT id
    FROM (
        SELECT
            id,
            row_number() OVER (
                PARTITION BY uploaded_by, public.normalize_course(course)
                ORDER BY updated_at DESC, id
            ) AS rn
        FROM public.shared_syllabi
    ) ranked
    WHERE rn > 1
);

UPDATE public.shared_syllabi
SET course = public.normalize_course(course)
WHERE course IS DISTINCT FROM public.normalize_course(course);

-- Study buddy requests: the one that's been waiting longest, so nobody loses their place in line
DELETE FROM public.study_requests r
USING public.study_requests older
WHERE r.user_id = older.user_id
  AND r.course <> older.course
  AND public.normalize_course(r.course) = public.normalize_course(older.course)
  AND (older.created_at, older.course) < (r.created_at, r.course);

UPDATE public.study_requests
SET course = public.normalize_course(course)
WHERE course IS DISTINCT FROM public.normalize_course(course);

-- Matches have no unique key on course; renaming keeps "already matched in this course" working
UPDATE public.study_matches
SET course = public.normalize_course(course)
WHERE course IS DISTINCT FROM public.normalize_course(course);

-- Course colors: the color saved under the spelling that's already right, otherwise either one
DELETE FROM public.course_colors cc
USING public.course_colors other
WHERE cc.user_id = other.user_id
  AND cc.course <> other.course
  AND public.normalize_course(cc.course) = public.normalize_course(other.course)
  AND (other.course = public.normalize_course(other.course), other.course) > (cc.course = public.normalize_course(cc.course), cc.course);

UPDATE public.course_colors
SET course = public.normalize_course(course)
WHERE course IS DISTINCT FROM public.normalize_course(course);

-- ---------- CHECKs ----------
-- The old CHECKs were written inline, so Postgres named them <table>_course_check
ALTER TABLE public.shared_syllabi DROP CONSTRAINT IF EXISTS shared_syllabi_course_check;
ALTER TABLE public.shared_syllabi DROP CONSTRAINT IF EXISTS shared_syllabi_course_normalized;
ALTER TABLE public.shared_syllabi ADD CONSTRAINT shared_syllabi_course_normalized CHECK (
    course = public.normalize_course(course) AND char_length(course) BETWEEN 1 AND 50
);

ALTER TABLE public.study_requests DROP CONSTRAINT IF EXISTS study_requests_course_check;
ALTER TABLE public.study_requests DROP CONSTRAINT IF EXISTS study_requests_course_normalized;
ALTER TABLE public.study_requests ADD CONSTRAINT study_requests_course_normalized CHECK (
    course = public.normalize_course(course) AND char_length(course) BETWEEN 1 AND 50
);

ALTER TABLE public.course_colors DROP CONSTRAINT IF EXISTS course_colors_course_check;
ALTER TABLE public.course_colors DROP CONSTRAINT IF EXISTS course_colors_course_normalized;
ALTER TABLE public.course_colors ADD CONSTRAINT course_colors_course_normalized CHECK (
    course = public.normalize_course(course) AND char_length(course) BETWEEN 1 AND 50
);

-- Personal items have no course (course IS NULL), which this allows
ALTER TABLE public.deadlines DROP CONSTRAINT IF EXISTS deadlines_course_normalized;
ALTER TABLE public.deadlines ADD CONSTRAINT deadlines_course_normalized CHECK (
    course = public.normalize_course(course)
);

-- ---------- Study buddy ----------
-- Same as in 20261119120000_study_buddy.sql, but normalizing with normalize_course().
-- CREATE OR REPLACE keeps the function's existing grants.
-- "Find a buddy" button. Returns the new (or existing) match, or null if you're now waiting.
CREATE OR REPLACE FUNCTION public.find_study_buddy(p_course TEXT)
RETURNS public.study_matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    me UUID := auth.uid();
    c TEXT := coalesce(public.normalize_course(p_course), '');
    today DATE := public.study_buddy_today();
    other UUID;
    m public.study_matches;
BEGIN
    IF me IS NULL THEN
        RAISE EXCEPTION 'Please log in first.';
    END IF;
    IF c = '' OR char_length(c) > 50 THEN
        RAISE EXCEPTION 'Pick a course first.';
    END IF;

    -- Only courses you're in: you need an upcoming deadline in it.
    -- deadlines.course is stored normalized (the CHECK above), so it can be compared directly.
    IF NOT EXISTS (
        SELECT 1 FROM public.deadlines d
        WHERE d.user_id = me
          AND d.date >= today
          AND d.course = c
    ) THEN
        RAISE EXCEPTION 'You can only find a buddy in a course with an upcoming deadline on your calendar.';
    END IF;

    -- One matcher per course at a time, so two people clicking together can't both miss each other
    PERFORM pg_advisory_xact_lock(hashtext('study_buddy:' || c));

    -- Waiting more than 2 weeks: the person has probably stopped checking, so drop them
    DELETE FROM public.study_requests WHERE created_at < now() - INTERVAL '14 days';

    -- Already have an active buddy in this course? Hand that back
    SELECT * INTO m FROM public.study_matches
    WHERE course = c AND ended_at IS NULL AND me IN (user_a, user_b)
    LIMIT 1;
    IF FOUND THEN
        RETURN m;
    END IF;

    -- Longest-waiting person in the course who is still in it, skipping anyone you've been
    -- matched with in this course before and anyone either of you blocked
    SELECT r.user_id INTO other
    FROM public.study_requests r
    WHERE r.course = c
      AND r.user_id <> me
      AND NOT EXISTS (
          SELECT 1 FROM public.study_matches old
          WHERE old.course = c
            AND ((old.user_a = me AND old.user_b = r.user_id) OR (old.user_a = r.user_id AND old.user_b = me))
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.study_blocks b
          WHERE (b.blocker = me AND b.blocked = r.user_id) OR (b.blocker = r.user_id AND b.blocked = me)
      )
      AND EXISTS (
          SELECT 1 FROM public.deadlines d
          WHERE d.user_id = r.user_id
            AND d.date >= today
            AND d.course = c
      )
      -- They might already have a buddy here from an earlier request
      AND NOT EXISTS (
          SELECT 1 FROM public.study_matches cur
          WHERE cur.course = c AND cur.ended_at IS NULL AND r.user_id IN (cur.user_a, cur.user_b)
      )
    ORDER BY r.created_at
    LIMIT 1;

    IF other IS NULL THEN
        INSERT INTO public.study_requests (user_id, course) VALUES (me, c)
        ON CONFLICT DO NOTHING;
        RETURN NULL;
    END IF;

    DELETE FROM public.study_requests WHERE course = c AND user_id IN (me, other);

    -- I opened it just now, so it's only unread for the other person
    INSERT INTO public.study_matches (course, user_a, user_b, user_a_name, user_b_name, user_a_read_at)
    SELECT c, a.id, b.id,
        public.study_buddy_first_name(a.raw_user_meta_data),
        public.study_buddy_first_name(b.raw_user_meta_data),
        now()
    FROM auth.users a, auth.users b
    WHERE a.id = me AND b.id = other
    RETURNING * INTO m;

    RETURN m;
END;
$$;
