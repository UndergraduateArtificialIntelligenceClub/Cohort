-- Check the real deadlines table before and after running
-- supabase/migrations/20261118000000_unique_deadlines.sql (issue #64). Read only.
--
-- 1. Run this file and note the numbers.
-- 2. Run the migration file itself (SQL Editor, or `supabase db push`).
-- 3. Run this file again. After a correct migration:
--      total_rows        = distinct_deadlines from step 1 (only duplicates were removed)
--      duplicate_rows    = 0
--      distinct_deadlines and users_with_deadlines are unchanged from step 1
--      constraint_exists = true

SELECT
    count(*)                                              AS total_rows,
    count(DISTINCT (user_id, course, title, date))        AS distinct_deadlines,
    count(*) - count(DISTINCT (user_id, course, title, date)) AS duplicate_rows,
    count(DISTINCT user_id)                               AS users_with_deadlines,
    count(*) FILTER (WHERE done)                          AS done_rows,
    EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.deadlines'::regclass
          AND conname = 'deadlines_user_course_title_date_key'
    )                                                     AS constraint_exists
FROM public.deadlines;
