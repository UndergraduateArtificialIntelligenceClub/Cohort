# The deadline shape the AI parser returns. Keep it in sync with frontend/src/types.ts.

import re
from typing import Literal

from pydantic import BaseModel, field_validator

Category = Literal["assignment", "lab", "quiz", "midterm", "final", "other"]

TIME_PATTERN = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$")


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


# What POST /parse and POST /parse-pdf return
class ParseResponse(BaseModel):
    deadlines: list[Deadline]
    instructor: str | None = None  # e.g. "Dr. Smith". None when the syllabus doesn't say
