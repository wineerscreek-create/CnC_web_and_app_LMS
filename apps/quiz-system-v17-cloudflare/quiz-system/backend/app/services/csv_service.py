"""
CSV upload validation for question banks.

Expected columns (case-insensitive, spaces/underscores interchangeable):
Question, Image, OptionA, OptionB, OptionC, OptionD, Correct, Marks, Negative

Rules enforced (per spec):
- Missing options       -> at least OptionA and OptionB must be present
- Duplicate questions   -> exact-text duplicates within the same file
- Invalid answer        -> Correct must reference an option that exists
- Blank question        -> Question text required
- Invalid marks         -> Marks must be a positive number; Negative must be <= 0

Only a wholly-valid CSV is accepted -- matching "Only valid CSV accepted."
in the spec, i.e. we don't do partial imports.
"""
import csv
import io
import uuid

from app.models.schemas import CSVValidationError, CSVValidationResult
from app.memory.store import QuestionRecord

REQUIRED_COLUMNS = ["question", "optiona", "optionb", "correct", "marks"]

COLUMN_ALIASES = {
    "question": "question",
    "img": "image", "image": "image",
    "optiona": "optiona", "option_a": "optiona", "a": "optiona",
    "optionb": "optionb", "option_b": "optionb", "b": "optionb",
    "optionc": "optionc", "option_c": "optionc", "c": "optionc",
    "optiond": "optiond", "option_d": "optiond", "d": "optiond",
    "correct": "correct", "answer": "correct",
    "marks": "marks", "mark": "marks", "score": "marks",
    "negative": "negative", "negative_marks": "negative",
    "eedi_index": "eedi_index", "eediindex": "eedi_index", "index": "eedi_index", "eedi_idx": "eedi_index",
    "eedi_term": "eedi_term", "eediterm": "eedi_term", "term": "eedi_term", "pillar": "eedi_term",
}


def _normalize_dict_row(raw_row: dict) -> dict:
    normalized = {}
    for col, val in raw_row.items():
        if col is None:
            continue
        key = str(col).strip().lower().replace(" ", "_")
        mapped = COLUMN_ALIASES.get(key.replace("_", ""), COLUMN_ALIASES.get(key, key))
        normalized[mapped] = str(val).strip() if val is not None else ""
    return normalized


def parse_and_validate_csv(file_bytes: bytes) -> tuple[CSVValidationResult, list[QuestionRecord]]:
    errors: list[CSVValidationError] = []
    questions: list[QuestionRecord] = []

    try:
        text = file_bytes.decode("utf-8-sig")
        reader = list(csv.DictReader(io.StringIO(text)))
    except Exception as exc:
        return CSVValidationResult(valid_rows=0, invalid_rows=0, accepted=False,
                                    errors=[CSVValidationError(row=0, reason=f"Could not parse CSV: {exc}")]), []

    if not reader:
        return CSVValidationResult(valid_rows=0, invalid_rows=0, accepted=False,
                                    errors=[CSVValidationError(row=0, reason="Empty CSV file")]), []

    # Check header on first row
    first_normalized = _normalize_dict_row(reader[0])
    # Also check keys present across reader fieldnames
    field_keys = {COLUMN_ALIASES.get(str(f).strip().lower().replace(" ", "_").replace("_", ""), COLUMN_ALIASES.get(str(f).strip().lower().replace(" ", "_"), str(f).strip().lower())) for f in (reader[0].keys() if reader else []) if f}
    missing_cols = [c for c in REQUIRED_COLUMNS if c not in field_keys and c not in first_normalized]
    if missing_cols:
        return CSVValidationResult(
            valid_rows=0, invalid_rows=len(reader), accepted=False,
            errors=[CSVValidationError(row=0, reason=f"Missing required column(s): {', '.join(missing_cols)}")]
        ), []

    seen_questions = set()

    for idx, raw_row in enumerate(reader):
        row_num = idx + 2  # +1 for 0-index, +1 for header row
        row = _normalize_dict_row(raw_row)
        question_text = str(row.get("question", "")).strip()
        option_a = str(row.get("optiona", "")).strip()
        option_b = str(row.get("optionb", "")).strip()
        option_c = str(row.get("optionc", "")).strip()
        option_d = str(row.get("optiond", "")).strip()
        correct_raw = str(row.get("correct", "")).strip().upper()
        marks_raw = str(row.get("marks", "")).strip()
        negative_raw = str(row.get("negative", "0")).strip() or "0"
        image = str(row.get("image", "")).strip() or None
        eedi_index_raw = str(row.get("eedi_index", "")).strip()
        eedi_term_raw = str(row.get("eedi_term", "")).strip()

        # Blank question
        if not question_text:
            errors.append(CSVValidationError(row=row_num, reason="Blank question"))
            continue

        # Duplicate question (exact text match, case-insensitive)
        norm_q = question_text.lower()
        if norm_q in seen_questions:
            errors.append(CSVValidationError(row=row_num, reason="Duplicate question"))
            continue

        # Missing options -- A and B are mandatory, C/D optional (true/false etc.)
        options = {}
        if option_a:
            options["A"] = option_a
        if option_b:
            options["B"] = option_b
        if option_c:
            options["C"] = option_c
        if option_d:
            options["D"] = option_d

        if "A" not in options or "B" not in options:
            errors.append(CSVValidationError(row=row_num, reason="Missing options (A and B are required)"))
            continue

        # Invalid answer
        correct_keys = [c.strip() for c in correct_raw.replace(";", ",").split(",") if c.strip()]
        if not correct_keys or any(k not in options for k in correct_keys):
            errors.append(CSVValidationError(row=row_num, reason="Invalid answer (Correct references a non-existent option)"))
            continue

        # Invalid marks
        try:
            marks = float(marks_raw)
            if marks <= 0:
                raise ValueError()
        except ValueError:
            errors.append(CSVValidationError(row=row_num, reason="Invalid marks (must be a positive number)"))
            continue

        try:
            negative = float(negative_raw)
        except ValueError:
            errors.append(CSVValidationError(row=row_num, reason="Invalid negative marks"))
            continue
        if negative > 0:
            negative = -abs(negative)  # store as a negative value (or zero)

        eedi_index = None
        if eedi_index_raw:
            try:
                eedi_index = int(eedi_index_raw)
                if eedi_index < 0:
                    raise ValueError()
            except ValueError:
                errors.append(CSVValidationError(row=row_num, reason="Invalid eedi_index (must be an integer >= 0)"))
                continue

        eedi_term = eedi_term_raw if eedi_term_raw else None

        seen_questions.add(norm_q)
        questions.append(QuestionRecord(
            id=str(uuid.uuid4()),
            question=question_text,
            image=image,
            options=options,
            correct=correct_keys,
            marks=marks,
            negative=negative,
            question_type="mcq_multiple" if len(correct_keys) > 1 else "mcq_single",
            eedi_index=eedi_index,
            eedi_term=eedi_term,
        ))

    result = CSVValidationResult(
        valid_rows=len(questions),
        invalid_rows=len(errors),
        errors=errors,
        accepted=len(errors) == 0 and len(questions) > 0,
    )
    return result, (questions if result.accepted else [])
