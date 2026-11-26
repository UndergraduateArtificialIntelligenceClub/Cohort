# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Cohort is a UAIS (University of Alberta) student project: upload a syllabus, an AI parses its deadlines onto a calendar, and students can share course syllabi and find study buddies. The repo is public and worked on by a student team; see CONTRIBUTING.md for their workflow.

## Commands

Frontend (React 19 + TypeScript + Vite + Tailwind 4), from `frontend/`:
```bash
npm run dev      # http://localhost:5173
npm run lint     # eslint
npm run build    # tsc -b && vite build; this is also the type check
```

Backend (FastAPI, Python 3.10+), from `backend/` with the venv active:
```bash
pip install -r requirements.txt
uvicorn main:app --reload        # http://127.0.0.1:8000
```

CI (`.github/workflows/ci.yml`) runs `npm run lint`, `npm run build` and `python -c "import main, models"`. There is no unit test runner. Database checks are plain SQL scripts in `supabase/scripts/` (for example `test_unique_deadlines.sql`) that run inside a transaction and roll back.

The app runs without any keys: with no Supabase keys, the frontend skips login in dev, and the backend skips the auth check locally (but refuses when `FRONTEND_URL` is set, which means deployed).

## Architecture

- **frontend/**: deployed on Vercel. Each page is its own file in `src/pages/` (Calendar, Upload, StudyBuddy, Login); `App.tsx` holds the routes and nav. On phones the pages are bottom tabs. Popups and sheets live in `src/components/`.
- **frontend/src/lib/**: all data access and rules, no UI. Pages call these; they don't call Supabase directly. There's one Supabase client, in `lib/supabase.ts`. `lib/planner.ts` holds the calendar sidebar's pure date logic.
- **backend/**: deployed on Render. Its only job is parsing: `POST /parse` and `POST /parse-pdf` send syllabus text to Gemini (`google-genai`) with `ParseResponse`'s JSON schema and validate the reply. It checks the caller's Supabase login token so only logged-in users use the Gemini quota. Everything else (saving, library, study buddy) goes from the frontend straight to Supabase.
- **supabase/migrations/**: the schema, row-level security and Postgres functions. Writes that involve other users (study buddy matching, block/report, the library use count, push subscriptions) go through `SECURITY DEFINER` RPCs instead of direct table access. Migrations are applied by hand in the Supabase SQL Editor, in filename order, so write new ones to be safe to run twice (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP ... IF EXISTS` before `CREATE TRIGGER`/`POLICY`). Each file starts with a comment explaining what it does and why.
- **supabase/functions/send-notifications/**: a Deno Edge Function. A `pg_cron` job (`kick_notifications()`, every minute) calls it with `NOTIFY_SECRET` when something is due; SQL (`claim_due_notifications`) decides what's due, and `compose.ts` turns rows into notification text. `frontend/public/sw.js` displays the pushes. The README's Notifications section has the setup steps.

## Rules that span files

- **Deadline shape:** `frontend/src/types.ts` and `backend/models.py` must match for parser fields. Change both in the same PR. Saved deadlines also allow `course: null`, `category: "personal"` and `source_text: null` (dates users add themselves), which the parser never returns, so these exist only on the frontend and in the database.
- **Personal items:** `course IS NULL` is the only marker of a personal item (`isPersonal()` in `lib/courses.ts`, and the generated `personal` column in SQL). Never store them under a made-up course name. Anything keyed on course must skip them: study buddy, the course library, Next up, "Did you finish?" and the sidebar's Overdue items, the sidebar's study buddy links, the crunch forecast (hell week), and the 3-day reminder heads-up.
- **Course names** are stored normalized ("cmput  174" → "CMPUT 174"). `normalizeCourse()` in `lib/courses.ts` and the CHECK in `20261118120000_shared_syllabi.sql` must stay the same rule.
- **Dates** are `YYYY-MM-DD` strings. Day arithmetic uses whole UTC days (see `lib/planner.ts`). Server-side "today", reminders and quiet hours use Edmonton time. A deadline's optional `time` (`HH:MM`, Edmonton wall-clock: due time, or an exam's start time) sits next to `date`; it orders items within a day and is shown, but day logic never uses it, and null means unknown, not 11:59 PM.
- **Privacy:** study buddy only ever shows a first name, never an email; notifications show who and which course, never message text. The shared library never shows who uploaded something.
- **Styling:** colors and sizes are CSS variables in `src/index.css`, used through Tailwind (`text-ink-2`, `bg-subtle`, `border-border`, `text-accent`) or the shared classes (`.btn`, `.input`, `.panel`, ...). Don't add raw hex colors in components.

## Conventions

- Branches: `feat/short-name` or `fix/short-name`. PRs are squash-merged into `main` and say `Closes #<issue>`.
- Python packages: add only the new package to `requirements.txt`, pinned by hand. Never `pip freeze >`.
- Comments and user-facing text are plain English and explain why, often naming the issue number (`#67`). Follow that style.
- Anything that needs manual setup on Supabase or Vercel (running a migration, redeploying a function, new secrets or env vars) goes in the README and in the PR description.
