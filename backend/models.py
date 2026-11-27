# The deadline shape the AI parser returns. Keep it in sync with frontend/src/types.ts.

import re
from typing import Literal

from pydantic import BaseModel, field_validator

Category = Literal["assignment", "lab", "quiz", "midterm", "final", "other"]

TIME_PATTERN = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$")


def round_weight(value: float | None) -> float | None:
    """Round a split weight to two decimals: 5% over 7 due dates is 0.71 each, not 0.7142857142857143,
    which the calendar would otherwise print as is."""
    return None if value is None else round(value, 2)


class Deadline(BaseModel):
    course: str                  # e.g. "CMPUT 174"
    title: str                   # e.g. "Assignment 2"
    date: str                    # "YYYY-MM-DD"
    time: str | None = None      # "HH:MM", 24-hour: due time, or an exam's start time. None when not given
    category: Category
    source_text: str             # the exact sentence from the syllabus
    weight: float | None = None  # percent of final grade, e.g. 15. None when unknown

    @field_validator("time", mode="before")
    @classmethod
    def clean_time(cls, value: object) -> str | None:
        """Turn "9:00" or "09:00:00" into "09:00". Anything else becomes None.

        A time Gemini wrote wrong (like "11:59 PM") is dropped instead of failing the whole syllabus,
        because the date is still right and the student can add the time in the review popup.
        """
        if not isinstance(value, str):
            return None
        match = TIME_PATTERN.match(value.strip())
        if not match:
            return None
        return f"{int(match.group(1)):02d}:{match.group(2)}"

    @field_validator("weight")
    @classmethod
    def clean_weight(cls, value: float | None) -> float | None:
        return round_weight(value)


# A graded item the syllabus gives no date for: a final exam the Registrar schedules later, participation,
# anything "TBA". The review popup warns about these so the student can add a date; ones they skip aren't saved.
class UndatedItem(BaseModel):
    course: str
    title: str
    category: Category
    source_text: str
    weight: float | None = None

    @field_validator("weight")
    @classmethod
    def clean_weight(cls, value: float | None) -> float | None:
        return round_weight(value)


# What Gemini is asked to return (its JSON schema is sent with the prompt), and what POST /import-canvas returns
class ParseResponse(BaseModel):
    deadlines: list[Deadline]
    undated: list[UndatedItem] = []
    instructor: str | None = None  # e.g. "Dr. Smith". None when the syllabus doesn't say


# What POST /parse and POST /parse-pdf return: the above plus the text that was read, so the review popup
# can warn when a course name the student typed doesn't appear in the syllabus. Kept off ParseResponse,
# or Gemini would be asked to copy the whole syllabus back.
class SyllabusParse(ParseResponse):
    text: str
