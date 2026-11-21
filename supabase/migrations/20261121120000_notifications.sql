-- Notifications: push alerts on phones and computers, plus the red number on the app icon.
--
-- What gets sent (times are Edmonton time, like study_buddy_today):
--   Deadline reminders  From 7pm the evening before a deadline, plus a heads-up 3 days before exams
--                       (midterm, final) and anything worth 15% or more. Done deadlines are skipped.
--                       One notification per person per evening, listing everything that's due.
--   Study buddy         A new match, or new messages. One notification per chat until you open it, so a
--                       burst of messages doesn't buzz ten times. It says who and which course, never the text.
--   Quiet hours         Nothing is sent between 11pm and 8am. Chat alerts wait until 8am; if you've read the
--                       chat by then, nothing is sent.
-- Each person can switch deadline reminders and study buddy alerts off (notification_settings).
-- Ended chats (unmatch, block, report) never send anything.
--
-- How it fits together:
--   1. The browser subscribes (frontend/src/lib/notifications.ts) and saves the subscription with
--      save_push_subscription. Logging out removes it.
--   2. Every minute pg_cron runs kick_notifications(). When something is due, it calls the
--      send-notifications Edge Function (supabase/functions/send-notifications).
--   3. That function calls claim_due_notifications(), which returns what to send and marks it sent,
--      then pushes each notification to the person's devices.
--
-- Setup on a new Supabase project: see "Notifications" in the README (VAPID keys, the function's secrets,
-- and the two Vault secrets kick_notifications reads). Until those exist, the cron job does nothing.

-- ---------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------

-- One row per browser that turned notifications on. The endpoint is the browser's push address.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    endpoint TEXT PRIMARY KEY CHECK (endpoint LIKE 'https://%' AND char_length(endpoint) <= 1000),
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    -- The browser's encryption keys (base64url), from PushSubscription.toJSON().keys
    p256dh TEXT NOT NULL CHECK (char_length(p256dh) BETWEEN 1 AND 200),
    auth TEXT NOT NULL CHECK (char_length(auth) BETWEEN 1 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions (user_id);

-- What each person wants to hear about. No row means both are on.
CREATE TABLE IF NOT EXISTS public.notification_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    deadlines BOOLEAN NOT NULL DEFAULT TRUE,
    study_buddy BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Deadline reminders already sent, so each one goes out once.
-- due_date is part of the key: moving a deadline to another day earns it a fresh reminder.
CREATE TABLE IF NOT EXISTS public.deadline_reminders_sent (
    deadline_id UUID NOT NULL REFERENCES public.deadlines (id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('day_before', 'heads_up')),
    due_date DATE NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (deadline_id, kind, due_date)
);

-- When each person was last alerted about each chat. Another alert only goes out after they open it again.
CREATE TABLE IF NOT EXISTS public.study_buddy_alerts (
    match_id BIGINT NOT NULL REFERENCES public.study_matches (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    alerted_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (match_id, user_id)
);

-- ---------------------------------------------------------------------------------------------------
-- Who can read and write what
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deadline_reminders_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_buddy_alerts ENABLE ROW LEVEL SECURITY;

-- Settings: your own row only
DROP POLICY IF EXISTS "Users can read their own notification settings" ON public.notification_settings;
CREATE POLICY "Users can read their own notification settings"
ON public.notification_settings
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own notification settings" ON public.notification_settings;
CREATE POLICY "Users can create their own notification settings"
ON public.notification_settings
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can change their own notification settings" ON public.notification_settings;
CREATE POLICY "Users can change their own notification settings"
ON public.notification_settings
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

-- push_subscriptions, deadline_reminders_sent and study_buddy_alerts get no policies:
-- subscriptions only change through the functions below, and the other two are for the sender only.
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;
REVOKE ALL ON public.notification_settings FROM anon, authenticated;
REVOKE ALL ON public.deadline_reminders_sent FROM anon, authenticated;
REVOKE ALL ON public.study_buddy_alerts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_settings TO authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Called from the app
-- ---------------------------------------------------------------------------------------------------

-- "Turn on notifications", and on every app start while they're on (browsers sometimes swap the keys).
-- If someone else used this browser before, it's theirs no longer: one browser notifies one person.
CREATE OR REPLACE FUNCTION public.save_push_subscription(p_endpoint TEXT, p_p256dh TEXT, p_auth TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Please log in first.';
    END IF;
    -- Only the browsers' real push services (Chrome/Edge/Android, Firefox, Safari/iPhone, old Edge).
    -- Otherwise anyone could save their own website here and get our server to send requests to it.
    IF p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/' THEN
        RAISE EXCEPTION 'That isn''t a browser push address.';
    END IF;

    INSERT INTO public.push_subscriptions (endpoint, user_id, p256dh, auth)
    VALUES (p_endpoint, auth.uid(), p_p256dh, p_auth)
    ON CONFLICT (endpoint) DO UPDATE
    SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, updated_at = now();

    -- At most 10 devices per person (the most recently used), so nobody can make us send thousands of pushes
    DELETE FROM public.push_subscriptions p
    WHERE p.user_id = auth.uid()
      AND p.endpoint NOT IN (
          SELECT recent.endpoint FROM public.push_subscriptions recent
          WHERE recent.user_id = auth.uid()
          ORDER BY recent.updated_at DESC
          LIMIT 10
      );
END;
$$;

-- "Turn off on this device", and logging out
CREATE OR REPLACE FUNCTION public.delete_push_subscription(p_endpoint TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint AND user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------------------------------
-- Deciding what's due. Each takes the time as an argument so tests can pretend it's any time of day.
-- ---------------------------------------------------------------------------------------------------

-- The unread count from study_buddy_unread_count, for any person. The app icon's badge shows it.
CREATE OR REPLACE FUNCTION public.study_buddy_unread_for(p_user UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT count(*)::int
    FROM public.study_matches m
    CROSS JOIN LATERAL (
        SELECT CASE WHEN m.user_a = p_user THEN m.user_a_read_at ELSE m.user_b_read_at END AS read_at
    ) mine
    WHERE m.ended_at IS NULL
      AND p_user IN (m.user_a, m.user_b)
      AND (
          mine.read_at IS NULL
          OR EXISTS (
              SELECT 1 FROM public.study_messages msg
              WHERE msg.match_id = m.id AND msg.sender <> p_user AND msg.created_at > mine.read_at
          )
      );
$$;

-- Same result as before; now shares its rule with the badge on pushes
CREATE OR REPLACE FUNCTION public.study_buddy_unread_count()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.study_buddy_unread_for(auth.uid());
$$;

-- 11pm to 8am in Edmonton
CREATE OR REPLACE FUNCTION public.in_quiet_hours(p_now TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT extract(HOUR FROM p_now AT TIME ZONE 'America/Edmonton') NOT BETWEEN 8 AND 22;
$$;

-- Chats to alert someone about: a match they haven't opened yet, or messages since they last opened it.
-- Skipped if we already alerted them and they haven't opened the chat since.
CREATE OR REPLACE FUNCTION public.pending_study_buddy_alerts(p_now TIMESTAMPTZ DEFAULT now())
RETURNS TABLE (user_id UUID, match_id BIGINT, course TEXT, partner_name TEXT, new_match BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT me.user_id, m.id, m.course, me.partner_name, me.read_at IS NULL
    FROM public.study_matches m
    CROSS JOIN LATERAL (
        VALUES (m.user_a, m.user_a_read_at, m.user_b_name),
               (m.user_b, m.user_b_read_at, m.user_a_name)
    ) AS me (user_id, read_at, partner_name)
    LEFT JOIN public.study_buddy_alerts a ON a.match_id = m.id AND a.user_id = me.user_id
    WHERE m.ended_at IS NULL
      AND NOT public.in_quiet_hours(p_now)
      AND EXISTS (SELECT 1 FROM public.push_subscriptions p WHERE p.user_id = me.user_id)
      AND coalesce((SELECT s.study_buddy FROM public.notification_settings s WHERE s.user_id = me.user_id), TRUE)
      -- Something unread (the same rule as the badge)
      AND (
          me.read_at IS NULL
          OR EXISTS (
              SELECT 1 FROM public.study_messages msg
              WHERE msg.match_id = m.id AND msg.sender <> me.user_id AND msg.created_at > me.read_at
          )
      )
      -- Not alerted yet, or opened the chat since the last alert
      AND (a.alerted_at IS NULL OR (me.read_at IS NOT NULL AND a.alerted_at < me.read_at));
$$;

-- Deadline reminders due this evening: tomorrow's deadlines, and big ones 3 days out.
-- Only between 7pm and 11pm, so a late run never sends "due tomorrow" in the middle of the night.
CREATE OR REPLACE FUNCTION public.pending_deadline_reminders(p_now TIMESTAMPTZ DEFAULT now())
RETURNS TABLE (
    user_id UUID, deadline_id UUID, kind TEXT, course TEXT, title TEXT, due DATE, category TEXT, weight DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT d.user_id, d.id, k.kind, d.course, d.title, d.date, d.category, d.weight
    FROM public.deadlines d
    CROSS JOIN (VALUES ('day_before', 1), ('heads_up', 3)) AS k (kind, days_ahead)
    WHERE extract(HOUR FROM p_now AT TIME ZONE 'America/Edmonton') BETWEEN 19 AND 22
      AND d.date = (p_now AT TIME ZONE 'America/Edmonton')::date + k.days_ahead
      AND NOT d.done
      -- Heads-ups are only for exams and anything worth 15% or more
      AND (k.kind = 'day_before' OR d.category IN ('midterm', 'final') OR d.weight >= 15)
      AND EXISTS (SELECT 1 FROM public.push_subscriptions p WHERE p.user_id = d.user_id)
      AND coalesce((SELECT s.deadlines FROM public.notification_settings s WHERE s.user_id = d.user_id), TRUE)
      AND NOT EXISTS (
          SELECT 1 FROM public.deadline_reminders_sent r
          WHERE r.deadline_id = d.id AND r.kind = k.kind AND r.due_date = d.date
      );
$$;

-- Cheap check for the cron job, so the Edge Function only runs when there's something to send
CREATE OR REPLACE FUNCTION public.notifications_waiting(p_now TIMESTAMPTZ DEFAULT now())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (SELECT 1 FROM public.pending_study_buddy_alerts(p_now))
        OR EXISTS (SELECT 1 FROM public.pending_deadline_reminders(p_now));
$$;

-- What the Edge Function should send right now, marked as sent in the same step so nothing goes out twice.
-- One row per notification:
--   kind 'study_buddy': data = { match_id, course, partner_name, new_match }
--   kind 'deadlines':   data = { tomorrow: [deadline...], heads_up: [deadline...] }, one row per person
--                       where a deadline is { course, title, date, category, weight }
-- badge is the person's unread chat count for the app icon; subscriptions are their browsers.
CREATE OR REPLACE FUNCTION public.claim_due_notifications(p_now TIMESTAMPTZ DEFAULT now())
RETURNS TABLE (user_id UUID, kind TEXT, data JSONB, badge INT, subscriptions JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Two runs at once (a slow one and the next minute's) would otherwise both send the same things
    PERFORM pg_advisory_xact_lock(hashtext('cohort:claim_due_notifications'));

    -- The two INSERTs run even though nothing below reads them, so everything returned is marked as sent
    RETURN QUERY
    WITH due_chats AS (
        SELECT * FROM public.pending_study_buddy_alerts(p_now)
    ), due_reminders AS (
        SELECT * FROM public.pending_deadline_reminders(p_now)
    ), mark_chats AS (
        INSERT INTO public.study_buddy_alerts (match_id, user_id, alerted_at)
        SELECT c.match_id, c.user_id, p_now FROM due_chats c
        ON CONFLICT ON CONSTRAINT study_buddy_alerts_pkey DO UPDATE SET alerted_at = EXCLUDED.alerted_at
    ), mark_reminders AS (
        INSERT INTO public.deadline_reminders_sent (deadline_id, kind, due_date, sent_at)
        SELECT r.deadline_id, r.kind, r.due, p_now FROM due_reminders r
        ON CONFLICT DO NOTHING
    ), items AS (
        SELECT c.user_id, 'study_buddy'::text AS kind,
               jsonb_build_object(
                   'match_id', c.match_id, 'course', c.course,
                   'partner_name', c.partner_name, 'new_match', c.new_match
               ) AS data
        FROM due_chats c
        UNION ALL
        SELECT r.user_id, 'deadlines'::text,
               jsonb_build_object(
                   'tomorrow', coalesce(jsonb_agg(
                       jsonb_build_object('course', r.course, 'title', r.title, 'date', r.due,
                                          'category', r.category, 'weight', r.weight)
                       ORDER BY r.course, r.title) FILTER (WHERE r.kind = 'day_before'), '[]'::jsonb),
                   'heads_up', coalesce(jsonb_agg(
                       jsonb_build_object('course', r.course, 'title', r.title, 'date', r.due,
                                          'category', r.category, 'weight', r.weight)
                       ORDER BY r.course, r.title) FILTER (WHERE r.kind = 'heads_up'), '[]'::jsonb)
               )
        FROM due_reminders r
        GROUP BY r.user_id
    )
    SELECT i.user_id, i.kind, i.data,
           public.study_buddy_unread_for(i.user_id),
           (SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'endpoint', p.endpoint,
                       'keys', jsonb_build_object('p256dh', p.p256dh, 'auth', p.auth))), '[]'::jsonb)
            FROM public.push_subscriptions p WHERE p.user_id = i.user_id)
    FROM items i;
END;
$$;

-- App users can save and remove their own subscription. Everything else is for the sender only
-- (the Edge Function connects as service_role).
REVOKE EXECUTE ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.delete_push_subscription(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.study_buddy_unread_for(UUID) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.in_quiet_hours(TIMESTAMPTZ) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pending_study_buddy_alerts(TIMESTAMPTZ) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pending_deadline_reminders(TIMESTAMPTZ) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notifications_waiting(TIMESTAMPTZ) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_due_notifications(TIMESTAMPTZ) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_notifications(TIMESTAMPTZ) TO service_role;

-- ---------------------------------------------------------------------------------------------------
-- Every minute: if anything is due, ask the Edge Function to send it.
-- ---------------------------------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Reads two Vault secrets (Supabase dashboard → Project Settings → Vault, or the SQL in the README):
--   cohort_functions_url   https://<project-ref>.supabase.co/functions/v1
--   cohort_notify_secret   the same random string as the function's NOTIFY_SECRET
-- Without them it quietly does nothing, so the migration is safe to run before setup is finished.
CREATE OR REPLACE FUNCTION public.kick_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    functions_url TEXT;
    notify_secret TEXT;
BEGIN
    IF NOT public.notifications_waiting() THEN
        RETURN;
    END IF;

    SELECT decrypted_secret INTO functions_url FROM vault.decrypted_secrets WHERE name = 'cohort_functions_url';
    SELECT decrypted_secret INTO notify_secret FROM vault.decrypted_secrets WHERE name = 'cohort_notify_secret';
    IF functions_url IS NULL OR notify_secret IS NULL THEN
        RETURN;
    END IF;

    PERFORM net.http_post(
        url := rtrim(functions_url, '/') || '/send-notifications',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', notify_secret),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kick_notifications() FROM public, anon, authenticated;

-- Running this again just replaces the job
SELECT cron.schedule('cohort-notifications', '* * * * *', 'SELECT public.kick_notifications()');
