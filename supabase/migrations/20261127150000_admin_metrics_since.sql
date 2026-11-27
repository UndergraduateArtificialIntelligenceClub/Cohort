-- Launch metrics, round two: make /admin honest about when counting started, and let the team include itself.
-- Run after 20261127140000_usage_events.sql. Safe to run twice.
--
-- The first version mixed two kinds of numbers. Signups, activation and courses come from tables with full
-- history, but active users, uploads and retention come from usage_events, which only began when that PR went
-- live. So days before that showed 0 active instead of "not recorded", and week 1 retention would have read 0%
-- for weeks, because nobody's earlier visits existed. Now admin_metrics():
--   - returns counting_since (the first event logged), and null instead of 0 for active users before it
--   - only puts people in a retention cohort if their return window started after counting began
--   - takes p_include_team, so the team can check its own activity is being recorded (off by default, so
--     testing still doesn't change the numbers)
--
-- Deploy order: run this before the frontend that calls admin_metrics(p_include_team), or /admin shows an error
-- until it runs. Nothing else in the app uses this function.

-- The old version had no arguments. Drop it so admin_metrics() has one meaning.
DROP FUNCTION IF EXISTS public.admin_metrics();

CREATE OR REPLACE FUNCTION public.admin_metrics(p_include_team BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    me UUID := auth.uid();
    today DATE := (now() AT TIME ZONE 'America/Edmonton')::date;
    -- When the first event was logged, by anyone: nothing before this was recorded
    since TIMESTAMPTZ := (SELECT min(created_at) FROM public.usage_events);
    since_day DATE := (since AT TIME ZONE 'America/Edmonton')::date;
    result JSONB;
BEGIN
    IF me IS NULL OR NOT EXISTS (SELECT 1 FROM public.metrics_admins WHERE user_id = me) THEN
        RAISE EXCEPTION 'Not allowed.';
    END IF;

    WITH people AS (
        SELECT u.id, u.created_at
        FROM auth.users u
        WHERE p_include_team OR NOT EXISTS (SELECT 1 FROM public.metrics_admins a WHERE a.user_id = u.id)
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
        'counting_since', since,
        'include_team', p_include_team,
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
        -- Came back in their second week / fifth week. Cohorts are only people old enough to have had the chance,
        -- and whose return window started after counting began, so visits we never recorded don't count as not
        -- coming back.
        'week1_retention', (
            SELECT jsonb_build_object(
                'cohort', count(*),
                'returned', count(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM opens o WHERE o.user_id = pp.id
                      AND o.created_at >= pp.created_at + INTERVAL '7 days'
                      AND o.created_at < pp.created_at + INTERVAL '14 days')))
            FROM per_person pp
            WHERE created_at BETWEEN now() - INTERVAL '60 days' AND now() - INTERVAL '14 days'
              AND created_at + INTERVAL '7 days' >= since),
        'week4_retention', (
            SELECT jsonb_build_object(
                'cohort', count(*),
                'returned', count(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM opens o WHERE o.user_id = pp.id
                      AND o.created_at >= pp.created_at + INTERVAL '28 days'
                      AND o.created_at < pp.created_at + INTERVAL '35 days')))
            FROM per_person pp
            WHERE created_at BETWEEN now() - INTERVAL '120 days' AND now() - INTERVAL '35 days'
              AND created_at + INTERVAL '28 days' >= since),
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
        -- The last 30 Edmonton days, oldest first. active is null for days before counting began (not recorded,
        -- which isn't the same as nobody).
        'daily', (
            SELECT jsonb_agg(jsonb_build_object(
                'date', d.day,
                'signups', (SELECT count(*) FROM per_person
                            WHERE (created_at AT TIME ZONE 'America/Edmonton')::date = d.day),
                'activated', (SELECT count(*) FROM per_person
                              WHERE (first_school_at AT TIME ZONE 'America/Edmonton')::date = d.day),
                'active', CASE WHEN since IS NULL OR d.day < since_day THEN NULL
                               ELSE (SELECT count(DISTINCT user_id) FROM opens WHERE day = d.day) END
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

REVOKE EXECUTE ON FUNCTION public.admin_metrics(BOOLEAN) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_metrics(BOOLEAN) TO authenticated;
