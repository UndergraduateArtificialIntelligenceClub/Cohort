import os
from datetime import date, datetime
from functools import lru_cache
from zoneinfo import ZoneInfo
from threading import Lock
from urllib.parse import urlsplit
from icalendar import Calendar
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google import genai
import httpx
from pydantic import BaseModel, ValidationError
from pypdf import PdfReader 

from models import ParseResponse, Deadline


MAX_TEXT_LENGTH = 100_000
MAX_PDF_SIZE = 10_000_000   # 10 MB limit
MAX_DAILY_PARSES = 20
daily_parse_counts = dict()

parse_counts_lock = Lock()


CANVAS_HOSTNAME = "canvas.ualberta.ca"
CANVAS_TIMEZONE = ZoneInfo("America/Edmonton")

load_dotenv()
MODEL = "gemini-3.5-flash-lite"

app = FastAPI()

origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
if os.getenv("FRONTEND_URL"):
    origins.append(os.getenv("FRONTEND_URL"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ParseRequest(BaseModel):
    text: str


class CanvasImportRequest(BaseModel):
    url: str


SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


def check_parse_allowance(user_id: str) -> None:
    # Track each user's usage separately for each server calendar day.
    key = (user_id, date.today())

    # Keep checking and incrementing together so concurrent requests cannot claim the same remaining allowance.
    with parse_counts_lock:
        count = daily_parse_counts.get(key, 0)

        if count >= MAX_DAILY_PARSES:
            raise HTTPException(status_code=429, detail="You've hit today's upload limit, try again tomorrow")

        daily_parse_counts[key] = count + 1


def require_user(authorization: str | None = Header(default=None)) -> dict:
    """Check the login token with Supabase, so only logged in users can spend our Gemini quota."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        # No Supabase keys in backend/.env: allow it locally so teammates can still work on parsing,
        # like the frontend does. FRONTEND_URL is only set on the deployed backend, so refuse there.
        if os.getenv("FRONTEND_URL"):
            raise HTTPException(status_code=500, detail="Supabase isn't set up on the backend.")
        return {}
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Please log in first.")
    try:
        res = httpx.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"Authorization": authorization, "apikey": SUPABASE_KEY},
            timeout=10,
        )
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="Couldn't reach Supabase to check your login. Try again.")
    if res.status_code != 200:
        raise HTTPException(status_code=401, detail="Your login expired. Please log in again.")
    return res.json()


def validate_canvas_url(url: str) -> None:
    try:
        parsed_url = urlsplit(url)
        port = parsed_url.port
    except ValueError:
        # malformed URLs and invalid ports should produce a client error.
        raise HTTPException(status_code=400, detail="Invalid Canvas calendar URL.") from None

    if (
        parsed_url.scheme != "https"
        or parsed_url.hostname != CANVAS_HOSTNAME
        or port not in (None, 443)
        or parsed_url.username is not None
        or parsed_url.password is not None
    ):
        raise HTTPException(status_code=400, detail="Please provide an HTTPS calendar feed URL from canvas.ualberta.ca.")


def extract_canvas_course(summary: str) -> str | None:
    # Canvas puts the course in brackets after the event name, e.g. "Assignment 1 [CMPUT 174 ...]".
    # Subjects can be more than one word ("MEC E 250", "CH E 243"), so allow spaces inside the subject.
    match = re.search(r"\[\s*([A-Z]+(?:\s[A-Z]+)*)\s+(\d{3})\b", summary, flags=re.IGNORECASE)

    if match is None:
        # No course tag usually means the student's own Canvas event. Return None so the caller skips it,
        # instead of saving it under a made-up course that study buddy and the library would treat as real (#62).
        return None

    # Same rule as normalizeCourse() in frontend/src/lib/courses.ts: single spaces, upper case.
    subject = " ".join(match.group(1).split()).upper()
    return f"{subject} {match.group(2)}"


def strip_canvas_course(summary: str) -> str:
    # The calendar already shows the course, so drop the trailing "[CMPUT 174 ...]" from the title.
    title = re.sub(r"\s*\[[^\]]*\]\s*$", "", summary).strip()
    return title or summary.strip()


def infer_canvas_category(title: str) -> str:
    # Classify the assessment name; the title has already had the course tag removed.
    assessment_title = title.lower()

    if re.search(r"\bmid[\s-]?term\b", assessment_title):
        return "midterm"

    # "Final project" or "final report" is coursework, not the final exam.
    if re.search(r"\bfinal\b(?!\s+(?:project|paper|report|assignment|presentation))", assessment_title):
        return "final"

    if re.search(r"\bquiz(?:zes)?\b", assessment_title):
        return "quiz"

    if re.search(r"\b(?:lab|labs|laboratory)\b", assessment_title):
        return "lab"

    if re.search(
        r"\b(?:assignment|homework|project|problem\s+set)\b",
        assessment_title,
    ):
        return "assignment"

    return "other"


def format_canvas_date(value: date | datetime) -> str:
    if isinstance(value, datetime):
        # Convert timezone-aware timestamps before choosing the calendar day.
        if value.tzinfo is not None:
            value = value.astimezone(CANVAS_TIMEZONE)

        return value.date().isoformat()

    # Date-only values already identify the intended calendar day.
    return value.isoformat()

@lru_cache(maxsize=1)
def get_client() -> genai.Client:
    """Create the Gemini client once, on first use, and reuse it after."""
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not set. Add it to backend/.env (see .env.example).",
        )
    return genai.Client(api_key=key)


def gemini_error(e: Exception) -> HTTPException:
    """Turn a Gemini crash into a clear message for the frontend."""
    message = str(e)
    if "429" in message:
        return HTTPException(status_code=429, detail="Out of Gemini requests for now. Try again later.")
    if "503" in message:
        return HTTPException(status_code=503, detail="Gemini is busy right now. Try again in a minute.")
    return HTTPException(status_code=502, detail="Something went wrong talking to Gemini.")


def extract_deadlines(text: str) -> ParseResponse:
    """The shared brain: syllabus text in, deadlines out."""
    today = date.today()
    prompt = (
        "Extract every graded deadline from this syllabus text. "
        # Fields, in the same order as the Deadline model
        "course is the course code, like CMPUT 174. "
        "title is the item's name as written in the syllabus, like Assignment 2. "
        "Every deadline must have a unique title. If the syllabus doesn't number them, number them in date order (Quiz 1, Quiz 2, ...). "
        "Write dates as YYYY-MM-DD. If a date has no year, use the year of the term named in the syllabus "
        "(e.g., Winter 2026 -> 2026). "
        f"If no term is given, use the year {today.year}. "
        "category must be one of: assignment, lab, quiz, midterm, final, other. "
        "source_text is the exact sentence from the syllabus this deadline came from, copied word for word, unchanged. "
        "weight is the percent of the final grade for that one item, e.g. 15. If a group is given as a total "
        "(9 quizzes worth 18%), divide it (2 each). Use null if not stated. "
        "instructor lists every instructor named in the syllabus (one syllabus often covers several sections "
        "with different instructors), as written, separated by commas, or null if none is given. "
        # Rules about what to include and skip
        "Only include items with a specific date. Skip anything TBA or with no date. Never guess a date. "
        "If several dates are listed for one kind of item, make one deadline per date "
        "(e.g., 'Labs: Sept 10, 17, 24, Oct 1 (20% total)' -> four lab deadlines, 5% each). "
        "Ignore dates that are not deadlines: publication dates, document dates, add/drop deadlines, holidays. "
        "Ignore unfilled template text, such as 'Assignment [X] is due on [DATE].' "
        "If there is a range of dates, use the last date (e.g., 'Oct 1-5' -> Oct 5). "
        "If something is optional, like a bonus assignment, include it. "
        "if it has bonus points, include them in the weight with note (optional) in the title. "
        "\n\nSyllabus text:\n"
        + text
    )

    # Get the shared client (created on the first request).
    client = get_client()

    # Ask Gemini. Only the network call is in this try.
    try:
        interaction = client.interactions.create(
            model=MODEL,
            input=prompt,
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": ParseResponse.model_json_schema(),
            },
        )
        raw = interaction.output_text
    except Exception as e:
        raise gemini_error(e)

    # Check Gemini's answer has the right shape.
    try:
        result = ParseResponse.model_validate_json(raw)
    except ValidationError as e:
        first = e.errors()[0]
        where = ".".join(str(part) for part in first["loc"])
        raise HTTPException(
            status_code=502,
            detail=f"Gemini returned deadlines in an unexpected format ({where}: {first['msg']}). Try again.",
        )

    return result


@app.get("/")
def home():
    return {"message": "Backend is alive"}


@app.post("/parse", response_model=ParseResponse)
def parse(req: ParseRequest, user: dict = Depends(require_user)):
    if req.text.strip() == "":
        raise HTTPException(status_code=400, detail="No syllabus text provided.")

    if len(req.text) > MAX_TEXT_LENGTH:
        raise HTTPException(status_code=413, detail="That text is too long. Please shorten it to 100,000 characters or fewer.")

    if user:
        check_parse_allowance(user["id"])

    return extract_deadlines(req.text)


@app.post("/parse-pdf", response_model=ParseResponse)
def parse_pdf(file: UploadFile, user: dict = Depends(require_user)):
    file_size = file.size

    # If upload metadata has no size, measure the underlying binary file.
    if file_size is None:
        original_position = file.file.tell()

        try:
            file.file.seek(0, 2)  # Move to the end, where the byte position equals the size.
            file_size = file.file.tell()
        finally:
            # Restore the position so subsequent reads start where expected.
            file.file.seek(original_position)

    if file_size > MAX_PDF_SIZE:
        raise HTTPException(status_code=413, detail="That PDF is too big, try pasting the text.")
    
    try:
        reader = PdfReader(file.file)
        text = ""

        for page in reader.pages:
            page_text = page.extract_text()
            if page_text is not None:
                text += page_text + "\n"

    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Couldn't read this PDF, try pasting the text."
        )
    if not text.strip():
        raise HTTPException(
            status_code=400, 
            detail="Couldn't read this PDF, try pasting the text."
        )

    if user:
        check_parse_allowance(user["id"])

    return extract_deadlines(text)

@app.delete("/account", status_code=204)
def delete_account(user: dict = Depends(require_user)):
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Please log in first.")
    try:
        res = httpx.delete(
            f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
            headers={"Authorization": f"Bearer {SUPABASE_KEY}", "apikey": SUPABASE_KEY},
            timeout=10,
        )
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="Couldn't reach Supabase. Try again.")
    if res.status_code not in (200, 204):
        raise HTTPException(status_code=502, detail="Couldn't delete your account. Try again.")


@app.post("/import-canvas", response_model=ParseResponse)
def import_canvas(req: CanvasImportRequest, user: dict = Depends(require_user)):
    validate_canvas_url(req.url)

    try:
        response = httpx.get(
            req.url,
            timeout=10,
            follow_redirects=False,
        )

        # Reject unsuccessful responses before processing their contents.
        response.raise_for_status()

    except httpx.InvalidURL:
        raise HTTPException(status_code=400, detail="Invalid Canvas calendar URL.") from None

    except httpx.HTTPError:
        raise HTTPException(
            status_code=502,
            detail=(
                "Couldn't download your Canvas calendar. "
                "Check the feed link and try again."
            )
        ) from None

    calendar_data = response.content

    try:
        calendar = Calendar.from_ical(calendar_data)
    except ValueError:
        raise HTTPException(status_code=400, detail="Couldn't read this calendar. Check your Canvas feed link.")

     # Confirm the downloaded content represents a calendar.
    if calendar.name != "VCALENDAR":
        raise HTTPException(status_code=400, detail="The feed link did not return a valid calendar.")

    deadlines = []

    for event in calendar.walk("VEVENT"):
        summary = str(event.get("SUMMARY", "")).strip()
        course = extract_canvas_course(summary)

        # Skip events with no title or no course tag (see extract_canvas_course).
        if not summary or course is None:
            continue

        title = strip_canvas_course(summary)

        try:
            start = event.decoded("DTSTART")
        except (KeyError, ValueError):
            # Skip events whose date is missing or cannot be decoded.
            continue

        # This accepts both date and datetime objects.
        if not isinstance(start, date):
            continue

        deadlines.append(
            Deadline(
                course=course,
                title=title,
                date=format_canvas_date(start),
                category=infer_canvas_category(title),
                source_text=summary,
                weight=None,
            )
        )

    return ParseResponse(
        deadlines=deadlines,
        instructor=None,
    )
    
