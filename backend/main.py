import os
from datetime import date
from functools import lru_cache

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google import genai
import httpx
from pydantic import BaseModel, ValidationError
from pypdf import PdfReader 

from models import ParseResponse

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


SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


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
    return extract_deadlines(req.text)


@app.post("/parse-pdf", response_model=ParseResponse)
def parse_pdf(file: UploadFile, user: dict = Depends(require_user)):
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