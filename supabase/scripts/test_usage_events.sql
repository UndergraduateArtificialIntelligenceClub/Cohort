-- Tests for the launch metrics: supabase/migrations/20261127140000_usage_events.sql and
-- 20261127150000_admin_metrics_since.sql.
--
-- How to run: after running those migrations, paste the whole file into Supabase → SQL Editor and run it,
-- or `psql "$DATABASE_URL" -f supabase/scripts/test_usage_events.sql`.
--
-- It adds two test users, logs events as one of them through row-level security, and checks that only small
-- counts get in, duplicates are skipped, nobody can read the events directly, and only an admin gets totals.
-- Everything is in one transaction that is rolled back at the end, so nothing is kept. Run the whole file at
-- once; running only part of it may skip the ROLLBACK.
--
-- Result: if every check passes, the last result is a row "ALL TESTS PASSED". If a check fails, it stops
-- with an error starting with "FAIL:".

BEGIN;

-- A signed up just now. B is an older account, and will be the admin.
INSERT INTO auth.users (id, email, created_at) VALUES
    ('00000000-0000-4000-8000-0000000000e1', 'test-metrics-a@ualberta.ca', now()),
    ('00000000-0000-4000-8000-0000000000e2', 'test-metrics-b@ualberta.ca', now() - INTERVAL '30 days');

-- Everything below runs as user A, the way the app does
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000e1';
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}';

DO $$
DECLARE
    failed BOOLEAN;
    got INT;
BEGIN
    IF auth.uid() IS DISTINCT FROM '00000000-0000-4000-8000-0000000000e1'::uuid THEN
        RAISE EXCEPTION 'FAIL: test setup, auth.uid() is % instead of user A', auth.uid();
    END IF;

    PERFORM public.log_event('app_open');
    PERFORM public.log_event('app_open');
    PERFORM public.log_event('parsed', 'syllabus', '{"found": 12, "undated": 2}');
    PERFORM public.log_event('review_saved', 'syllabus', '{"found": 12, "undated": 2, "removed": 1, "renamed": 0, "added": 1}');
    PERFORM public.log_event('signup_source', 'zz-test');
    PERFORM public.log_event('signup_source', 'zz-later');
    RAISE NOTICE 'ok: user A can log events';

    -- Only known names, a short lowercase source, and whole numbers from 0 to 1000 get in
    failed := false;
    BEGIN PERFORM public.log_event('something_else');
    EXCEPTION WHEN check_violation THEN failed := true; END;
    IF NOT failed THEN RAISE EXCEPTION 'FAIL: an unknown event name was saved'; END IF;

    failed := false;
    BEGIN PERFORM public.log_event('parsed', 'A sentence from a syllabus');
    EXCEPTION WHEN check_violation THEN failed := true; END;
    IF NOT failed THEN RAISE EXCEPTION 'FAIL: a source with spaces and capitals was saved'; END IF;

    failed := false;
    BEGIN PERFORM public.log_event('parsed', 'syllabus', '{"note": 1}');
    EXCEPTION WHEN raise_exception THEN failed := true; END;
    IF NOT failed THEN RAISE EXCEPTION 'FAIL: an unknown count key was saved'; END IF;

    failed := false;
    BEGIN PERFORM public.log_event('parsed', 'syllabus', '{"found": "CMPUT 174"}');
    EXCEPTION WHEN raise_exception THEN failed := true; END;
    IF NOT failed THEN RAISE EXCEPTION 'FAIL: text was saved as a count'; END IF;

    failed := false;
    BEGIN PERFORM public.log_event('parsed', 'syllabus', '{"found": 1.5}');
    EXCEPTION WHEN raise_exception THEN failed := true; END;
    IF NOT failed THEN RAISE EXCEPTION 'FAIL: a fraction was saved as a count'; END IF;
    RAISE NOTICE 'ok: only known names and small whole numbers get in';

    -- Nobody can read or write the table directly
    failed := false;
    BEGIN SELECT count(*) INTO got FROM public.usage_events;
    EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
    IF NOT failed THEN RAISE EXCEPTION 'FAIL: a user read usage_events directly'; END IF;

    failed := false;
    BEGIN INSERT INTO public.usage_events (user_id, name) VALUES (auth.uid(), 'app_open');
    EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
    IF NOT failed THEN RAISE EXCEPTION 'FAIL: a user inserted into usage_events directly'; END IF;
    RAISE NOTICE 'ok: usage_events can''t be read or written directly';

    -- Not an admin, so no totals
    failed := false;
    BEGIN PERFORM public.admin_metrics();
    EXCEPTION WHEN raise_exception THEN failed := true; END;
    IF NOT failed THEN RAISE EXCEPTION 'FAIL: a non-admin got admin_metrics'; END IF;

    failed := false;
    BEGIN INSERT INTO public.metrics_admins (user_id) VALUES (auth.uid());
    EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
    IF NOT failed THEN RAISE EXCEPTION 'FAIL: a user made themselves an admin'; END IF;
    RAISE NOTICE 'ok: only admins get totals, and users can''t become one';
END $$;

-- B is an older account: a campaign link it clicks later isn't where it came from
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000e2';
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}';
SELECT public.log_event('signup_source', 'zz-test');
RESET ROLE;

-- Logged out visitors can't log anything
SET LOCAL ROLE anon;
DO $$
DECLARE
    failed BOOLEAN := false;
BEGIN
    BEGIN PERFORM public.log_event('app_open');
    EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
    IF NOT failed THEN RAISE EXCEPTION 'FAIL: a logged out visitor could call log_event'; END IF;
    RAISE NOTICE 'ok: logged out visitors can''t call log_event';
END $$;
RESET ROLE;

DO $$
DECLARE
    a CONSTANT UUID := '00000000-0000-4000-8000-0000000000e1';
    got INT;
BEGIN
    SELECT count(*) INTO got FROM public.usage_events WHERE user_id = a AND name = 'app_open';
    IF got <> 1 THEN RAISE EXCEPTION 'FAIL: two app opens in a day left % rows, expected 1', got; END IF;
    RAISE NOTICE 'ok: one app open per day';

    SELECT count(*) INTO got FROM public.usage_events WHERE user_id = a AND name = 'signup_source';
    IF got <> 1 OR NOT EXISTS (SELECT 1 FROM public.usage_events WHERE user_id = a AND source = 'zz-test') THEN
        RAISE EXCEPTION 'FAIL: expected only the first signup source for user A';
    END IF;
    IF EXISTS (SELECT 1 FROM public.usage_events WHERE user_id = '00000000-0000-4000-8000-0000000000e2') THEN
        RAISE EXCEPTION 'FAIL: an older account''s signup source was saved';
    END IF;
    RAISE NOTICE 'ok: only a new account''s first source is kept';
END $$;

-- Make B an admin and check the totals as B
INSERT INTO public.metrics_admins (user_id) VALUES ('00000000-0000-4000-8000-0000000000e2');
CREATE TEMP TABLE expected_users ON COMMIT DROP AS
    SELECT (SELECT count(*) FROM auth.users) - (SELECT count(*) FROM public.metrics_admins) AS n;
GRANT SELECT ON expected_users TO authenticated;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
    m JSONB := public.admin_metrics();
BEGIN
    IF (m->>'users')::int <> (SELECT n FROM expected_users) THEN
        RAISE EXCEPTION 'FAIL: admin_metrics counted % users, expected % (admins left out)',
            m->>'users', (SELECT n FROM expected_users);
    END IF;
    IF (m->'sources'->>'zz-test')::int IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'FAIL: expected 1 signup from zz-test, got %', m->'sources'->'zz-test';
    END IF;
    IF jsonb_array_length(m->'daily') <> 30 THEN
        RAISE EXCEPTION 'FAIL: expected 30 days of daily numbers, got %', jsonb_array_length(m->'daily');
    END IF;
    IF m::text LIKE '%test-metrics-%' OR m::text LIKE '%00000000-0000-4000-8000-0000000000e%' THEN
        RAISE EXCEPTION 'FAIL: admin_metrics returned an email or a user id';
    END IF;
    RAISE NOTICE 'ok: an admin gets totals, without emails or ids, and admins are left out';

    -- 20261127150000_admin_metrics_since.sql: when counting began, and days before it aren't shown as 0
    IF m->>'counting_since' IS NULL THEN RAISE EXCEPTION 'FAIL: counting_since is missing'; END IF;
    IF (m->'daily'->-1->>'active') IS NULL THEN RAISE EXCEPTION 'FAIL: today''s active count is missing'; END IF;
    IF (SELECT min(created_at) FROM public.usage_events) > now() - INTERVAL '29 days'
       AND m->'daily'->0->'active' <> 'null'::jsonb THEN
        RAISE EXCEPTION 'FAIL: a day before counting began shows % active instead of not recorded', m->'daily'->0->'active';
    END IF;
    RAISE NOTICE 'ok: days before counting began show as not recorded';

    -- The team switch counts admins too
    IF (public.admin_metrics(true)->>'users')::int <> (SELECT n FROM expected_users) + 1 THEN
        RAISE EXCEPTION 'FAIL: admin_metrics(true) didn''t count the admin';
    END IF;
    RAISE NOTICE 'ok: Include team accounts counts the team too';
END $$;
RESET ROLE;

DO $$
BEGIN
    -- Deleting an account deletes its events (#85)
    DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000000e1';
    IF EXISTS (SELECT 1 FROM public.usage_events WHERE user_id = '00000000-0000-4000-8000-0000000000e1') THEN
        RAISE EXCEPTION 'FAIL: events stayed after the account was deleted';
    END IF;
    RAISE NOTICE 'ok: events are deleted with the account';
END $$;

-- The SQL Editor doesn't show NOTICEs, only the last result. This line is only reached if no check failed.
SELECT 'ALL TESTS PASSED' AS result;

ROLLBACK;
