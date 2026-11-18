-- Stop the same deadline being saved twice, e.g. when a syllabus is uploaded again (issue #64).
-- saveDeadlines in frontend/src/lib/deadlines.ts relies on this constraint to skip duplicates.

-- Remove existing duplicates first, or adding the constraint fails.
-- Keep one row per (user_id, course, title, date): one marked done if there is one, otherwise the oldest.
DELETE FROM public.deadlines
WHERE id IN (
    SELECT id
    FROM (
        SELECT
            id,
            row_number() OVER (
                PARTITION BY user_id, course, title, date
                ORDER BY done DESC, created_at, id
            ) AS rn
        FROM public.deadlines
    ) ranked
    WHERE rn > 1
);

ALTER TABLE public.deadlines
    ADD CONSTRAINT deadlines_user_course_title_date_key
    UNIQUE (user_id, course, title, date);
