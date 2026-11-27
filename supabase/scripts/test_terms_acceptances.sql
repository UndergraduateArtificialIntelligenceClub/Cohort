-- Tests for the Terms and Privacy agreement record (issue #61): supabase/migrations/20261127130000_terms_acceptances.sql.
--
-- How to run: after running that migration, paste the whole file into Supabase → SQL Editor and run it,
-- or `psql "$DATABASE_URL" -f supabase/scripts/test_terms_acceptances.sql`.
--
-- It adds two test users, agrees to the terms as one of them through row-level security, and checks that the
-- record can't be faked, edited or seen by anyone else. Everything is in one transaction that is rolled back
-- at the end, so nothing is kept. Run the whole file at once; running only part of it may skip the ROLLBACK.
--
-- Result: if every check passes, the last result is a row "ALL TESTS PASSED". If a check fails, it stops
-- with an error starting with "FAIL:".

BEGIN;

INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-4000-8000-0000000000d1', 'test-terms-a@ualberta.ca'),
    ('00000000-0000-4000-8000-0000000000d2', 'test-terms-b@ualberta.ca');

-- User B agreed to an older version a while ago
INSERT INTO public.terms_acceptances (user_id, version, accepted_at)
VALUES ('00000000-0000-4000-8000-0000000000d2', 'test-old', '2030-01-01 12:00 UTC');

-- Everything below runs as user A, the way the app does
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000d1';
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}';

DO $$
DECLARE
    a CONSTANT UUID := '00000000-0000-4000-8000-0000000000d1';
    first_time TIMESTAMPTZ;
    got INT;
    failed BOOLEAN;
BEGIN
    IF auth.uid() IS DISTINCT FROM a THEN
        RAISE EXCEPTION 'FAIL: test setup, auth.uid() is % instead of user A', auth.uid();
    END IF;

    -- Nothing agreed yet, and B's row is hidden
    SELECT count(*) INTO got FROM public.terms_acceptances;
    IF got <> 0 THEN RAISE EXCEPTION 'FAIL: user A sees % rows before agreeing, expected 0', got; END IF;
    RAISE NOTICE 'ok: other users'' agreements are hidden';

    -- Agreeing saves a row with the database's time
    PERFORM public.accept_terms('test-v1');
    SELECT accepted_at INTO first_time FROM public.terms_acceptances WHERE user_id = a AND version = 'test-v1';
    IF first_time IS NULL THEN RAISE EXCEPTION 'FAIL: accept_terms saved no row'; END IF;
    RAISE NOTICE 'ok: accept_terms saves the agreement';

    -- Agreeing to the same version again keeps the first time and adds no row
    PERFORM public.accept_terms('test-v1');
    SELECT count(*) INTO got FROM public.terms_acceptances WHERE version = 'test-v1';
    IF got <> 1 THEN RAISE EXCEPTION 'FAIL: agreeing twice left % rows, expected 1', got; END IF;
    IF (SELECT accepted_at FROM public.terms_acceptances WHERE version = 'test-v1') <> first_time THEN
        RAISE EXCEPTION 'FAIL: agreeing twice changed the first time';
    END IF;
    RAISE NOTICE 'ok: agreeing again keeps the first time';

    -- A new version is a new row next to the old one
    PERFORM public.accept_terms('test-v2');
    SELECT count(*) INTO got FROM public.terms_acceptances;
    IF got <> 2 THEN RAISE EXCEPTION 'FAIL: after a new version user A has % rows, expected 2', got; END IF;
    RAISE NOTICE 'ok: each version is its own row';

    -- Users can't write the table directly: no backdated or made-up agreements
    failed := false;
    BEGIN
        INSERT INTO public.terms_acceptances (user_id, version, accepted_at) VALUES (a, 'test-fake', '2020-01-01');
    EXCEPTION WHEN insufficient_privilege THEN
        failed := true;
    END;
    IF NOT failed THEN RAISE EXCEPTION 'FAIL: a user inserted an agreement directly'; END IF;

    failed := false;
    BEGIN
        UPDATE public.terms_acceptances SET accepted_at = '2020-01-01' WHERE user_id = a;
    EXCEPTION WHEN insufficient_privilege THEN
        failed := true;
    END;
    IF NOT failed THEN RAISE EXCEPTION 'FAIL: a user changed the time of an agreement'; END IF;

    failed := false;
    BEGIN
        DELETE FROM public.terms_acceptances WHERE user_id = a;
    EXCEPTION WHEN insufficient_privilege THEN
        failed := true;
    END;
    IF NOT failed THEN RAISE EXCEPTION 'FAIL: a user deleted an agreement'; END IF;
    RAISE NOTICE 'ok: users can''t insert, change or delete agreements';
END $$;

RESET ROLE;

-- Logged out visitors can't agree for anyone
SET LOCAL ROLE anon;
DO $$
DECLARE
    failed BOOLEAN := false;
BEGIN
    BEGIN
        PERFORM public.accept_terms('test-v1');
    EXCEPTION WHEN insufficient_privilege THEN
        failed := true;
    END;
    IF NOT failed THEN RAISE EXCEPTION 'FAIL: a logged out visitor could call accept_terms'; END IF;
    RAISE NOTICE 'ok: logged out visitors can''t call accept_terms';
END $$;
RESET ROLE;

DO $$
BEGIN
    -- B's old agreement is untouched
    IF (SELECT accepted_at FROM public.terms_acceptances WHERE user_id = '00000000-0000-4000-8000-0000000000d2')
        <> '2030-01-01 12:00 UTC' THEN
        RAISE EXCEPTION 'FAIL: user B''s agreement changed';
    END IF;

    -- Deleting an account deletes its agreements (#85)
    DELETE FROM auth.users WHERE id = '00000000-0000-4000-8000-0000000000d1';
    IF EXISTS (SELECT 1 FROM public.terms_acceptances WHERE user_id = '00000000-0000-4000-8000-0000000000d1') THEN
        RAISE EXCEPTION 'FAIL: agreements stayed after the account was deleted';
    END IF;
    RAISE NOTICE 'ok: agreements are deleted with the account';
END $$;

-- The SQL Editor doesn't show NOTICEs, only the last result. This line is only reached if no check failed.
SELECT 'ALL TESTS PASSED' AS result;

ROLLBACK;
