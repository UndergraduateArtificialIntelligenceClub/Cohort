-- Due times: when a deadline is due on its day (11:59 PM), or when an exam starts (9:00 AM).
-- Run after 20261122000000_own_dates.sql. Safe to run twice.
--
-- What changes:
--   deadlines.time   New, optional. A wall-clock time in Edmonton, stored next to date rather than turning date
--                    into a timestamp, so every rule that works on whole days (the planner, the unique key,
--                    reminders) stays exactly as it was. NULL means the syllabus didn't say, never "end of day".
--   Shared library   Entries in shared_syllabi.deadlines can now have "time": "HH:MM". Older entries don't, and
--                    the app reads a missing time as null, so nothing needs backfilling.
--   Reminders        The evening-before and 3-day notifications now say the time ("due at 11:59 PM"), and list
--                    the day's items in time order.
--
-- After running this, redeploy the send-notifications Edge Function so the notification text uses the time.

ALTER TABLE public.deadlines ADD COLUMN IF NOT EXISTS time TIME;

-- pending_deadline_reminders gains a due_time column. CREATE OR REPLACE can't change what a function returns,
-- so drop it first. The functions that call it are recreated or only look it up when they run, so nothing else
-- needs dropping. A dropped function loses its grants, which is why the REVOKEs below are repeated.
DROP FUNCTION IF EXISTS public.pending_deadline_reminders(TIMESTAMPTZ);

-- Same as in 20261122000000_own_dates.sql, plus due_time
CREATE FUNCTION public.pending_deadline_reminders(p_now TIMESTAMPTZ DEFAULT now())
RETURNS TABLE (
    user_id UUID, deadline_id UUID, kind TEXT, course TEXT, title TEXT, due DATE, due_time TIME,
    category TEXT, weight DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT d.user_id, d.id, k.kind, d.course, d.title, d.date, d.time, d.category, d.weight
    FROM public.deadlines d
    CROSS JOIN (VALUES ('day_before', 1), ('heads_up', 3)) AS k (kind, days_ahead)
    WHERE extract(HOUR FROM p_now AT TIME ZONE 'America/Edmonton') BETWEEN 19 AND 22
      AND d.date = (p_now AT TIME ZONE 'America/Edmonton')::date + k.days_ahead
      AND NOT d.done
      -- Heads-ups are only for school exams and anything worth 15% or more. Personal items only get the evening before.
      AND (k.kind = 'day_before' OR (NOT d.personal AND (d.category IN ('midterm', 'final') OR d.weight >= 15)))
      AND EXISTS (SELECT 1 FROM public.push_subscriptions p WHERE p.user_id = d.user_id)
      AND coalesce((SELECT s.deadlines FROM public.notification_settings s WHERE s.user_id = d.user_id), TRUE)
      AND NOT EXISTS (
          SELECT 1 FROM public.deadline_reminders_sent r
          WHERE r.deadline_id = d.id AND r.kind = k.kind AND r.due_date = d.date
      );
$$;

-- Same as in 20261121120000_notifications.sql, except each deadline also carries its time ("23:59:00" or null)
-- and they're listed earliest first, with untimed ones after the timed ones.
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
                       jsonb_build_object('course', r.course, 'title', r.title, 'date', r.due, 'time', r.due_time,
                                          'category', r.category, 'weight', r.weight)
                       ORDER BY r.due_time NULLS LAST, r.course, r.title) FILTER (WHERE r.kind = 'day_before'), '[]'::jsonb),
                   'heads_up', coalesce(jsonb_agg(
                       jsonb_build_object('course', r.course, 'title', r.title, 'date', r.due, 'time', r.due_time,
                                          'category', r.category, 'weight', r.weight)
                       ORDER BY r.due_time NULLS LAST, r.course, r.title) FILTER (WHERE r.kind = 'heads_up'), '[]'::jsonb)
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

-- Only the sender may run these (the Edge Function connects as service_role)
REVOKE EXECUTE ON FUNCTION public.pending_deadline_reminders(TIMESTAMPTZ) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_due_notifications(TIMESTAMPTZ) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_notifications(TIMESTAMPTZ) TO service_role;
