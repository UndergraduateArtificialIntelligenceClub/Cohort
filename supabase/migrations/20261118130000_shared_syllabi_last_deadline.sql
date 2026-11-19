-- Course library (#66): hide a shared syllabus once its last deadline has passed,
-- instead of after a fixed number of days. Search filters on last_deadline >= today.
-- Run after 20261118120000_shared_syllabi.sql.

-- The latest deadline date in the shared list. Only the trigger below sets it; users can't write it.
ALTER TABLE public.shared_syllabi ADD COLUMN IF NOT EXISTS last_deadline DATE;

-- The latest "date" in a shared deadlines list, or null if there are none.
-- Dates come from the review popup's date input, so they're always YYYY-MM-DD.
CREATE OR REPLACE FUNCTION public.shared_syllabi_last_deadline(deadlines JSONB)
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT max((d ->> 'date')::date)
    FROM jsonb_array_elements(deadlines) AS d
    WHERE d ->> 'date' ~ '^\d{4}-\d{2}-\d{2}$';
$$;

CREATE OR REPLACE FUNCTION public.shared_syllabi_set_last_deadline()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.last_deadline := public.shared_syllabi_last_deadline(NEW.deadlines);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shared_syllabi_set_last_deadline ON public.shared_syllabi;
CREATE TRIGGER shared_syllabi_set_last_deadline
BEFORE INSERT OR UPDATE OF deadlines ON public.shared_syllabi
FOR EACH ROW EXECUTE FUNCTION public.shared_syllabi_set_last_deadline();

-- Fill it in for rows shared before this migration
UPDATE public.shared_syllabi
SET last_deadline = public.shared_syllabi_last_deadline(deadlines);

-- Search now filters on last_deadline, not updated_at
DROP INDEX IF EXISTS public.shared_syllabi_updated_idx;
CREATE INDEX IF NOT EXISTS shared_syllabi_last_deadline_idx ON public.shared_syllabi (last_deadline);
