-- Shared course library (issue #66): search for your course and use deadlines a classmate already parsed.
-- Ported from Mini's edit_and_share.sql, plus a report-a-mistake table.
-- No names or emails are shared: other people only ever see the course, instructor and deadlines.

-- One shared copy per course per uploader. Uploading the same course again replaces your copy.
-- deadlines is a JSON list shaped like the Deadline type: { course, title, date, category, source_text, weight }.
CREATE TABLE IF NOT EXISTS public.shared_syllabi (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Stored normalized ("cmput  174" -> "CMPUT 174"), same rule as normalizeCourse in frontend/src/lib/courses.ts
    course TEXT NOT NULL CHECK (
        course = upper(regexp_replace(btrim(course), '\s+', ' ', 'g'))
        AND char_length(course) BETWEEN 1 AND 50
    ),
    -- "CMPUT174" so a search without the space still finds "CMPUT 174"
    search_key TEXT GENERATED ALWAYS AS (replace(course, ' ', '')) STORED,
    -- Different sections can have different instructors and dates, so show who it's from
    instructor TEXT CHECK (char_length(instructor) <= 100),
    deadlines JSONB NOT NULL CHECK (
        jsonb_typeof(deadlines) = 'array'
        AND jsonb_array_length(deadlines) BETWEEN 1 AND 200
    ),
    uploaded_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    -- How many classmates used it. Only use_shared_syllabus below changes it.
    use_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (course, uploaded_by)
);

CREATE INDEX IF NOT EXISTS shared_syllabi_updated_idx ON public.shared_syllabi (updated_at);

-- Bump updated_at when the content changes (not when use_count goes up), so "updated 3 days ago" stays honest
CREATE OR REPLACE FUNCTION public.shared_syllabi_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.deadlines IS DISTINCT FROM OLD.deadlines OR NEW.instructor IS DISTINCT FROM OLD.instructor THEN
        NEW.updated_at := now();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shared_syllabi_touch ON public.shared_syllabi;
CREATE TRIGGER shared_syllabi_touch
BEFORE UPDATE ON public.shared_syllabi
FOR EACH ROW EXECUTE FUNCTION public.shared_syllabi_touch();

ALTER TABLE public.shared_syllabi ENABLE ROW LEVEL SECURITY;

-- Anyone logged in can browse the library
CREATE POLICY "Logged in users can browse shared syllabi"
ON public.shared_syllabi
FOR SELECT
TO authenticated
USING (true);

-- You can only share, update and remove your own copies
CREATE POLICY "Users can share their own syllabi"
ON public.shared_syllabi
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = uploaded_by);

CREATE POLICY "Users can update their own shared syllabi"
ON public.shared_syllabi
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = uploaded_by)
WITH CHECK ((SELECT auth.uid()) = uploaded_by);

CREATE POLICY "Users can remove their own shared syllabi"
ON public.shared_syllabi
FOR DELETE
TO authenticated
USING ((SELECT auth.uid()) = uploaded_by);

-- Column-level grants: people can write the content but not use_count, uploaded_by or the timestamps
REVOKE ALL ON public.shared_syllabi FROM anon, authenticated;
GRANT SELECT, DELETE ON public.shared_syllabi TO authenticated;
GRANT INSERT (course, instructor, deadlines) ON public.shared_syllabi TO authenticated;
GRANT UPDATE (course, instructor, deadlines) ON public.shared_syllabi TO authenticated;

-- Who used which shared syllabus, so each classmate counts once in "used by N"
CREATE TABLE IF NOT EXISTS public.shared_syllabus_uses (
    syllabus_id UUID NOT NULL REFERENCES public.shared_syllabi (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (syllabus_id, user_id)
);

-- Nobody reads or writes this table directly; use_shared_syllabus does it for them
ALTER TABLE public.shared_syllabus_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shared_syllabus_uses FROM anon, authenticated;

-- Called after someone saves deadlines from a shared syllabus.
-- SECURITY DEFINER so it can bump use_count, which users can't write themselves.
CREATE OR REPLACE FUNCTION public.use_shared_syllabus(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    me UUID := auth.uid();
BEGIN
    IF me IS NULL THEN
        RAISE EXCEPTION 'Please log in first.';
    END IF;
    -- Using your own copy doesn't count
    IF EXISTS (SELECT 1 FROM public.shared_syllabi WHERE id = p_id AND uploaded_by = me) THEN
        RETURN;
    END IF;
    INSERT INTO public.shared_syllabus_uses (syllabus_id, user_id) VALUES (p_id, me)
    ON CONFLICT DO NOTHING;
    -- FOUND is false when this person had already used it, so they only count once
    IF FOUND THEN
        UPDATE public.shared_syllabi SET use_count = use_count + 1 WHERE id = p_id;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.use_shared_syllabus(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.use_shared_syllabus(UUID) TO authenticated;

-- "Report a mistake": e.g. a wrong date. The uploader sees the reports on their own copy so they can fix it.
CREATE TABLE IF NOT EXISTS public.shared_syllabus_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    syllabus_id UUID NOT NULL REFERENCES public.shared_syllabi (id) ON DELETE CASCADE,
    reported_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
    message TEXT NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- One report per person per shared syllabus; reporting again replaces the message
    UNIQUE (syllabus_id, reported_by)
);

ALTER TABLE public.shared_syllabus_reports ENABLE ROW LEVEL SECURITY;

-- The reporter and the uploader can read a report. reported_by is only an id, never a name or email.
CREATE POLICY "Reporters and uploaders can read reports"
ON public.shared_syllabus_reports
FOR SELECT
TO authenticated
USING (
    (SELECT auth.uid()) = reported_by
    OR EXISTS (
        SELECT 1 FROM public.shared_syllabi s
        WHERE s.id = syllabus_id AND s.uploaded_by = (SELECT auth.uid())
    )
);

CREATE POLICY "Users can file their own reports"
ON public.shared_syllabus_reports
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = reported_by);

CREATE POLICY "Users can edit their own reports"
ON public.shared_syllabus_reports
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = reported_by)
WITH CHECK ((SELECT auth.uid()) = reported_by);

-- Reporters can withdraw a report; uploaders can dismiss reports on their own copy once fixed
CREATE POLICY "Reporters and uploaders can delete reports"
ON public.shared_syllabus_reports
FOR DELETE
TO authenticated
USING (
    (SELECT auth.uid()) = reported_by
    OR EXISTS (
        SELECT 1 FROM public.shared_syllabi s
        WHERE s.id = syllabus_id AND s.uploaded_by = (SELECT auth.uid())
    )
);

REVOKE ALL ON public.shared_syllabus_reports FROM anon, authenticated;
GRANT SELECT, DELETE ON public.shared_syllabus_reports TO authenticated;
GRANT INSERT (syllabus_id, message) ON public.shared_syllabus_reports TO authenticated;
-- syllabus_id is here because an upsert re-sends it; the unique key and policies still hold
GRANT UPDATE (syllabus_id, message) ON public.shared_syllabus_reports TO authenticated;
