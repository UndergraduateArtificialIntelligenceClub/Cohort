-- Tests for course code spacing: supabase/migrations/20261127120000_course_code_spacing.sql.
--
-- How to run: after running that migration, paste the whole file into Supabase → SQL Editor and run it,
-- or `psql "$DATABASE_URL" -f supabase/scripts/test_course_code_spacing.sql`.
--
-- It checks normalize_course() against the same cases as normalizeCourse() in frontend/src/lib/courses.ts,
-- then adds a test user and checks that the CHECKs refuse names that aren't normalized. Everything is in one
-- transaction that is rolled back at the end, so nothing is kept. Run the whole file at once; running only
-- part of it may skip the ROLLBACK.
--
-- Result: if every check passes, the last result is a row "ALL TESTS PASSED". If a check fails, it stops
-- with an error starting with "FAIL:".

BEGIN;

INSERT INTO auth.users (id, email) VALUES ('00000000-0000-4000-8000-0000000000d1', 'test-course-codes@ualberta.ca');

DO $$
DECLARE
    cases CONSTANT TEXT[][] := ARRAY[
        ARRAY['cmput174', 'CMPUT 174'],
        ARRAY[' cmput  174 ', 'CMPUT 174'],
        ARRAY['CMPUT 174', 'CMPUT 174'],
        ARRAY['INT D 137B', 'INT D 137B'],
        ARRAY['int d137b', 'INT D 137B'],
        ARRAY['math100 a1', 'MATH 100 A1'],
        ARRAY['E E240', 'E E 240'],
        ARRAY['STAT 151A', 'STAT 151A'],
        ARRAY['174', '174'],
        ARRAY['MEC E 250', 'MEC E 250']
    ];
    got TEXT;
    refused BOOLEAN;
BEGIN
    FOR i IN 1 .. array_length(cases, 1) LOOP
        got := public.normalize_course(cases[i][1]);
        IF got IS DISTINCT FROM cases[i][2] THEN
            RAISE EXCEPTION 'FAIL: normalize_course(%) is %, expected %', quote_literal(cases[i][1]), quote_literal(got), quote_literal(cases[i][2]);
        END IF;
        -- Normalizing twice changes nothing, or the CHECKs would refuse their own output
        IF public.normalize_course(got) IS DISTINCT FROM got THEN
            RAISE EXCEPTION 'FAIL: normalize_course(%) changes it again', quote_literal(got);
        END IF;
    END LOOP;
    RAISE NOTICE 'ok: normalize_course cases';

    -- A normalized deadline and a personal one (no course) are both allowed
    INSERT INTO public.deadlines (user_id, course, title, date, category, source_text)
    VALUES ('00000000-0000-4000-8000-0000000000d1', 'CMPUT 174', 'Lab 1', '2030-03-11', 'lab', 's');
    INSERT INTO public.deadlines (user_id, course, title, date, category, source_text)
    VALUES ('00000000-0000-4000-8000-0000000000d1', NULL, 'Dentist', '2030-03-11', 'personal', NULL);
    RAISE NOTICE 'ok: normalized and personal deadlines saved';

    -- "CMPUT174" isn't normalized any more, so each table refuses it
    refused := false;
    BEGIN
        INSERT INTO public.deadlines (user_id, course, title, date, category, source_text)
        VALUES ('00000000-0000-4000-8000-0000000000d1', 'CMPUT174', 'Lab 2', '2030-03-18', 'lab', 's');
    EXCEPTION WHEN check_violation THEN
        refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'FAIL: deadlines took "CMPUT174"'; END IF;

    refused := false;
    BEGIN
        INSERT INTO public.course_colors (user_id, course, color)
        VALUES ('00000000-0000-4000-8000-0000000000d1', 'CMPUT174', 0);
    EXCEPTION WHEN check_violation THEN
        refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'FAIL: course_colors took "CMPUT174"'; END IF;

    refused := false;
    BEGIN
        INSERT INTO public.shared_syllabi (course, deadlines, uploaded_by)
        VALUES ('CMPUT174', '[{"title": "Lab 1"}]', '00000000-0000-4000-8000-0000000000d1');
    EXCEPTION WHEN check_violation THEN
        refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'FAIL: shared_syllabi took "CMPUT174"'; END IF;

    refused := false;
    BEGIN
        INSERT INTO public.study_requests (user_id, course)
        VALUES ('00000000-0000-4000-8000-0000000000d1', 'CMPUT174');
    EXCEPTION WHEN check_violation THEN
        refused := true;
    END;
    IF NOT refused THEN RAISE EXCEPTION 'FAIL: study_requests took "CMPUT174"'; END IF;
    RAISE NOTICE 'ok: CHECKs refuse "CMPUT174"';
END $$;

SELECT 'ALL TESTS PASSED' AS result;

ROLLBACK;
