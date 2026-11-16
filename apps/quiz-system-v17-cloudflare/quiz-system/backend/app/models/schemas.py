"""
Pydantic request/response models. These are transport-layer shapes only --
the authoritative in-memory record types live in app/memory/store.py as
plain dataclasses.
"""
from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, EmailStr


# ---------------------------------------------------------------- enums ----

class AdminRole(str, Enum):
    super_admin = "super_admin"
    faculty = "faculty"
    observer = "observer"


class QuizStatus(str, Enum):
    draft = "draft"
    scheduled = "scheduled"
    live = "live"
    ended = "ended"
    archived = "archived"


class QuestionType(str, Enum):
    mcq_single = "mcq_single"
    mcq_multiple = "mcq_multiple"
    true_false = "true_false"
    numerical = "numerical"
    fill_blank = "fill_blank"


class WarningType(str, Enum):
    fullscreen_exit = "fullscreen_exit"
    tab_switch = "tab_switch"
    camera_off = "camera_off"
    devtools_open = "devtools_open"
    copy_paste = "copy_paste"
    right_click = "right_click"
    multiple_faces = "multiple_faces"
    no_face = "no_face"
    phone_detected = "phone_detected"


# ------------------------------------------------------------- auth --------

class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: AdminRole
    username: str


class StudentJoinRequest(BaseModel):
    quiz_code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=120)
    roll_number: str = Field(min_length=1, max_length=64)
    device_id: str = Field(min_length=8, description="Client-generated stable device fingerprint")


class StudentJoinResponse(BaseModel):
    access_token: str
    session_id: str
    name: str
    roll_number: str
    quiz_name: str
    duration_seconds: int
    remaining_seconds: float
    total_questions: int
    camera_required: bool
    fullscreen_required: bool


# --------------------------------------------------------- quiz settings ---

class QuizSettings(BaseModel):
    quiz_name: str
    quiz_code: str
    duration_minutes: int = Field(gt=0)
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    random_questions: bool = True
    random_options: bool = True
    negative_marking: bool = True
    passing_marks: float = 0
    maximum_students: Optional[int] = None
    camera_required: bool = True
    fullscreen_required: bool = True
    max_warnings: int = 3


class QuizCreateRequest(BaseModel):
    settings: QuizSettings


class QuizUpdateRequest(BaseModel):
    settings: QuizSettings


# ------------------------------------------------------------- questions ---

class QuestionCSVRow(BaseModel):
    """One row of the admin-uploaded CSV, pre-validation."""
    question: str
    image: Optional[str] = None
    option_a: str
    option_b: str
    option_c: Optional[str] = None
    option_d: Optional[str] = None
    correct: str
    marks: float
    negative: float = 0
    eedi_index: Optional[int] = None
    eedi_term: Optional[str] = None


class CSVValidationError(BaseModel):
    row: int
    reason: str


class CSVValidationResult(BaseModel):
    valid_rows: int
    invalid_rows: int
    errors: list[CSVValidationError]
    accepted: bool


# ---------------------------------------------------------------- answers --

class SaveAnswerRequest(BaseModel):
    question_id: str
    selected_options: list[str] = Field(default_factory=list)
    numerical_answer: Optional[str] = None
    marked_for_review: bool = False
    time_spent_seconds: float = 0


class WarningEvent(BaseModel):
    warning_type: WarningType
    detail: Optional[str] = None


class SubmitQuizRequest(BaseModel):
    reason: str = "manual"  # manual | auto_timeout | auto_warning_limit | forced_by_admin
