-- Study buddy (issue #67): get paired with a classmate in one of your courses, then chat.
-- Ported from Mini's study_buddy.sql, plus block and report.
--
-- What a match sees about you: your first name only. Never your email, CCID or photo.
-- You can only look for a buddy in a course you have an upcoming deadline in.
-- Unmatch: the chat ends and you won't be paired again in that course.
-- Block: the chat ends and you'll never be paired with that person again, in any course.
-- Report: blocks them, and saves your note plus a copy of the chat to study_buddy_reports.
--   Only the project team reads that table (Supabase dashboard → Table Editor). Users can't read it.
--   To act on a report: Authentication → Users → find reported_email → Ban user.
--
-- Run after the earlier migrations. Requests, matches, blocks and reports are only created or changed
-- through the functions below, so nobody can fake a match, read someone's chat, or see who blocked them.

-- People waiting for a buddy: one row per person per course
CREATE TABLE IF NOT EXISTS public.study_requests (
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    -- Normalized ("cmput  174" -> "CMPUT 174"), same rule as normalizeCourse in frontend/src/lib/courses.ts
    course TEXT NOT NULL CHECK (
        course = upper(regexp_replace(btrim(course), '\s+', ' ', 'g'))
        AND char_length(course) BETWEEN 1 AND 50
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, course)
);

CREATE INDEX IF NOT EXISTS study_requests_course_idx ON public.study_requests (course, created_at);

-- A pair of students. First names are copied in at match time, because nobody can read auth.users.
CREATE TABLE IF NOT EXISTS public.study_matches (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    course TEXT NOT NULL,
    user_a UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    user_b UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    user_a_name TEXT NOT NULL,
    user_b_name TEXT NOT NULL,
    -- When each person last opened the chat; null means they haven't seen the match yet. Drives the nav badge.
    user_a_read_at TIMESTAMPTZ,
    user_b_read_at TIMESTAMPTZ,
    -- Set when either person unmatches, blocks or reports. The other person only sees that the chat ended.
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (user_a <> user_b)
);

CREATE INDEX IF NOT EXISTS study_matches_user_a_idx ON public.study_matches (user_a);
CREATE INDEX IF NOT EXISTS study_matches_user_b_idx ON public.study_matches (user_b);

CREATE TABLE IF NOT EXISTS public.study_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id BIGINT NOT NULL REFERENCES public.study_matches (id) ON DELETE CASCADE,
    sender UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS study_messages_match_idx ON public.study_messages (match_id, created_at);

-- Who blocked whom. Matching skips the pair whichever of them did the blocking.
CREATE TABLE IF NOT EXISTS public.study_blocks (
    blocker UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    blocked UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker, blocked)
);

CREATE INDEX IF NOT EXISTS study_blocks_blocked_idx ON public.study_blocks (blocked);

-- Reports about a person, for the project team. No foreign keys on the people or the match,
-- so a report (and its copy of the chat) survives if either account or the match is deleted.
CREATE TABLE IF NOT EXISTS public.study_buddy_reports (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_id BIGINT NOT NULL,
    course TEXT NOT NULL,
    reported_by UUID NOT NULL,
    reporter_email TEXT,
    reported_user UUID NOT NULL,
    reported_email TEXT,
    reported_name TEXT,
    reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 1000),
    -- The last 100 messages at the time of the report: [{ from: "reporter" | "reported", body, at }]
    messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Fill these in from the dashboard once you've dealt with it
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    -- Reporting the same chat again updates the report instead of adding another
    UNIQUE (match_id, reported_by)
);

-- Row Level Security: you only ever see your own requests, matches and chats
ALTER TABLE public.study_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_buddy_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can see their own study requests" ON public.study_requests;
CREATE POLICY "Users can see their own study requests"
ON public.study_requests
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can cancel their own study requests" ON public.study_requests;
CREATE POLICY "Users can cancel their own study requests"
ON public.study_requests
FOR DELETE
TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can see their own matches" ON public.study_matches;
CREATE POLICY "Users can see their own matches"
ON public.study_matches
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) IN (user_a, user_b));

DROP POLICY IF EXISTS "Users can read their own chats" ON public.study_messages;
CREATE POLICY "Users can read their own chats"
ON public.study_messages
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.study_matches m
        WHERE m.id = match_id AND (SELECT auth.uid()) IN (m.user_a, m.user_b)
    )
);

-- Only in a chat that hasn't ended, so after unmatch/block/report nothing more gets through
DROP POLICY IF EXISTS "Users can send in their own active chats" ON public.study_messages;
CREATE POLICY "Users can send in their own active chats"
ON public.study_messages
FOR INSERT
TO authenticated
WITH CHECK (
    sender = (SELECT auth.uid())
    AND EXISTS (
        SELECT 1 FROM public.study_matches m
        WHERE m.id = match_id AND m.ended_at IS NULL AND (SELECT auth.uid()) IN (m.user_a, m.user_b)
    )
);

-- study_blocks and study_buddy_reports get no policies: users can't read or write them directly

REVOKE ALL ON public.study_requests FROM anon, authenticated;
REVOKE ALL ON public.study_matches FROM anon, authenticated;
REVOKE ALL ON public.study_messages FROM anon, authenticated;
REVOKE ALL ON public.study_blocks FROM anon, authenticated;
REVOKE ALL ON public.study_buddy_reports FROM anon, authenticated;
GRANT SELECT, DELETE ON public.study_requests TO authenticated;
GRANT SELECT ON public.study_matches TO authenticated;
GRANT SELECT ON public.study_messages TO authenticated;
-- sender and created_at come from the database, so they can't be faked
GRANT INSERT (match_id, body) ON public.study_messages TO authenticated;

-- First name to show a match. Google gives a full name; email signups have none.
-- Never falls back to the email, since a UAlberta email starts with the person's CCID.
CREATE OR REPLACE FUNCTION public.study_buddy_first_name(meta JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT coalesce(
        nullif(left(split_part(btrim(coalesce(meta ->> 'full_name', meta ->> 'name', '')), ' ', 1), 30), ''),
        'Classmate'
    );
$$;

-- Today at the U of A, so a deadline doesn't stop counting at 5pm Edmonton time (midnight UTC)
CREATE OR REPLACE FUNCTION public.study_buddy_today()
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT (now() AT TIME ZONE 'America/Edmonton')::date;
$$;

-- "Find a buddy" button. Returns the new (or existing) match, or null if you're now waiting.
CREATE OR REPLACE FUNCTION public.find_study_buddy(p_course TEXT)
RETURNS public.study_matches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    me UUID := auth.uid();
    c TEXT := upper(regexp_replace(btrim(coalesce(p_course, '')), '\s+', ' ', 'g'));
    today DATE := public.study_buddy_today();
    other UUID;
    m public.study_matches;
BEGIN
    IF me IS NULL THEN
        RAISE EXCEPTION 'Please log in first.';
    END IF;
    IF c = '' OR char_length(c) > 50 THEN
        RAISE EXCEPTION 'Pick a course first.';
    END IF;

    -- Only courses you're in: you need an upcoming deadline in it.
    -- deadlines.course isn't stored normalized, so normalize it here the same way.
    IF NOT EXISTS (
        SELECT 1 FROM public.deadlines d
        WHERE d.user_id = me
          AND d.date >= today
          AND upper(regexp_replace(btrim(d.course), '\s+', ' ', 'g')) = c
    ) THEN
        RAISE EXCEPTION 'You can only find a buddy in a course with an upcoming deadline on your calendar.';
    END IF;

    -- One matcher per course at a time, so two people clicking together can't both miss each other
    PERFORM pg_advisory_xact_lock(hashtext('study_buddy:' || c));

    -- Waiting more than 2 weeks: the person has probably stopped checking, so drop them
    DELETE FROM public.study_requests WHERE created_at < now() - INTERVAL '14 days';

    -- Already have an active buddy in this course? Hand that back
    SELECT * INTO m FROM public.study_matches
    WHERE course = c AND ended_at IS NULL AND me IN (user_a, user_b)
    LIMIT 1;
    IF FOUND THEN
        RETURN m;
    END IF;

    -- Longest-waiting person in the course who is still in it, skipping anyone you've been
    -- matched with in this course before and anyone either of you blocked
    SELECT r.user_id INTO other
    FROM public.study_requests r
    WHERE r.course = c
      AND r.user_id <> me
      AND NOT EXISTS (
          SELECT 1 FROM public.study_matches old
          WHERE old.course = c
            AND ((old.user_a = me AND old.user_b = r.user_id) OR (old.user_a = r.user_id AND old.user_b = me))
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.study_blocks b
          WHERE (b.blocker = me AND b.blocked = r.user_id) OR (b.blocker = r.user_id AND b.blocked = me)
      )
      AND EXISTS (
          SELECT 1 FROM public.deadlines d
          WHERE d.user_id = r.user_id
            AND d.date >= today
            AND upper(regexp_replace(btrim(d.course), '\s+', ' ', 'g')) = c
      )
      -- They might already have a buddy here from an earlier request
      AND NOT EXISTS (
          SELECT 1 FROM public.study_matches cur
          WHERE cur.course = c AND cur.ended_at IS NULL AND r.user_id IN (cur.user_a, cur.user_b)
      )
    ORDER BY r.created_at
    LIMIT 1;

    IF other IS NULL THEN
        INSERT INTO public.study_requests (user_id, course) VALUES (me, c)
        ON CONFLICT DO NOTHING;
        RETURN NULL;
    END IF;

    DELETE FROM public.study_requests WHERE course = c AND user_id IN (me, other);

    -- I opened it just now, so it's only unread for the other person
    INSERT INTO public.study_matches (course, user_a, user_b, user_a_name, user_b_name, user_a_read_at)
    SELECT c, a.id, b.id,
        public.study_buddy_first_name(a.raw_user_meta_data),
        public.study_buddy_first_name(b.raw_user_meta_data),
        now()
    FROM auth.users a, auth.users b
    WHERE a.id = me AND b.id = other
    RETURNING * INTO m;

    RETURN m;
END;
$$;

-- "Unmatch" button. Ends the chat for both people; they won't be paired again in that course.
CREATE OR REPLACE FUNCTION public.end_study_match(p_match_id BIGINT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    UPDATE public.study_matches
    SET ended_at = now()
    WHERE id = p_match_id AND ended_at IS NULL AND auth.uid() IN (user_a, user_b);
$$;

-- Called when you open a chat, so it stops counting as unread
CREATE OR REPLACE FUNCTION public.mark_study_match_read(p_match_id BIGINT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    UPDATE public.study_matches
    SET user_a_read_at = CASE WHEN user_a = auth.uid() THEN now() ELSE user_a_read_at END,
        user_b_read_at = CASE WHEN user_b = auth.uid() THEN now() ELSE user_b_read_at END
    WHERE id = p_match_id AND auth.uid() IN (user_a, user_b);
$$;

-- How many active chats have something you haven't seen: a new match, or a message since you last looked
CREATE OR REPLACE FUNCTION public.study_buddy_unread_count()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT count(*)::int
    FROM public.study_matches m
    CROSS JOIN LATERAL (
        SELECT CASE WHEN m.user_a = auth.uid() THEN m.user_a_read_at ELSE m.user_b_read_at END AS read_at
    ) mine
    WHERE m.ended_at IS NULL
      AND auth.uid() IN (m.user_a, m.user_b)
      AND (
          mine.read_at IS NULL
          OR EXISTS (
              SELECT 1 FROM public.study_messages msg
              WHERE msg.match_id = m.id AND msg.sender <> auth.uid() AND msg.created_at > mine.read_at
          )
      );
$$;

-- "Block" button. Ends every active chat with this person, in all courses, and they're never matched with you again.
-- They only see that the chat ended, the same as an unmatch.
CREATE OR REPLACE FUNCTION public.block_study_buddy(p_match_id BIGINT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    me UUID := auth.uid();
    other UUID;
BEGIN
    IF me IS NULL THEN
        RAISE EXCEPTION 'Please log in first.';
    END IF;

    SELECT CASE WHEN user_a = me THEN user_b ELSE user_a END INTO other
    FROM public.study_matches
    WHERE id = p_match_id AND me IN (user_a, user_b);
    IF other IS NULL THEN
        RAISE EXCEPTION 'That chat was not found.';
    END IF;

    INSERT INTO public.study_blocks (blocker, blocked) VALUES (me, other)
    ON CONFLICT DO NOTHING;

    UPDATE public.study_matches
    SET ended_at = now()
    WHERE ended_at IS NULL
      AND ((user_a = me AND user_b = other) OR (user_a = other AND user_b = me));
END;
$$;

-- "Report" button. Saves the note and a copy of the chat for the project team, then blocks them.
CREATE OR REPLACE FUNCTION public.report_study_buddy(p_match_id BIGINT, p_reason TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    me UUID := auth.uid();
    reason TEXT := btrim(coalesce(p_reason, ''));
    m public.study_matches;
    other UUID;
    other_name TEXT;
    chat JSONB;
BEGIN
    IF me IS NULL THEN
        RAISE EXCEPTION 'Please log in first.';
    END IF;
    IF reason = '' THEN
        RAISE EXCEPTION 'Say what happened first.';
    END IF;
    IF char_length(reason) > 1000 THEN
        RAISE EXCEPTION 'Keep it under 1000 characters.';
    END IF;

    SELECT * INTO m FROM public.study_matches
    WHERE id = p_match_id AND me IN (user_a, user_b);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'That chat was not found.';
    END IF;
    IF m.user_a = me THEN
        other := m.user_b;
        other_name := m.user_b_name;
    ELSE
        other := m.user_a;
        other_name := m.user_a_name;
    END IF;

    -- Oldest first, so it reads like the chat did
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'from', CASE WHEN recent.sender = me THEN 'reporter' ELSE 'reported' END,
               'body', recent.body,
               'at', recent.created_at
           ) ORDER BY recent.created_at), '[]'::jsonb)
    INTO chat
    FROM (
        SELECT sender, body, created_at FROM public.study_messages
        WHERE match_id = m.id
        ORDER BY created_at DESC
        LIMIT 100
    ) recent;

    INSERT INTO public.study_buddy_reports
        (match_id, course, reported_by, reporter_email, reported_user, reported_email, reported_name, reason, messages)
    VALUES (
        m.id, m.course, me, (SELECT email FROM auth.users WHERE id = me),
        other, (SELECT email FROM auth.users WHERE id = other), other_name, reason, chat
    )
    ON CONFLICT (match_id, reported_by) DO UPDATE
    SET reason = EXCLUDED.reason, messages = EXCLUDED.messages, created_at = now(),
        reviewed_at = NULL, review_note = NULL;

    PERFORM public.block_study_buddy(m.id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.study_buddy_first_name(JSONB) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_study_buddy(TEXT) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.end_study_match(BIGINT) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.mark_study_match_read(BIGINT) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.study_buddy_unread_count() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.block_study_buddy(BIGINT) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.report_study_buddy(BIGINT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.find_study_buddy(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_study_match(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_study_match_read(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.study_buddy_unread_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_study_buddy(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_study_buddy(BIGINT, TEXT) TO authenticated;

-- Live updates: new matches, ended chats and messages show up without refreshing.
-- Supabase still applies the policies above, so people only get their own rows.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'study_matches') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.study_matches;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'study_messages') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.study_messages;
    END IF;
END $$;
