# Cohort

A UAIS project

## Stack
- Frontend: React + TypeScript (Vite), Tailwind
- Backend: FastAPI (Python)
- Auth & Database: Supabase
- Deployment: Vercel & Render

## Run it locally

You need Node 22 or newer (check with `node -v`), Python 3.10 or newer, and git.

### 1. Clone
```bash
git clone https://github.com/UndergraduateArtificialIntelligenceClub/Cohort
cd Cohort
```
Already use SSH with GitHub? Clone with `git@github.com:UndergraduateArtificialIntelligenceClub/Cohort` instead.

### 2. Env files
Copy the two example files. The copies are where your keys go, and git ignores them so they never get committed.
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```
- `GEMINI_API_KEY` (backend): make your own free key at [Google AI Studio](https://aistudio.google.com/apikey). Only needed for parsing work.
- `SUPABASE_*` (both files): ask the project lead on Discord. They're in Supabase under Project Settings → API. Only needed for database and login work.
- Never paste keys into code, issues, PRs or public channels. This repo is public.

The app runs without any keys filled in. You only need the ones for the issue you're working on.

### 3. Backend (terminal 1)
```bash
cd backend
python3 -m venv venv              # Windows: python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### 4. Frontend (terminal 2)
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. If it says "Backend is alive", you're set up.

### Next time you work on it
You only need to create the venv and install once. After that:
```bash
cd backend
source venv/bin/activate          # Windows: venv\Scripts\activate
uvicorn main:app --reload
```
and in a second terminal:
```bash
cd frontend
npm run dev
```

## Data shape
Every deadline looks like this, in both the frontend ([frontend/src/types.ts](frontend/src/types.ts)) and the backend ([backend/models.py](backend/models.py)). If you change it, change both files in the same pull request.

| Field | Type | Example |
|---|---|---|
| `course` | string | `"CMPUT 174"` |
| `title` | string | `"Assignment 2"` |
| `date` | string, `YYYY-MM-DD` | `"2026-10-15"` |
| `time` | string `HH:MM` (24-hour, Edmonton time) or null (optional): when it's due, or when an exam starts. null when the syllabus doesn't say | `"23:59"` |
| `category` | `assignment`, `lab`, `quiz`, `midterm`, `final`, or `other` | `"assignment"` |
| `source_text` | string, the exact sentence from the syllabus | `"Assignment 2 is due October 15."` |
| `weight` | number or null (optional), percent of final grade | `15` |

```json
{
  "course": "CMPUT 174",
  "title": "Assignment 2",
  "date": "2026-10-15",
  "time": "23:59",
  "category": "assignment",
  "source_text": "Assignment 2 is due October 15 at 11:59 PM and is worth 15% of your final grade.",
  "weight": 15
}
```

Saved deadlines can also be dates people add themselves on the calendar. Those have `source_text: null`, and personal ones (a dentist appointment, a shift) also have `course: null`, `category: "personal"` and `weight: null`. The parser never returns these, so `backend/models.py` doesn't have them. Anything keyed on course (study buddy, the course library) leaves personal items out. See [supabase/migrations/20261122000000_own_dates.sql](supabase/migrations/20261122000000_own_dates.sql).

`time` is a time of day next to `date`, not a timestamp: everything that works on days (the sidebar, reminders, the unique key) only looks at `date`. A missing time is shown as no time, never as "11:59 PM". See [supabase/migrations/20261124120000_due_times.sql](supabase/migrations/20261124120000_due_times.sql).

Each person's course colors are saved in `course_colors`, so adding or removing a course never changes the others' colors, and clicking a course chip's color dot above the calendar picks a new one (clicking the course name shows or hides that course). A saved color is a position in the 12-color palette in [frontend/src/lib/courseColors.ts](frontend/src/lib/courseColors.ts), not a hex value. Run [supabase/migrations/20261126120000_course_colors.sql](supabase/migrations/20261126120000_course_colors.sql) in the SQL Editor to turn this on. Until then the calendar uses the old alphabetical colors, and picking a color shows an error.

`POST /parse` and `POST /parse-pdf` return a `SyllabusParse`:

```
{
  "deadlines": [ ...Deadline objects like the one above... ],
  "undated": [
    {
      "course": "CMPUT 174",
      "title": "Final exam",
      "category": "final",
      "source_text": "Final exam (40%): date and time set by the Office of the Registrar.",
      "weight": 40
    }
  ],
  "instructor": "Dr. Smith",
  "text": "CMPUT 174: Introduction to ..."
}
```

`undated` lists graded items the syllabus gives no date for (a final scheduled later, participation, anything TBA). The review popup warns about each one so the student can add a date. Ones they skip aren't saved, and dates they add aren't shared to the course library. `instructor` is `null` when the syllabus doesn't name one. `text` is the syllabus text that was read (the first 100,000 characters), so the review popup can warn when a course name the student typed doesn't appear in it.

Gemini only gets `ParseResponse`'s schema (`deadlines`, `undated`, `instructor`), so it's never asked to copy the text back. `POST /import-canvas` returns a `ParseResponse` with `undated` always empty.

Course names are stored normalized: trimmed, upper case, single spaces, and a space where the subject's letters first meet the number (`"cmput174"` → `"CMPUT 174"`, while `"INT D 137B"` stays as it is). The rule is `normalizeCourse()` in [frontend/src/lib/courses.ts](frontend/src/lib/courses.ts) and `public.normalize_course()` in [supabase/migrations/20261127120000_course_code_spacing.sql](supabase/migrations/20261127120000_course_code_spacing.sql), which every table's CHECK uses. To set it up, deploy the frontend first, then run that migration (an older page saving `"cmput174"` would be refused). [supabase/scripts/test_course_code_spacing.sql](supabase/scripts/test_course_code_spacing.sql) checks it.

## Terms and Privacy
The Terms of Service and Privacy Policy are [frontend/src/pages/Terms.tsx](frontend/src/pages/Terms.tsx) and [frontend/src/pages/Privacy.tsx](frontend/src/pages/Privacy.tsx). They open logged out too, so people can read them before signing up. After login, anyone who hasn't agreed to the current version gets one screen asking them to, before the app opens. That covers new accounts (Google or email), older accounts, and everyone again when the wording changes. Agreements are saved in `terms_acceptances` by the `accept_terms()` function, with the database's time, and users can't change them.

To set it up, run [supabase/migrations/20261127130000_terms_acceptances.sql](supabase/migrations/20261127130000_terms_acceptances.sql) **before** deploying the frontend. Without it, every logged in user is stuck on the agree screen. [supabase/scripts/test_terms_acceptances.sql](supabase/scripts/test_terms_acceptances.sql) checks it.

When the wording changes, change `TERMS_VERSION` and `LEGAL_UPDATED` in [frontend/src/lib/legal.ts](frontend/src/lib/legal.ts). Everyone is asked to agree again. While the version starts with `draft`, the pages show a "Draft, not final" banner.

## Launch metrics
`/admin` shows the team the numbers that say whether launch is working. It isn't in the nav, and only accounts in `metrics_admins` can load it. Everything on it is a total from `admin_metrics()`, with the team's own accounts left out. It never shows names, emails or anyone's own data, as the Privacy Policy promises.

Most numbers come from tables we already have. The rest come from small events the app logs through `log_event()` into `usage_events` ([frontend/src/lib/metrics.ts](frontend/src/lib/metrics.ts)): one app open per day, whether an upload or Canvas import worked, and how many dates people removed or fixed in the review popup. Events only hold counts. Never add syllabus text, deadlines, course names or messages to one, and update the Privacy Policy if you add a new kind.

What to watch, most important first:
- **Activated in 24h:** new accounts that saved a school deadline within a day. Signups that never get a calendar don't count.
- **Courses per student:** 4 or 5 means they rely on Cohort for the term. 1 means they tried it.
- **Uploads:** how many reads fail, and how many dates people remove before saving. That's how accurate the parser really is.
- **Biggest courses:** the library and study buddy only work once a course has enough students.
- **Active this week, week 1 and week 4 retention, notifications on, study buddy chats where both people wrote.**

To see where signups come from, put `?utm_source=` on every link you share, for example `https://<app>/?utm_source=reddit`, `discord`, `instagram` or `poster` (use a QR code for posters). The app keeps the first source a new account arrived with.

To set it up, run [supabase/migrations/20261127140000_usage_events.sql](supabase/migrations/20261127140000_usage_events.sql), after the Terms and Privacy one, then deploy the frontend. If the frontend goes first nothing breaks, but events are lost until the migration runs. Then add each team member who should see the page, in the SQL Editor:

```sql
INSERT INTO public.metrics_admins (user_id)
SELECT id FROM auth.users WHERE email = 'you@ualberta.ca' ON CONFLICT DO NOTHING;
```

Then run [supabase/migrations/20261127150000_admin_metrics_since.sql](supabase/migrations/20261127150000_admin_metrics_since.sql) **before** deploying the frontend that goes with it, or `/admin` shows an error until it runs. It makes the page say when counting started: active students, uploads and retention only exist from then, so earlier days show as "not recorded" instead of 0. It also adds the "Include team accounts" switch, so you can check your own activity is being recorded. [supabase/scripts/test_usage_events.sql](supabase/scripts/test_usage_events.sql) checks both.

## Notifications
Cohort sends push notifications: a reminder the evening before everything on your calendar, personal dates included (plus 3 days' notice for exams and anything worth 15% or more; personal dates never get this), and study buddy alerts for new matches and messages. The installed app's icon also shows how many study buddy chats are unread.

How it fits together:
- [frontend/public/sw.js](frontend/public/sw.js) shows the notifications. [frontend/src/lib/notifications.ts](frontend/src/lib/notifications.ts) turns them on and off.
- [supabase/migrations/20261121120000_notifications.sql](supabase/migrations/20261121120000_notifications.sql) decides what's due. A `pg_cron` job checks every minute.
- [supabase/functions/send-notifications](supabase/functions/send-notifications) sends the pushes.

Working on something else? You can skip all of this. Without `VITE_VAPID_PUBLIC_KEY`, the Notifications panel just says it isn't set up.

### Testing notifications locally
1. Ask the project lead for `VITE_VAPID_PUBLIC_KEY` and add it to `frontend/.env`.
2. Open http://localhost:5173 in Chrome or Edge (iPhones only get notifications from the Home Screen app, so use the live site for those).
3. Turn them on from the bell in the top bar.

### Setting it up on a Supabase project (project lead, once)
1. Run the migration. It turns on `pg_cron` and `pg_net` and schedules the job.
2. Make the keys. This prints a private `VAPID_KEYS` and a public `VITE_VAPID_PUBLIC_KEY`:
   ```bash
   node supabase/scripts/generate-vapid-keys.mjs
   ```
3. Deploy the function and give it its secrets. Pick any long random string for `NOTIFY_SECRET` (e.g. `openssl rand -hex 32`):
   ```bash
   supabase functions deploy send-notifications --no-verify-jwt
   supabase secrets set VAPID_KEYS='<from step 2>' NOTIFY_SECRET='<random string>' VAPID_CONTACT='mailto:<a team email>'
   ```
4. Tell the database where the function is. Run this in the Supabase SQL editor, using the same `NOTIFY_SECRET`:
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'cohort_functions_url');
   select vault.create_secret('<random string>', 'cohort_notify_secret');
   ```
5. Add `VITE_VAPID_PUBLIC_KEY` to Vercel's environment variables and redeploy the frontend.

Already set up before due times were added? Run [20261124120000_due_times.sql](supabase/migrations/20261124120000_due_times.sql), then redeploy the function (`supabase functions deploy send-notifications --no-verify-jwt`) so reminders say the time. [supabase/scripts/test_due_times.sql](supabase/scripts/test_due_times.sql) checks the migration.

Check it's working: Supabase dashboard → Edge Functions → send-notifications → Logs. Each run logs how many notifications it sent. If you make new VAPID keys later, everyone has to turn notifications on again.

## Team
- Matthew Wang (project lead)
- Wasi Abbas
- Mark Liu
- Omer Abdelwahab
- Kyle
- Ruba Abbasi
- Alice Yin
- Namish Moduga

## Contributing
Read [CONTRIBUTING.md](CONTRIBUTING.md) before your first pull request.
