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

