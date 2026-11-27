-- Terms and Privacy agreements (issue #61): which version of the Terms of Service and Privacy Policy each
-- person agreed to, and when. Run after 20261127120000_course_code_spacing.sql. Safe to run twice.
--
-- After login, the app checks this table. If there's no row for the current version (TERMS_VERSION in
-- frontend/src/lib/legal.ts), it asks before opening the app. That covers new accounts (Google or email),
-- accounts made before #61, and everyone again when the wording changes. Returning users never see it.
--
-- Rows are only added by accept_terms() below, with the database's clock, and nobody can change or delete
-- them afterwards. That makes this a better record than user metadata, which users can edit themselves.
-- Rows are deleted with the account (#85), like everything else about the person.

CREATE TABLE IF NOT EXISTS public.terms_acceptances (
    user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    -- TERMS_VERSION from frontend/src/lib/legal.ts
    version TEXT NOT NULL CHECK (char_length(version) BETWEEN 1 AND 50),
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Agreeing to the same version again keeps the first time
    PRIMARY KEY (user_id, version)
);

ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own terms agreements" ON public.terms_acceptances;
CREATE POLICY "Users can read their own terms agreements"
ON public.terms_acceptances
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- Read only for users: rows are added through accept_terms(), never written directly
REVOKE ALL ON public.terms_acceptances FROM anon, authenticated;
GRANT SELECT ON public.terms_acceptances TO authenticated;

-- The "I agree" button. SECURITY DEFINER because users can't insert into the table themselves,
-- so the time always comes from the database, not the browser.
CREATE OR REPLACE FUNCTION public.accept_terms(p_version TEXT)
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
    INSERT INTO public.terms_acceptances (user_id, version) VALUES (me, p_version)
    ON CONFLICT DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_terms(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.accept_terms(TEXT) TO authenticated;
