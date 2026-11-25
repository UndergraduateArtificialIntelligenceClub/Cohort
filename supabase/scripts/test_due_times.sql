-- Tests for due times: supabase/migrations/20261124120000_due_times.sql.
--
-- How to run: after running that migration, paste the whole file into Supabase → SQL Editor and run it,
-- or `psql "$DATABASE_URL" -f supabase/scripts/test_due_times.sql`.
--
-- It adds a test user with a few deadlines in March 2030 (so no real deadline is due that day), pretends it's
-- 8pm the evening before, and checks what the reminder functions return. Everything is in one transaction
-- that is rolled back at the end, so nothing is kept. Run the whole file at once; running only part of it
-- may skip the ROLLBACK.
--
-- Result: if every check passes, the last result is a row "ALL TESTS PASSED". If a check fails, it stops
-- with an error starting with "FAIL:".

BEGIN;

INSERT INTO auth.users (id, email) VALUES ('00000000-0000-4000-8000-0000000000c1', 'test-due-times@ualberta.ca');

-- Reminders only go to people with a browser subscribed
INSERT INTO public.push_subscriptions (endpoint, user_id, p256dh, auth)
VALUES ('https://push.example.com/test-due-times', '00000000-0000-4000-8000-0000000000c1', 'k', 'a');

INSERT INTO public.deadlines (id, user_id, course, title, date, time, category, source_text, weight) VALUES
    -- Tomorrow, in this order once sorted: 9am, 11:59pm, then the one with no time
    ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-0000000000c1', 'CMPUT 174', 'Assignment 2', '2030-03-11', '23:59', 'assignment', 's', 10),
    ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-0000000000c1', 'STAT 151', 'Quiz 3', '2030-03-11', '09:00', 'quiz', 's', 2),
    ('00000000-0000-4000-8000-00000000e003', '00000000-0000-4000-8000-0000000000c1', 'CMPUT 174', 'Lab 4', '2030-03-11', NULL, 'lab', 's', NULL),
    -- 3 days out: a midterm, so it gets the heads-up
    ('00000000-0000-4000-8000-00000000e004', '00000000-0000-4000-8000-0000000000c1', 'MATH 125', 'Midterm', '2030-03-13', '09:30', 'midterm', 's', 25);

DO $$
DECLARE
    evening CONSTANT TIMESTAMPTZ := '2030-03-10 20:00 America/Edmonton';
    got TEXT;
    row_data JSONB;
BEGIN
    -- The column exists and stores a time of day
    SELECT time::text INTO got FROM public.deadlines WHERE id = '00000000-0000-4000-8000-00000000e001';
    IF got IS DISTINCT FROM '23:59:00' THEN RAISE EXCEPTION 'FAIL: stored time is %, expected 23:59:00', got; END IF;
    RAISE NOTICE 'ok: time column';

    -- pending_deadline_reminders returns due_time, untimed ones as NULL
    SELECT string_agg(title || '=' || coalesce(due_time::text, 'null'), ', ' ORDER BY title) INTO got
    FROM public.pending_deadline_reminders(evening)
    WHERE user_id = '00000000-0000-4000-8000-0000000000c1';
    IF got IS DISTINCT FROM 'Assignment 2=23:59:00, Lab 4=null, Midterm=09:30:00, Quiz 3=09:00:00' THEN
        RAISE EXCEPTION 'FAIL: pending_deadline_reminders gave %', got;
    END IF;
    RAISE NOTICE 'ok: pending_deadline_reminders has due_time';

    -- claim_due_notifications lists tomorrow's in time order, untimed last, each with its time
    SELECT data INTO row_data FROM public.claim_due_notifications(evening)
    WHERE user_id = '00000000-0000-4000-8000-0000000000c1' AND kind = 'deadlines';
    SELECT string_agg(d->>'title' || '@' || coalesce(d->>'time', 'null'), ', ' ORDER BY n) INTO got
    FROM jsonb_array_elements(row_data->'tomorrow') WITH ORDINALITY AS t (d, n);
    IF got IS DISTINCT FROM 'Quiz 3@09:00:00, Assignment 2@23:59:00, Lab 4@null' THEN
        RAISE EXCEPTION 'FAIL: tomorrow list was %', got;
    END IF;
    IF row_data->'heads_up'->0->>'time' IS DISTINCT FROM '09:30:00' THEN
        RAISE EXCEPTION 'FAIL: heads_up was %', row_data->'heads_up';
    END IF;
    RAISE NOTICE 'ok: claim_due_notifications sends times in order';

    -- Claiming marked them as sent, so a second run sends nothing for this user
    IF EXISTS (SELECT 1 FROM public.claim_due_notifications(evening) WHERE user_id = '00000000-0000-4000-8000-0000000000c1') THEN
        RAISE EXCEPTION 'FAIL: reminders were sent twice';
    END IF;
    RAISE NOTICE 'ok: nothing sent twice';

    -- The migration drops and recreates pending_deadline_reminders, which resets its grants. App users must
    -- still not be able to run either function.
    IF has_function_privilege('authenticated', 'public.pending_deadline_reminders(timestamptz)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.pending_deadline_reminders(timestamptz)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.claim_due_notifications(timestamptz)', 'EXECUTE') THEN
        RAISE EXCEPTION 'FAIL: app users can run the reminder functions';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.claim_due_notifications(timestamptz)', 'EXECUTE') THEN
        RAISE EXCEPTION 'FAIL: service_role can no longer claim notifications';
    END IF;
    RAISE NOTICE 'ok: grants';
END $$;

SELECT 'ALL TESTS PASSED' AS result;

ROLLBACK;
