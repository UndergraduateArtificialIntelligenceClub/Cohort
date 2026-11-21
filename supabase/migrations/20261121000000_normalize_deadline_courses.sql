-- Store deadline course names normalized ("Stat  151 " -> "STAT 151"), the same rule as normalizeCourse in
-- frontend/src/lib/courses.ts and the CHECK on shared_syllabi.course.
-- saveDeadlines and updateDeadline (frontend/src/lib/deadlines.ts) normalize new and edited rows; this fixes old ones.
-- Without it, "Stat 151" from your own upload and "STAT 151" from the course library are two courses,
-- so the duplicate check in saveDeadlines (#64) misses them and the calendar gives them two colors.

-- Rows that only differ by course spelling would break the (user_id, course, title, date) unique constraint
-- once normalized, so remove those duplicates first.
-- Keep one per group: one marked done if there is one, otherwise the oldest (same rule as 20261118000000_unique_deadlines.sql).
DELETE FROM public.deadlines
WHERE id IN (
    SELECT id
    FROM (
        SELECT
            id,
            row_number() OVER (
                PARTITION BY user_id, upper(regexp_replace(btrim(course), '\s+', ' ', 'g')), title, date
                ORDER BY done DESC, created_at, id
            ) AS rn
        FROM public.deadlines
    ) ranked
    WHERE rn > 1
);

UPDATE public.deadlines
SET course = upper(regexp_replace(btrim(course), '\s+', ' ', 'g'))
WHERE course IS DISTINCT FROM upper(regexp_replace(btrim(course), '\s+', ' ', 'g'));
