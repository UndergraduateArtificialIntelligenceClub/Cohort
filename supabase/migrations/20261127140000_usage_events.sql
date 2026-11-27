-- Launch metrics: simple usage counts, and one function that adds them up for the team's /admin page.
-- Run after 20261127130000_terms_acceptances.sql. Safe to run twice.
--
-- The tables we already have answer most questions (signups, activation, courses per student, study buddy,
-- push opt-in). What they can't answer is recorded here as small events:
--   app_open        once per person per Edmonton day, for active users and retention (last_sign_in_at only
--                   changes on login, and sessions last for weeks)
--   parsed          a syllabus upload or Canvas import worked. source: syllabus | canvas. counts: found, undated
--   parse_failed    it didn't. source: syllabus | canvas
--   review_saved    the review popup was saved. source: syllabus | canvas | library.
--                   counts: found, removed, renamed, undated, added. How much people fix is our parse quality.
--   signup_source   the utm_source of the link that brought a new account here (?utm_source=reddit)
--
-- What's promised in the Privacy Policy (frontend/src/pages/Privacy.tsx): only counts, never syllabus text,
-- deadlines or messages, and the team looks at them added up, not person by person. So:
--   - Events are only written through log_event(), which accepts known names and small whole numbers only.
--   - Nobody can read the table directly. admin_metrics() returns totals only, and only to people in
--     metrics_admins.
--   - Rows are deleted with the account (#85).
--
-- To use the /admin page, add yourself in the SQL Editor:
--   INSERT INTO public.metrics_admins (user_id)
--   SELECT id FROM auth.users WHERE email = 'you@ualberta.ca' ON CONFLICT DO NOTHING;
-- Admins are left out of every number, so testing the app doesn't change them.

CREATE TABLE IF NOT EXISTS public.usage_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (name IN ('app_open', 'parsed', 'parse_failed', 'review_saved', 'signup_source')),
    -- Lowercase letters, digits and - _ . only, so it can never hold a sentence
    source TEXT CHECK (source ~ '^[a-z0-9_.-]{1,40}$'),
    -- Whole numbers by key, checked in log_event()
    counts JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_events_name_idx ON public.usage_events (name, created_at);
CREATE INDEX IF NOT EXISTS usage_events_user_idx ON public.usage_events (user_id, name, created_at);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
-- No policies: written only by log_event(), read only by admin_metrics()
REVOKE ALL ON public.usage_events FROM anon, authenticated;

-- Who can open /admin. Rows are added by hand in the SQL Editor (see the top of this file).
CREATE TABLE IF NOT EXISTS public.metrics_admins (
    user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE
);

ALTER TABLE public.metrics_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.metrics_admins FROM anon, authenticated;

-- Record one event for the logged in user. Bad input is rejected rather than stored. Duplicates that would
-- skew the numbers (a second app_open the same day, a later signup_source) are quietly skipped.
CREATE OR REPLACE FUNCTION public.log_event(p_name TEXT, p_source TEXT DEFAULT NULL, p_counts JSONB DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    me UUID := auth.uid();
    day_start TIMESTAMPTZ := date_trunc('day', now() AT TIME ZONE 'America/Edmonton') AT TIME ZONE 'America/Edmonton';
BEGIN
    IF me IS NULL THEN
        RAISE EXCEPTION 'Please log in first.';
    END IF;
    p_counts := coalesce(p_counts, '{}'::jsonb);
    IF jsonb_typeof(p_counts) <> 'object' OR EXISTS (
        SELECT 1 FROM jsonb_each(p_counts) AS c
        WHERE c.key NOT IN ('found', 'undated', 'removed', 'renamed', 'added')
           OR jsonb_typeof(c.value) <> 'number'
           OR c.value::numeric NOT BETWEEN 0 AND 1000
           OR c.value::numeric <> trunc(c.value::numeric)
    ) THEN
        RAISE EXCEPTION 'Counts must be small whole numbers.';
    END IF;

    -- A runaway client shouldn't be able to fill the table
    IF (SELECT count(*) FROM public.usage_events WHERE user_id = me AND created_at >= day_start) >= 300 THEN
        RETURN;
    END IF;
    IF p_name = 'app_open' AND EXISTS (
        SELECT 1 FROM public.usage_events WHERE user_id = me AND name = 'app_open' AND created_at >= day_start
    ) THEN
        RETURN;
    END IF;
    -- Only the first source counts, and only for a new account: an older account clicking a campaign link
    -- wasn't brought here by it
    IF p_name = 'signup_source' AND (
        EXISTS (SELECT 1 FROM public.usage_events WHERE user_id = me AND name = 'signup_source')
        OR (SELECT created_at FROM auth.users WHERE id = me) < now() - INTERVAL '2 days'
    ) THEN
        RETURN;
    END IF;

    INSERT INTO public.usage_events (user_id, name, source, counts) VALUES (me, p_name, p_source, p_counts);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_event(TEXT, TEXT, JSONB) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_event(TEXT, TEXT, JSONB) TO authenticated;

-- Everything the /admin page shows, as one JSON object of totals. Never returns ids, emails or names.
-- "School" deadlines have a course; personal items (course IS NULL) don't count toward activation or courses.
CREATE OR REPLACE FUNCTION public.admin_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    me UUID := auth.uid();
    today DATE := (now() AT TIME ZONE 'America/Edmonton')::date;
    result JSONB;
BEGIN
    IF me IS NULL OR NOT EXISTS (SELECT 1 FROM public.metrics_admins WHERE user_id = me) THEN
        RAISE EXCEPTION 'Not allowed.';
    END IF;

    WITH people AS (
        SELECT u.id, u.created_at
        FROM auth.users u
        WHERE NOT EXISTS (SELECT 1 FROM public.metrics_admins a WHERE a.user_id = u.id)
    ),
    -- When each person first saved a school deadline, and how many courses they have this term
    -- ("this term": a deadline from 30 days ago on, so last term's courses drop off)
    per_person AS (
        SELECT p.id, p.created_at,
               (SELECT min(d.created_at) FROM public.deadlines d
                 WHERE d.user_id = p.id AND d.course IS NOT NULL) AS first_school_at,
               (SELECT count(DISTINCT d.course) FROM public.deadlines d
                 WHERE d.user_id = p.id AND d.course IS NOT NULL AND d.date >= today - 30) AS courses
        FROM people p
    ),
    events AS (
        SELECT e.* FROM public.usage_events e JOIN people p ON p.id = e.user_id
    ),
    opens AS (
        SELECT user_id, created_at, (created_at AT TIME ZONE 'America/Edmonton')::date AS day
        FROM events WHERE name = 'app_open'
    ),
    recent AS (
        SELECT * FROM events WHERE created_at >= now() - INTERVAL '30 days'
    )
    SELECT jsonb_build_object(
        'generated_at', now(),
        'users', (SELECT count(*) FROM per_person),
        'new_7d', (SELECT count(*) FROM per_person WHERE created_at >= now() - INTERVAL '7 days'),
        'activated', (SELECT count(*) FROM per_person WHERE first_school_at IS NOT NULL),
        -- Signed up in the last 30 days (at least a day ago), and saved a school deadline within 24 hours
        'activation_24h', (
            SELECT jsonb_build_object(
                'cohort', count(*),
                'activated', count(*) FILTER (WHERE first_school_at <= created_at + INTERVAL '24 hours'))
            FROM per_person
            WHERE created_at BETWEEN now() - INTERVAL '30 days' AND now() - INTERVAL '24 hours'),
        'active_today', (SELECT count(DISTINCT user_id) FROM opens WHERE day = today),
        'active_7d', (SELECT count(DISTINCT user_id) FROM opens WHERE day > today - 7),
        'active_30d', (SELECT count(DISTINCT user_id) FROM opens WHERE day > today - 30),
        -- Came back in their second week / fifth week. Cohorts are only people old enough to have had the chance.
        'week1_retention', (
            SELECT jsonb_build_object(
                'cohort', count(*),
                'returned', count(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM opens o WHERE o.user_id = pp.id
                      AND o.created_at >= pp.created_at + INTERVAL '7 days'
                      AND o.created_at < pp.created_at + INTERVAL '14 days')))
            FROM per_person pp
            WHERE created_at BETWEEN now() - INTERVAL '60 days' AND now() - INTERVAL '14 days'),
        'week4_retention', (
            SELECT jsonb_build_object(
                'cohort', count(*),
                'returned', count(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM opens o WHERE o.user_id = pp.id
                      AND o.created_at >= pp.created_at + INTERVAL '28 days'
                      AND o.created_at < pp.created_at + INTERVAL '35 days')))
            FROM per_person pp
            WHERE created_at BETWEEN now() - INTERVAL '120 days' AND now() - INTERVAL '35 days'),
        -- How many people have 1, 2, 3, 4 or 5+ courses this term
        'courses_per_person', (
            SELECT jsonb_build_object(
                '1', count(*) FILTER (WHERE courses = 1),
                '2', count(*) FILTER (WHERE courses = 2),
                '3', count(*) FILTER (WHERE courses = 3),
                '4', count(*) FILTER (WHERE courses = 4),
                '5+', count(*) FILTER (WHERE courses >= 5),
                'average', round(avg(courses) FILTER (WHERE courses > 0), 1))
            FROM per_person),
        'push_people', (
            SELECT count(DISTINCT s.user_id) FROM public.push_subscriptions s JOIN people p ON p.id = s.user_id),
        -- The last 30 Edmonton days, oldest first
        'daily', (
            SELECT jsonb_agg(jsonb_build_object(
                'date', d.day,
                'signups', (SELECT count(*) FROM per_person
                            WHERE (created_at AT TIME ZONE 'America/Edmonton')::date = d.day),
                'activated', (SELECT count(*) FROM per_person
                              WHERE (first_school_at AT TIME ZONE 'America/Edmonton')::date = d.day),
                'active', (SELECT count(DISTINCT user_id) FROM opens WHERE day = d.day)
            ) ORDER BY d.day)
            FROM generate_series(today - 29, today, INTERVAL '1 day') AS g(t),
                 LATERAL (SELECT g.t::date AS day) d),
        -- Uploads and imports in the last 30 days, by where the dates came from
        'parsing', (
            SELECT coalesce(jsonb_object_agg(src, stats), '{}'::jsonb) FROM (
                SELECT source AS src, jsonb_build_object(
                    'parsed', count(*) FILTER (WHERE name = 'parsed'),
                    'failed', count(*) FILTER (WHERE name = 'parse_failed'),
                    'saved', count(*) FILTER (WHERE name = 'review_saved'),
                    'found', coalesce(sum((counts->>'found')::int) FILTER (WHERE name = 'review_saved'), 0),
                    'removed', coalesce(sum((counts->>'removed')::int) FILTER (WHERE name = 'review_saved'), 0),
                    'renamed', coalesce(sum((counts->>'renamed')::int) FILTER (WHERE name = 'review_saved'), 0),
                    'undated', coalesce(sum((counts->>'undated')::int) FILTER (WHERE name = 'review_saved'), 0),
                    'added', coalesce(sum((counts->>'added')::int) FILTER (WHERE name = 'review_saved'), 0),
                    -- Saved exactly as found: nothing removed and no course renamed
                    'unchanged', count(*) FILTER (WHERE name = 'review_saved'
                        AND coalesce((counts->>'removed')::int, 0) = 0
                        AND coalesce((counts->>'renamed')::int, 0) = 0)
                ) AS stats
                FROM recent
                WHERE name IN ('parsed', 'parse_failed', 'review_saved') AND source IS NOT NULL
                GROUP BY source
            ) s),
        'library_live', (SELECT count(*) FROM public.shared_syllabi WHERE last_deadline >= today),
        -- The 15 courses with the most students this term: how dense each one is for the library and study buddy
        'top_courses', (
            SELECT coalesce(jsonb_agg(c ORDER BY (c->>'students')::int DESC, c->>'course'), '[]'::jsonb) FROM (
                SELECT jsonb_build_object(
                    'course', d.course,
                    'students', count(DISTINCT d.user_id),
                    'waiting', (SELECT count(*) FROM public.study_requests r WHERE r.course = d.course),
                    'shared', (SELECT count(*) FROM public.shared_syllabi s
                               WHERE s.course = d.course AND s.last_deadline >= today)
                ) AS c
                FROM public.deadlines d JOIN people p ON p.id = d.user_id
                WHERE d.course IS NOT NULL AND d.date >= today - 30
                GROUP BY d.course
                ORDER BY count(DISTINCT d.user_id) DESC, d.course
                LIMIT 15
            ) t),
        -- Matches made in the last 30 days, and how many turned into a real chat (both people wrote)
        'study_buddy', (
            SELECT jsonb_build_object(
                'waiting', (SELECT count(*) FROM public.study_requests),
                'matches', count(*),
                'both_wrote', count(*) FILTER (WHERE
                    EXISTS (SELECT 1 FROM public.study_messages x WHERE x.match_id = m.id AND x.sender = m.user_a)
                    AND EXISTS (SELECT 1 FROM public.study_messages x WHERE x.match_id = m.id AND x.sender = m.user_b)),
                'messages', (SELECT count(*) FROM public.study_messages
                             WHERE created_at >= now() - INTERVAL '30 days'))
            FROM public.study_matches m
            WHERE m.created_at >= now() - INTERVAL '30 days'),
        -- Where new accounts came from, all time
        'sources', (
            SELECT coalesce(jsonb_object_agg(source, n), '{}'::jsonb) FROM (
                SELECT source, count(*) AS n FROM events
                WHERE name = 'signup_source' AND source IS NOT NULL
                GROUP BY source
            ) s)
    ) INTO result;

    RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_metrics() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_metrics() TO authenticated;
