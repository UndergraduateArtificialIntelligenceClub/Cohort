-- Tests for issue #64: supabase/migrations/20261118000000_unique_deadlines.sql
-- and the upsert in saveDeadlines (frontend/src/lib/deadlines.ts).
--
-- How to run: paste the whole file into Supabase → SQL Editor and run it,
-- or `psql "$DATABASE_URL" -f supabase/scripts/test_unique_deadlines.sql`.
--
-- It never writes to public.deadlines. It builds a copy of that table in a separate
-- test_64 schema (same columns, checks, foreign key, row-level security), fills it with
-- test cases plus two copies of the real deadlines, and runs the migration on the copy.
-- Everything is in one transaction that is rolled back at the end, so nothing is kept:
-- not the test_64 schema, not the two test users added to auth.users.
-- Run the whole file at once; running only part of it may skip the ROLLBACK.
--
-- Result: if every check passes, the last result is a row "ALL TESTS PASSED"
-- (psql also prints a NOTICE per check). If a check fails, it stops with an error starting with "FAIL:".

BEGIN;

-- ===== Test copy of the deadlines table =====
CREATE SCHEMA test_64;

-- Same columns, defaults, checks and primary key as the real table
CREATE TABLE test_64.deadlines (LIKE public.deadlines INCLUDING ALL);
-- In case the migration was already applied to the real table
ALTER TABLE test_64.deadlines DROP CONSTRAINT IF EXISTS deadlines_user_course_title_date_key;
-- LIKE doesn't copy foreign keys or row-level security, so add them as in 20261026065713_create_deadlines.sql
ALTER TABLE test_64.deadlines
    ADD CONSTRAINT fk_deadlines_user FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE test_64.deadlines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own deadlines" ON test_64.deadlines
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can insert their own deadlines" ON test_64.deadlines
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can update their own deadlines" ON test_64.deadlines
    FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can delete their own deadlines" ON test_64.deadlines
    FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
-- Same access the API role has on public tables
GRANT USAGE ON SCHEMA test_64 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON test_64.deadlines TO authenticated;


-- ===== Seed data =====
-- Two test users. Deadlines reference auth.users, so they have to exist.
INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-4000-8000-0000000000a1', 'test-64-a@ualberta.ca'),
    ('00000000-0000-4000-8000-0000000000b1', 'test-64-b@ualberta.ca');

-- Hand-written cases, including duplicates the old insert would have created
INSERT INTO test_64.deadlines (id, user_id, course, title, date, category, source_text, weight, done, created_at) VALUES
    -- A: same deadline 3 times. The newer one marked done should be kept, not the oldest.
    ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-0000000000a1', 'CMPUT 174', 'Assignment 1', '2026-09-20', 'assignment', 's', 10, false, '2026-09-01 10:00+00'),
    ('00000000-0000-4000-8000-00000000d002', '00000000-0000-4000-8000-0000000000a1', 'CMPUT 174', 'Assignment 1', '2026-09-20', 'assignment', 's', 10, true,  '2026-09-02 10:00+00'),
    ('00000000-0000-4000-8000-00000000d003', '00000000-0000-4000-8000-0000000000a1', 'CMPUT 174', 'Assignment 1', '2026-09-20', 'assignment', 's', 10, false, '2026-09-03 10:00+00'),
    -- A: duplicate where neither is done. The oldest should be kept.
    ('00000000-0000-4000-8000-00000000d004', '00000000-0000-4000-8000-0000000000a1', 'CMPUT 174', 'Midterm', '2026-10-15', 'midterm', 's', 25, false, '2026-09-01 10:00+00'),
    ('00000000-0000-4000-8000-00000000d00f', '00000000-0000-4000-8000-0000000000a1', 'CMPUT 174', 'Midterm', '2026-10-15', 'midterm', 's', 25, false, '2026-09-05 10:00+00'),
    -- A: same title on different dates (weekly labs) is NOT a duplicate
    ('00000000-0000-4000-8000-00000000d005', '00000000-0000-4000-8000-0000000000a1', 'CMPUT 174', 'Lab', '2026-09-10', 'lab', 's', null, false, '2026-09-01 10:00+00'),
    ('00000000-0000-4000-8000-00000000d006', '00000000-0000-4000-8000-0000000000a1', 'CMPUT 174', 'Lab', '2026-09-17', 'lab', 's', null, false, '2026-09-01 10:00+00'),
    -- A: titles that differ only by case/whitespace are NOT treated as duplicates (known limitation)
    ('00000000-0000-4000-8000-00000000d007', '00000000-0000-4000-8000-0000000000a1', 'CMPUT 174', 'Assignment 1 ', '2026-09-20', 'assignment', 's', null, false, '2026-09-01 10:00+00'),
    ('00000000-0000-4000-8000-00000000d008', '00000000-0000-4000-8000-0000000000a1', 'CMPUT 174', 'assignment 1', '2026-09-20', 'assignment', 's', null, false, '2026-09-01 10:00+00'),
    -- A: same title and date in another course is NOT a duplicate
    ('00000000-0000-4000-8000-00000000d009', '00000000-0000-4000-8000-0000000000a1', 'MATH 125', 'Assignment 1', '2026-09-20', 'assignment', 's', null, false, '2026-09-01 10:00+00'),
    -- A: exact tie on done and created_at. The smaller id should be kept, so the result is predictable.
    ('00000000-0000-4000-8000-00000000d010', '00000000-0000-4000-8000-0000000000a1', 'CMPUT 174', 'Quiz 0', '2026-09-12', 'quiz', 's', null, false, '2026-09-01 10:00+00'),
    ('00000000-0000-4000-8000-00000000d011', '00000000-0000-4000-8000-0000000000a1', 'CMPUT 174', 'Quiz 0', '2026-09-12', 'quiz', 's', null, false, '2026-09-01 10:00+00'),
    -- B: the same deadline as A's must survive (duplicates are per user)
    ('00000000-0000-4000-8000-00000000d020', '00000000-0000-4000-8000-0000000000b1', 'CMPUT 174', 'Assignment 1', '2026-09-20', 'assignment', 's', 10, false, '2026-09-01 10:00+00'),
    -- B: their own duplicate is removed too
    ('00000000-0000-4000-8000-00000000d021', '00000000-0000-4000-8000-0000000000b1', 'CMPUT 174', 'Final', '2026-12-15', 'final', 's', 40, false, '2026-09-01 10:00+00'),
    ('00000000-0000-4000-8000-00000000d022', '00000000-0000-4000-8000-0000000000b1', 'CMPUT 174', 'Final', '2026-12-15', 'final', 's', 40, false, '2026-09-02 10:00+00');

-- The real deadlines, then a second copy of each as if every user had uploaded their syllabus twice.
-- The copies are newer and not done, so the migration should keep the originals.
CREATE TEMP TABLE real_before ON COMMIT DROP AS
    SELECT id, user_id, course, title, date FROM public.deadlines;
INSERT INTO test_64.deadlines SELECT * FROM public.deadlines;
INSERT INTO test_64.deadlines (id, course, title, date, category, source_text, weight, done, user_id, created_at)
    SELECT gen_random_uuid(), course, title, date, category, source_text, weight, false, user_id, created_at + interval '1 day'
    FROM public.deadlines;


-- ===== Migration body. Keep in sync with supabase/migrations/20261118000000_unique_deadlines.sql =====
-- (only the table name differs: test_64.deadlines instead of public.deadlines)
DELETE FROM test_64.deadlines
WHERE id IN (
    SELECT id
    FROM (
        SELECT
            id,
            row_number() OVER (
                PARTITION BY user_id, course, title, date
                ORDER BY done DESC, created_at, id
            ) AS rn
        FROM test_64.deadlines
    ) ranked
    WHERE rn > 1
);

ALTER TABLE test_64.deadlines
    ADD CONSTRAINT deadlines_user_course_title_date_key
    UNIQUE (user_id, course, title, date);
-- ===== End of migration body =====


-- 1. Cleanup of existing duplicates
DO $$
DECLARE
    a uuid := '00000000-0000-4000-8000-0000000000a1';
    b uuid := '00000000-0000-4000-8000-0000000000b1';
    kept uuid[];
    expected int;
    actual int;
BEGIN
    SELECT array_agg(id) INTO kept FROM test_64.deadlines WHERE user_id = a AND course = 'CMPUT 174' AND title = 'Assignment 1';
    IF kept IS DISTINCT FROM ARRAY['00000000-0000-4000-8000-00000000d002'::uuid] THEN
        RAISE EXCEPTION 'FAIL: expected only the done copy (d002) of Assignment 1 to be kept, got %', kept;
    END IF;
    RAISE NOTICE 'PASS: a duplicate marked done is kept over older undone copies';

    SELECT array_agg(id) INTO kept FROM test_64.deadlines WHERE user_id = a AND title = 'Midterm';
    IF kept IS DISTINCT FROM ARRAY['00000000-0000-4000-8000-00000000d004'::uuid] THEN
        RAISE EXCEPTION 'FAIL: expected only the oldest Midterm (d004) to be kept, got %', kept;
    END IF;
    RAISE NOTICE 'PASS: otherwise the oldest duplicate is kept';

    SELECT array_agg(id) INTO kept FROM test_64.deadlines WHERE user_id = a AND title = 'Quiz 0';
    IF kept IS DISTINCT FROM ARRAY['00000000-0000-4000-8000-00000000d010'::uuid] THEN
        RAISE EXCEPTION 'FAIL: expected exact tie to keep the smaller id (d010), got %', kept;
    END IF;
    RAISE NOTICE 'PASS: exact ties keep one row, chosen by id';

    IF (SELECT count(*) FROM test_64.deadlines WHERE user_id = a AND title = 'Lab') <> 2 THEN
        RAISE EXCEPTION 'FAIL: labs with the same title on different dates should both be kept';
    END IF;
    RAISE NOTICE 'PASS: same title on different dates is kept';

    IF (SELECT count(*) FROM test_64.deadlines WHERE user_id = a AND course = 'MATH 125') <> 1 THEN
        RAISE EXCEPTION 'FAIL: same title and date in another course should be kept';
    END IF;
    RAISE NOTICE 'PASS: same title and date in another course is kept';

    IF (SELECT count(*) FROM test_64.deadlines WHERE user_id = a AND title IN ('Assignment 1 ', 'assignment 1')) <> 2 THEN
        RAISE EXCEPTION 'FAIL: case/whitespace variants changed behaviour, update this test and the notes';
    END IF;
    RAISE NOTICE 'PASS (known limitation): titles differing only in case/whitespace are not merged';

    IF NOT EXISTS (SELECT 1 FROM test_64.deadlines WHERE id = '00000000-0000-4000-8000-00000000d020') THEN
        RAISE EXCEPTION 'FAIL: user B''s copy of A''s deadline was deleted';
    END IF;
    SELECT array_agg(id) INTO kept FROM test_64.deadlines WHERE user_id = b AND title = 'Final';
    IF kept IS DISTINCT FROM ARRAY['00000000-0000-4000-8000-00000000d021'::uuid] THEN
        RAISE EXCEPTION 'FAIL: expected only B''s oldest Final (d021) to be kept, got %', kept;
    END IF;
    RAISE NOTICE 'PASS: duplicates are per user; other users'' rows are untouched';

    actual := (SELECT count(*) FROM test_64.deadlines WHERE user_id IN (a, b));
    IF actual <> 10 THEN
        RAISE EXCEPTION 'FAIL: expected 10 test rows after cleanup, got %', actual;
    END IF;
    RAISE NOTICE 'PASS: exactly 5 hand-written duplicate rows removed';

    -- Real data uploaded twice: one row per distinct deadline is left, and it's an original row
    expected := (SELECT count(DISTINCT (user_id, course, title, date)) FROM real_before);
    actual := (SELECT count(*) FROM test_64.deadlines WHERE user_id NOT IN (a, b));
    IF actual <> expected THEN
        RAISE EXCEPTION 'FAIL: real data: expected % deadlines after cleanup, got %', expected, actual;
    END IF;
    IF EXISTS (
        SELECT 1 FROM test_64.deadlines
        WHERE user_id NOT IN (a, b) AND id NOT IN (SELECT id FROM real_before)
    ) THEN
        RAISE EXCEPTION 'FAIL: real data: a second-upload copy was kept instead of the original';
    END IF;
    RAISE NOTICE 'PASS: real data uploaded twice is cleaned back to % deadlines (originals kept)', expected;
END $$;


-- 2. What saveDeadlines does, run as user A through row-level security.
-- supabase-js .upsert(rows, { onConflict: "user_id,course,title,date", ignoreDuplicates: true })
-- becomes INSERT ... ON CONFLICT (user_id, course, title, date) DO NOTHING.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}';

DO $$
DECLARE
    a uuid := '00000000-0000-4000-8000-0000000000a1';
    before_count int;
    inserted int;
    failed boolean;
BEGIN
    IF auth.uid() IS DISTINCT FROM a THEN
        RAISE EXCEPTION 'FAIL: test setup, auth.uid() is % instead of user A', auth.uid();
    END IF;

    SELECT count(*) INTO before_count FROM test_64.deadlines;  -- RLS: only A's rows

    -- Second upload of the same syllabus plus some new deadlines.
    -- Quiz 1 appears twice in the same batch (the parser could return it twice).
    INSERT INTO test_64.deadlines (course, title, date, category, source_text, weight, user_id) VALUES
        ('CMPUT 174', 'Assignment 1', '2026-09-20', 'assignment', 's', 99, a),
        ('CMPUT 174', 'Midterm',      '2026-10-15', 'midterm',    's', 25, a),
        ('CMPUT 174', 'Assignment 2', '2026-10-01', 'assignment', 's', 10, a),
        ('CMPUT 174', 'Quiz 1',       '2026-09-25', 'quiz',       's', 5,  a),
        ('CMPUT 174', 'Quiz 1',       '2026-09-25', 'quiz',       's', 5,  a)
    ON CONFLICT (user_id, course, title, date) DO NOTHING;
    GET DIAGNOSTICS inserted = ROW_COUNT;
    IF inserted <> 2 THEN
        RAISE EXCEPTION 'FAIL: expected 2 new deadlines (Assignment 2, Quiz 1) to be saved, got %', inserted;
    END IF;
    IF (SELECT count(*) FROM test_64.deadlines) <> before_count + 2 THEN
        RAISE EXCEPTION 'FAIL: row count after second upload is wrong';
    END IF;
    RAISE NOTICE 'PASS: re-upload skips existing deadlines without an error and saves new ones';
    RAISE NOTICE 'PASS: a deadline repeated within one batch is saved once';

    -- Skipped duplicates must not reset what the user already has
    IF NOT (SELECT done AND weight = 10 FROM test_64.deadlines WHERE id = '00000000-0000-4000-8000-00000000d002') THEN
        RAISE EXCEPTION 'FAIL: re-upload overwrote the existing deadline (done/weight changed)';
    END IF;
    RAISE NOTICE 'PASS: re-upload keeps the existing done status and weight';

    -- Third identical upload changes nothing
    INSERT INTO test_64.deadlines (course, title, date, category, source_text, weight, user_id) VALUES
        ('CMPUT 174', 'Assignment 2', '2026-10-01', 'assignment', 's', 10, a),
        ('CMPUT 174', 'Quiz 1',       '2026-09-25', 'quiz',       's', 5,  a)
    ON CONFLICT (user_id, course, title, date) DO NOTHING;
    GET DIAGNOSTICS inserted = ROW_COUNT;
    IF inserted <> 0 THEN
        RAISE EXCEPTION 'FAIL: identical upload inserted % rows', inserted;
    END IF;
    RAISE NOTICE 'PASS: uploading the same syllabus again inserts nothing';

    -- A plain insert (what saveDeadlines did before) is now rejected instead of duplicating
    failed := false;
    BEGIN
        INSERT INTO test_64.deadlines (course, title, date, category, source_text, user_id)
        VALUES ('CMPUT 174', 'Assignment 2', '2026-10-01', 'assignment', 's', a);
    EXCEPTION WHEN unique_violation THEN
        failed := true;
    END;
    IF NOT failed THEN
        RAISE EXCEPTION 'FAIL: plain insert of a duplicate was allowed';
    END IF;
    RAISE NOTICE 'PASS: the database itself refuses duplicates';

    -- RLS still applies with ON CONFLICT: A can't write B's rows, and a conflict with
    -- B's existing row must not be silently skipped (that would reveal B's deadlines to A)
    failed := false;
    BEGIN
        INSERT INTO test_64.deadlines (course, title, date, category, source_text, user_id)
        VALUES ('CMPUT 174', 'Assignment 1', '2026-09-20', 'assignment', 's', '00000000-0000-4000-8000-0000000000b1')
        ON CONFLICT (user_id, course, title, date) DO NOTHING;
    EXCEPTION WHEN insufficient_privilege THEN
        failed := true;
    END;
    IF NOT failed THEN
        RAISE EXCEPTION 'FAIL: user A inserted for user B, or the conflict with B''s row was silently skipped';
    END IF;
    RAISE NOTICE 'PASS: row-level security still blocks writing another user''s deadlines';

    -- Editing a deadline (updateDeadline) into an exact copy of another one now errors.
    -- The calendar popup shows this error to the user.
    failed := false;
    BEGIN
        UPDATE test_64.deadlines SET date = '2026-09-10' WHERE id = '00000000-0000-4000-8000-00000000d006';
    EXCEPTION WHEN unique_violation THEN
        failed := true;
    END;
    IF NOT failed THEN
        RAISE EXCEPTION 'FAIL: editing a deadline into a duplicate was allowed';
    END IF;
    RAISE NOTICE 'PASS: editing a deadline into a duplicate is rejected';
END $$;

RESET ROLE;

-- 3. User B was not affected by A's uploads
DO $$
BEGIN
    IF (SELECT count(*) FROM test_64.deadlines WHERE user_id = '00000000-0000-4000-8000-0000000000b1') <> 2 THEN
        RAISE EXCEPTION 'FAIL: user B''s deadlines changed during A''s uploads';
    END IF;
    RAISE NOTICE 'PASS: other users are unaffected by uploads';
END $$;

-- The SQL Editor doesn't show NOTICEs, only the last result. This line is only reached if no check failed.
SELECT 'ALL TESTS PASSED' AS result;

ROLLBACK;
