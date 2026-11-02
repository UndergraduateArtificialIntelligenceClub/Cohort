CREATE TABLE IF NOT EXISTS public.deadlines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course TEXT NOT NULL,
    title TEXT NOT NULL,
    date DATE NOT NULL,
    category TEXT NOT NULL CHECK (
        category IN ('assignment', 'lab', 'quiz', 'midterm', 'final', 'other')
    ),
    source_text TEXT NOT NULL,
    weight DOUBLE PRECISION,
    done BOOLEAN NOT NULL DEFAULT FALSE,
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_deadlines_user
        FOREIGN KEY (user_id)
        REFERENCES auth.users(id)
        ON DELETE CASCADE
);

-- Enable row-level access control using the policies below.
ALTER TABLE public.deadlines ENABLE ROW LEVEL SECURITY;

-- Allow signed-in users to read only their own deadlines.
CREATE POLICY "Users can read their own deadlines"
ON public.deadlines
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- Require new deadlines to belong to the signed-in user.
CREATE POLICY "Users can insert their own deadlines"
ON public.deadlines
FOR INSERT
TO authenticated
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Allow users to edit their own deadlines while preventing
-- ownership from being transferred to another user.
CREATE POLICY "Users can update their own deadlines"
ON public.deadlines
FOR UPDATE
TO authenticated
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

-- Allow signed-in users to delete only their own deadlines.
CREATE POLICY "Users can delete their own deadlines"
ON public.deadlines
FOR DELETE
TO authenticated
USING ((SELECT auth.uid()) = user_id);

