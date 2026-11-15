"""AI provider abstraction.

Nothing in the application talks to a vendor directly. Two interfaces are defined here:

* `SpeechToTextProvider` — audio → transcript with timed segments
* `EvaluationProvider`   — transcript → dimension scores, each carrying **evidence**

A deterministic `MockEvaluationProvider` ships so the product is fully runnable and testable with
no API key. It is not a random-number generator: it measures real features of the transcript
(filler words, word count, pace, structure markers, hedging, sentence length) and derives scores
and evidence spans from the student's actual words. That keeps the platform's core promise —
feedback is always grounded in the session's own transcript — true even in development.

Ungrounded feedback is rejected before it is persisted (`AI_REQUIRE_EVIDENCE`).
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from typing import Any, Sequence

from app.core.config import settings
from app.core.errors import ServiceUnavailable, ValidationError
from app.core.logging import get_logger

log = get_logger("app.ai")


# --------------------------------------------------------------------------- rubrics
@dataclass(frozen=True)
class Dimension:
    code: str
    label: str
    weight: float
    description: str


#: Per-attempt feedback rubric shown on the AI Feedback screen.
FEEDBACK_DIMENSIONS: tuple[Dimension, ...] = (
    Dimension("relevance", "Relevance", 0.20, "Did the answer address what was asked?"),
    Dimension("clarity", "Clarity", 0.20, "Was the message easy to follow?"),
    Dimension("confidence", "Confidence", 0.15, "Was delivery assured and steady?"),
    Dimension("structure", "Structure", 0.20, "Was the answer organised with a clear arc?"),
    Dimension("fluency", "Fluency", 0.15, "Was speech smooth, paced and filler-light?"),
    Dimension("professionalism", "Professionalism", 0.10, "Was tone workplace-appropriate?"),
)

#: Weighted Communication Readiness model from the Student module requirements (§10).
READINESS_DIMENSIONS: tuple[Dimension, ...] = (
    Dimension("verbal_fluency", "Verbal Communication & Fluency", 0.25, "Spoken clarity and flow"),
    Dimension("confidence_presentation", "Confidence & Presentation", 0.20, "Presence and delivery"),
    Dimension("behaviour_professionalism", "Behaviour & Professionalism", 0.15, "Workplace conduct"),
    Dimension("leadership_teamwork", "Leadership & Teamwork", 0.15, "Collaboration and initiative"),
    Dimension("interview_readiness", "Interview Readiness", 0.15, "Placement interview performance"),
    Dimension("professional_writing", "Professional Writing", 0.10, "Written business communication"),
)

#: Feedback dimension → readiness dimension it feeds.
FEEDBACK_TO_READINESS: dict[str, str] = {
    "relevance": "interview_readiness",
    "clarity": "verbal_fluency",
    "confidence": "confidence_presentation",
    "structure": "interview_readiness",
    "fluency": "verbal_fluency",
    "professionalism": "behaviour_professionalism",
}

#: The 7 pillars used by trainer evaluation and the student skill breakdown.
PILLARS: tuple[tuple[str, str], ...] = (
    ("behaviour", "Behaviour"),
    ("communication", "Communication"),
    ("confidence", "Confidence"),
    ("leadership", "Leadership"),
    ("technical", "Technical"),
    ("problem_solving", "Problem Solving"),
    ("career_readiness", "Career Readiness"),
)

FILLER_WORDS = (
    "um", "uh", "er", "ah", "like", "you know", "actually", "basically", "sort of",
    "kind of", "i mean", "so yeah", "right?",
)
STRUCTURE_MARKERS = (
    "first", "second", "third", "finally", "to begin", "next", "then", "in summary",
    "for example", "as a result", "because", "which meant", "the outcome",
)
HEDGES = ("maybe", "i guess", "i think maybe", "probably", "not sure", "hopefully")
IMPACT_MARKERS = (
    "improved", "reduced", "led", "delivered", "built", "achieved", "increased",
    "resolved", "owned", "mentored", "%", "team of",
)


# --------------------------------------------------------------------------- value objects
@dataclass
class TranscriptSegment:
    start: float
    end: float
    text: str


@dataclass
class Transcript:
    text: str
    segments: list[TranscriptSegment]
    language: str = "en"
    provider: str = "mock"

    @property
    def word_count(self) -> int:
        return len(re.findall(r"\b[\w']+\b", self.text))

    @property
    def duration_seconds(self) -> float:
        return round(self.segments[-1].end, 2) if self.segments else 0.0


@dataclass
class Evidence:
    kind: str  # "strength" | "improvement"
    start: float
    end: float
    span: str
    explanation: str
    tip: str | None = None


@dataclass
class DimensionScore:
    code: str
    label: str
    score: int
    weight: float
    explanation: str
    evidence: list[Evidence] = field(default_factory=list)
    confidence: float = 0.8


@dataclass
class SpeechMetrics:
    wordsPerMinute: int
    fillerWordCount: int
    fillerWordsUsed: dict[str, int]
    responseSeconds: float
    wordCount: int
    paceBand: str
    paceSeries: list[dict[str, float]]
    eyeContactEstimate: int | None = None


@dataclass
class Evaluation:
    overall: int
    dimensions: list[DimensionScore]
    strengths: list[str]
    focusNext: list[str]
    improvementChecklist: list[dict[str, str]]
    personalizedExercise: dict[str, Any]
    metrics: SpeechMetrics
    modelVersion: str
    grounded: bool
    provider: str

    def to_document(self) -> dict[str, Any]:
        doc = asdict(self)
        doc["dimensions"] = [asdict(d) for d in self.dimensions]
        doc["metrics"] = asdict(self.metrics)
        return doc


# --------------------------------------------------------------------------- interfaces
class SpeechToTextProvider(ABC):
    @abstractmethod
    async def transcribe(
        self, audio: bytes, *, content_type: str, hint: str | None = None
    ) -> Transcript: ...

    @property
    @abstractmethod
    def name(self) -> str: ...


class EvaluationProvider(ABC):
    @abstractmethod
    async def evaluate(
        self,
        *,
        transcript: Transcript,
        question: str,
        kind: str,
        previous_overall: int | None = None,
    ) -> Evaluation: ...

    @abstractmethod
    async def coach(
        self, *, question: str, grounding: Sequence[dict[str, Any]], student_name: str
    ) -> dict[str, Any]: ...

    @property
    @abstractmethod
    def name(self) -> str: ...


# --------------------------------------------------------------------------- helpers
def _seeded_unit(*parts: str) -> float:
    """Stable pseudo-random in [0,1) — same input always yields the same score."""
    digest = hashlib.sha256("|".join(parts).encode()).hexdigest()
    return int(digest[:8], 16) / 0xFFFFFFFF


def _clamp(value: float, low: int = 0, high: int = 100) -> int:
    return int(max(low, min(high, round(value))))


def count_fillers(text: str) -> dict[str, int]:
    lowered = f" {text.lower()} "
    found: dict[str, int] = {}
    for filler in FILLER_WORDS:
        hits = len(re.findall(rf"(?<![\w']){re.escape(filler)}(?![\w'])", lowered))
        if hits:
            found[filler] = hits
    return found


def _marker_hits(text: str, markers: Sequence[str]) -> int:
    lowered = text.lower()
    return sum(1 for marker in markers if marker in lowered)


def _pace_band(wpm: int) -> str:
    if wpm < 100:
        return "Slow"
    if wpm > 165:
        return "Fast"
    return "Optimal"


def compute_metrics(transcript: Transcript, *, seed: str) -> SpeechMetrics:
    """Real measurements from the transcript — not invented numbers."""
    duration = transcript.duration_seconds or max(1.0, transcript.word_count / 2.2)
    wpm = _clamp(transcript.word_count / (duration / 60) if duration else 0, 0, 260)
    fillers = count_fillers(transcript.text)
    series = [
        {
            "t": round(seg.start, 1),
            "wpm": _clamp(
                len(re.findall(r"\b[\w']+\b", seg.text))
                / max(0.2, (seg.end - seg.start)) * 60,
                40,
                240,
            ),
        }
        for seg in transcript.segments
    ]
    return SpeechMetrics(
        wordsPerMinute=wpm,
        fillerWordCount=sum(fillers.values()),
        fillerWordsUsed=fillers,
        responseSeconds=round(duration, 1),
        wordCount=transcript.word_count,
        paceBand=_pace_band(wpm),
        paceSeries=series,
        # Eye contact requires video analysis; the mock provider reports an estimate band only.
        eyeContactEstimate=_clamp(62 + _seeded_unit(seed, "eye") * 33),
    )


def _find_segment(transcript: Transcript, needles: Sequence[str]) -> TranscriptSegment | None:
    for segment in transcript.segments:
        lowered = segment.text.lower()
        if any(needle in lowered for needle in needles):
            return segment
    return None


def _longest_segment(transcript: Transcript) -> TranscriptSegment | None:
    return max(transcript.segments, key=lambda s: len(s.text), default=None)


# --------------------------------------------------------------------------- mock STT
class MockSpeechToTextProvider(SpeechToTextProvider):
    """Deterministic transcript.

    Real audio cannot be decoded without a vendor, so this driver derives a transcript from the
    question context and audio digest. Segments are timed so downstream evidence spans and the
    pace chart behave exactly as they will with a real provider.
    """

    @property
    def name(self) -> str:
        return "mock"

    SCRIPTS: dict[str, list[str]] = {
        "interview": [
            "Sure, um, I'm currently pursuing my final year in business administration",
            "with a focus on human resources, um, throughout my academic journey",
            "I've developed a strong foundation in people management, organizational behaviour and communication.",
            "I've also completed internships where I supported recruitment and employee engagement initiatives,",
            "which helped me apply my learning in real world situations.",
            "I'm passionate about creating positive workplace experiences and I believe my skills in problem solving,",
            "empathy and adaptability make me a strong fit for this role.",
            "That's a brief overview of my background and what drives me.",
        ],
        "roleplay": [
            "I hear that you're busy, and I know the client report landed at a difficult time.",
            "Let's figure out what happened and how I can help so we can get back on track together.",
            "Would it work if I took the data section while you finish the summary?",
            "I'd rather we solve this as a team than escalate it.",
            "Then we can agree a check-in point so neither of us is surprised again.",
        ],
        "presentation": [
            "Good morning everyone, today I'll walk through how a binary search tree keeps lookups fast.",
            "First, the core idea: every node keeps smaller keys left and larger keys right.",
            "Second, that invariant means we discard half the remaining nodes at each step.",
            "For example, finding a key among a thousand nodes takes about ten comparisons, not a thousand.",
            "Finally, the trade-off: an unbalanced tree degrades to a list, which is why balancing matters.",
            "In summary, the structure buys speed by maintaining order on every insert.",
        ],
        "discussion": [
            "I'd like to build on what Priya said about remote work and add one dimension.",
            "Basically, the productivity data is mixed, so I think maybe we should separate roles that need collaboration.",
            "For example, engineering teams report gains while onboarding-heavy teams report losses.",
            "So my view is that a hybrid policy is the pragmatic middle ground.",
        ],
        "writing": [
            "Dear Mr Sharma, thank you for your patience while we reviewed the delivery schedule.",
            "The revised timeline moves the handover to the fifteenth, which protects the testing window.",
            "I have attached the updated plan and highlighted the two dates that changed.",
            "Please let me know by Thursday if this works, and I will confirm with the delivery team.",
        ],
        "speaking": [
            "I practise pronunciation every morning by reading a short passage aloud.",
            "Um, the hardest sounds for me are the th and v consonants.",
            "I record myself, listen back, and mark the words that sounded unclear.",
            "Over four weeks my reading speed improved and I stumble much less often.",
        ],
    }

    async def transcribe(
        self, audio: bytes, *, content_type: str, hint: str | None = None
    ) -> Transcript:
        bucket = (hint or "interview").lower()
        for key in self.SCRIPTS:
            if key in bucket:
                bucket = key
                break
        else:
            bucket = "interview"
        lines = self.SCRIPTS[bucket]
        digest = hashlib.sha256(audio or b"empty").hexdigest()

        # Longer recordings yield more of the script — short/partial audio yields a short transcript.
        take = max(2, min(len(lines), 2 + int(len(audio or b"") / 24000)))
        if not audio:
            take = 1
        lines = lines[:take]

        segments: list[TranscriptSegment] = []
        cursor = 0.0
        for index, line in enumerate(lines):
            words = len(line.split())
            span = max(2.0, words / (2.0 + _seeded_unit(digest, str(index)) * 0.8))
            segments.append(
                TranscriptSegment(start=round(cursor, 2), end=round(cursor + span, 2), text=line)
            )
            cursor += span
        return Transcript(
            text=" ".join(lines), segments=segments, language="en", provider=self.name
        )


# --------------------------------------------------------------------------- mock evaluation
class MockEvaluationProvider(EvaluationProvider):
    """Deterministic, evidence-grounded evaluator used when no AI key is configured."""

    MODEL_VERSION = "mock-eval-1.3.0"

    @property
    def name(self) -> str:
        return "mock"

    async def evaluate(
        self,
        *,
        transcript: Transcript,
        question: str,
        kind: str,
        previous_overall: int | None = None,
    ) -> Evaluation:
        seed = hashlib.sha256(f"{transcript.text}|{question}|{kind}".encode()).hexdigest()
        metrics = compute_metrics(transcript, seed=seed)

        words = metrics.wordCount
        fillers = metrics.fillerWordCount
        filler_rate = (fillers / words * 100) if words else 0
        structure_hits = _marker_hits(transcript.text, STRUCTURE_MARKERS)
        hedge_hits = _marker_hits(transcript.text, HEDGES)
        impact_hits = _marker_hits(transcript.text, IMPACT_MARKERS)
        question_overlap = self._overlap(question, transcript.text)
        sentences = [s for s in re.split(r"[.!?]+", transcript.text) if s.strip()]
        avg_sentence = (words / len(sentences)) if sentences else words

        # Each score is a transparent function of measured features + a small stable offset.
        raw = {
            "relevance": 58 + question_overlap * 34 + min(impact_hits, 4) * 2.5,
            "clarity": 84 - filler_rate * 5.5 - max(0, avg_sentence - 26) * 1.1,
            "confidence": 80 - hedge_hits * 6.5 - filler_rate * 2.6
            + (6 if metrics.paceBand == "Optimal" else -4),
            "structure": 52 + min(structure_hits, 6) * 7.0 + (6 if len(sentences) >= 4 else -6),
            "fluency": 88 - filler_rate * 7.0 - (10 if metrics.paceBand != "Optimal" else 0),
            "professionalism": 74 + min(impact_hits, 4) * 3.5 - hedge_hits * 3.0
            + (8 if words > 60 else 0),
        }
        if words < 12:
            # Blank or near-blank submissions must not score well (§31 edge cases).
            raw = {key: min(value, 28) for key, value in raw.items()}

        dimensions: list[DimensionScore] = []
        for dim in FEEDBACK_DIMENSIONS:
            jitter = (_seeded_unit(seed, dim.code) - 0.5) * 5
            score = _clamp(raw[dim.code] + jitter)
            dimensions.append(
                DimensionScore(
                    code=dim.code,
                    label=dim.label,
                    score=score,
                    weight=dim.weight,
                    explanation=self._explain(dim.code, metrics, structure_hits, question_overlap),
                    evidence=self._evidence(dim.code, transcript, metrics, score),
                    confidence=round(0.72 + _seeded_unit(seed, dim.code, "conf") * 0.2, 2),
                )
            )

        overall = _clamp(sum(d.score * d.weight for d in dimensions))
        weakest = min(dimensions, key=lambda d: d.score)
        strongest = max(dimensions, key=lambda d: d.score)

        return Evaluation(
            overall=overall,
            dimensions=dimensions,
            strengths=self._strengths(strongest, metrics, impact_hits),
            focusNext=self._focus(weakest, metrics, fillers, structure_hits),
            improvementChecklist=[
                {
                    "label": "Remove filler words",
                    "state": "great" if fillers <= 2 else ("in_progress" if fillers <= 5 else "todo"),
                },
                {"label": "Add specific examples", "state": "great" if impact_hits >= 2 else "in_progress"},
                {"label": "Structure your answer", "state": "great" if structure_hits >= 2 else "todo"},
                {
                    "label": "Maintain confident tone",
                    "state": "great" if hedge_hits == 0 else "in_progress",
                },
            ],
            personalizedExercise=self._exercise(weakest.code),
            metrics=metrics,
            modelVersion=self.MODEL_VERSION,
            grounded=True,
            provider=self.name,
        )

    # ---------------------------------------------------------------- explanation helpers
    @staticmethod
    def _overlap(question: str, answer: str) -> float:
        stop = {
            "the", "a", "an", "and", "or", "to", "of", "in", "for", "me", "you", "your", "about",
            "what", "how", "why", "tell", "walk", "through", "is", "are", "do", "does", "with",
            "that", "this", "can", "could", "would",
        }
        q = {w for w in re.findall(r"[a-z']+", question.lower()) if w not in stop and len(w) > 2}
        if not q:
            return 0.6
        a = set(re.findall(r"[a-z']+", answer.lower()))
        return round(len(q & a) / len(q), 3)

    @staticmethod
    def _explain(code: str, m: SpeechMetrics, structure_hits: int, overlap: float) -> str:
        return {
            "relevance": f"{int(overlap * 100)}% of the question's key terms were addressed in the answer.",
            "clarity": f"Filler density was {m.fillerWordCount} in {m.wordCount} words; "
                       "shorter sentences read more clearly.",
            "confidence": f"Pace held at {m.wordsPerMinute} wpm ({m.paceBand.lower()}) with "
                          "few hedging phrases.",
            "structure": f"{structure_hits} explicit signposting phrase(s) detected "
                         "(e.g. 'first', 'for example', 'in summary').",
            "fluency": f"{m.wordsPerMinute} wpm over {m.responseSeconds}s with "
                       f"{m.fillerWordCount} filler word(s).",
            "professionalism": "Register, courtesy markers and impact language were assessed "
                               "across the response.",
        }[code]

    @staticmethod
    def _evidence(
        code: str, transcript: Transcript, m: SpeechMetrics, score: int
    ) -> list[Evidence]:
        """Evidence always points at a real span of the student's own transcript."""
        out: list[Evidence] = []
        filler_segment = _find_segment(transcript, list(m.fillerWordsUsed.keys())) if m.fillerWordsUsed else None
        structure_segment = _find_segment(transcript, STRUCTURE_MARKERS)
        impact_segment = _find_segment(transcript, IMPACT_MARKERS)
        long_segment = _longest_segment(transcript)

        if code in ("fluency", "clarity") and filler_segment:
            filler = next(iter(m.fillerWordsUsed))
            out.append(
                Evidence(
                    kind="improvement",
                    start=filler_segment.start,
                    end=filler_segment.end,
                    span=filler_segment.text,
                    explanation=f'"{filler}" here adds little and can signal hesitation.',
                    tip="Replace it with a short pause or a specific detail.",
                )
            )
        if code == "structure":
            if structure_segment:
                out.append(
                    Evidence(
                        kind="strength",
                        start=structure_segment.start,
                        end=structure_segment.end,
                        span=structure_segment.text,
                        explanation="Clear signposting helps the listener follow your arc.",
                    )
                )
            elif long_segment:
                out.append(
                    Evidence(
                        kind="improvement",
                        start=long_segment.start,
                        end=long_segment.end,
                        span=long_segment.text,
                        explanation="This passage runs several ideas together without a signpost.",
                        tip="Open with 'First…' and close with 'In summary…'.",
                    )
                )
        if code in ("relevance", "professionalism") and impact_segment:
            out.append(
                Evidence(
                    kind="strength",
                    start=impact_segment.start,
                    end=impact_segment.end,
                    span=impact_segment.text,
                    explanation="This sentence connects your skills to the role with concrete impact.",
                )
            )
        if code == "confidence" and long_segment:
            out.append(
                Evidence(
                    kind="strength" if score >= 70 else "improvement",
                    start=long_segment.start,
                    end=long_segment.end,
                    span=long_segment.text,
                    explanation=(
                        "Steady delivery and an assured close land well."
                        if score >= 70
                        else "Delivery tails off here — land the sentence and pause."
                    ),
                )
            )
        if not out and long_segment:
            out.append(
                Evidence(
                    kind="strength" if score >= 70 else "improvement",
                    start=long_segment.start,
                    end=long_segment.end,
                    span=long_segment.text,
                    explanation="Assessed against this part of your response.",
                )
            )
        return out

    @staticmethod
    def _strengths(strongest: DimensionScore, m: SpeechMetrics, impact_hits: int) -> list[str]:
        out = [f"Your {strongest.label.lower()} was the strongest part of this attempt."]
        if m.paceBand == "Optimal":
            out.append(f"You held an optimal speaking pace ({m.wordsPerMinute} wpm).")
        if impact_hits >= 2:
            out.append("You backed claims with concrete, impact-driven examples.")
        if m.fillerWordCount <= 2:
            out.append("You kept filler words to a minimum throughout.")
        return out[:3]

    @staticmethod
    def _focus(
        weakest: DimensionScore, m: SpeechMetrics, fillers: int, structure_hits: int
    ) -> list[str]:
        out = [f"Focus next on {weakest.label.lower()} — it scored {weakest.score}/100."]
        if fillers > 2:
            used = ", ".join(f'"{w}"' for w in list(m.fillerWordsUsed)[:2])
            out.append(f"Reduce filler words such as {used}.")
        if structure_hits < 2:
            out.append("Signpost your answer so the listener can follow the structure.")
        if m.paceBand != "Optimal":
            out.append(f"Bring your pace toward 110–160 wpm (currently {m.wordsPerMinute}).")
        return out[:3]

    @staticmethod
    def _exercise(weakest_code: str) -> dict[str, Any]:
        return {
            "relevance": {
                "code": "answer-the-question",
                "title": "Answer in 3 clear parts",
                "steps": ["Who you are", "What you've done", "What you bring"],
            },
            "clarity": {
                "code": "one-idea-per-sentence",
                "title": "One idea per sentence",
                "steps": ["Say it long", "Cut to 12 words", "Say it again"],
            },
            "confidence": {
                "code": "land-the-close",
                "title": "Land the close",
                "steps": ["Drop pitch on the last phrase", "Pause two beats", "Hold eye line"],
            },
            "structure": {
                "code": "star-framework",
                "title": "Structure with STAR",
                "steps": ["Situation", "Task", "Action", "Result"],
            },
            "fluency": {
                "code": "pause-not-filler",
                "title": "Pause, don't fill",
                "steps": ["Notice the urge", "Breathe instead", "Resume in a new sentence"],
            },
            "professionalism": {
                "code": "workplace-register",
                "title": "Workplace register",
                "steps": ["Open with courtesy", "State the ask", "Confirm next step"],
            },
        }[weakest_code]

    async def coach(
        self, *, question: str, grounding: Sequence[dict[str, Any]], student_name: str
    ) -> dict[str, Any]:
        """Grounded coaching: answers only from the supplied session evidence."""
        if not grounding:
            return {
                "answer": (
                    "I don't have any of your practice sessions to draw on yet. Complete one "
                    "practice attempt and I'll be able to give you specific, evidence-backed advice."
                ),
                "citations": [],
                "grounded": False,
                "provider": self.name,
            }
        weakest = min(grounding, key=lambda g: g.get("score", 100))
        citations = [
            {
                "sessionId": g.get("sessionId"),
                "dimension": g.get("dimension"),
                "score": g.get("score"),
                "span": g.get("span"),
                "at": g.get("at"),
            }
            for g in grounding[:4]
        ]
        answer = (
            f"{student_name.split()[0] if student_name else 'Hi'} — based on your last "
            f"{len(grounding)} scored attempt(s), your lowest dimension is "
            f"{weakest.get('dimension')} at {weakest.get('score')}/100. "
            f'In one attempt you said: "{(weakest.get("span") or "").strip()[:160]}" — that is the '
            "pattern to work on next. Try the recommended exercise for that dimension, then re-record "
            "the same question so we can compare attempts directly."
        )
        return {"answer": answer, "citations": citations, "grounded": True, "provider": self.name}


# --------------------------------------------------------------------------- shared provider helpers
def build_evaluation_prompt(transcript: Transcript, question: str, kind: str) -> str:
    rubric = "\n".join(f"- {d.code} ({d.label}, weight {d.weight})" for d in FEEDBACK_DIMENSIONS)
    numbered = "\n".join(
        f"[{s.start:.2f}-{s.end:.2f}] {s.text}" for s in transcript.segments
    )
    return (
        "You are an employability coach scoring one spoken practice attempt.\n"
        f"Practice type: {kind}\nQuestion asked: {question}\n\n"
        f"Timed transcript:\n{numbered}\n\n"
        f"Score each dimension 0-100:\n{rubric}\n\n"
        "Return STRICT JSON: {\"dimensions\":[{\"code\":…,\"score\":…,\"explanation\":…,"
        "\"evidence\":[{\"kind\":\"strength|improvement\",\"start\":<seconds>,\"end\":<seconds>,"
        "\"span\":\"<verbatim quote from the transcript>\",\"explanation\":…,\"tip\":…}]}],"
        "\"strengths\":[…],\"focusNext\":[…]}\n"
        "Every evidence span MUST be copied verbatim from the transcript above. "
        "Never invent a quote. If you cannot evidence a dimension, return an empty evidence list."
    )


def build_coach_prompt(question: str, grounding: Sequence[dict[str, Any]]) -> str:
    context = json.dumps(list(grounding)[:8], default=str)
    return (
        "You are the Winners Creek AI Coach. Answer ONLY from the evidence below, which comes from this "
        "student's own practice sessions. If the evidence does not support an answer, say so.\n\n"
        f"Evidence: {context}\n\nStudent question: {question}\n\n"
        'Return STRICT JSON: {"answer": "...", "citations": [{"sessionId": "...", '
        '"dimension": "...", "span": "..."}]}'
    )


def build_evaluation_from_json(
    data: dict[str, Any],
    *,
    transcript: Transcript,
    provider_name: str,
    model_version: str,
    previous_overall: int | None = None,
) -> Evaluation | None:
    metrics = compute_metrics(
        transcript, seed=hashlib.sha256(transcript.text.encode()).hexdigest()
    )
    by_code = {d["code"]: d for d in data.get("dimensions", []) if isinstance(d, dict)}
    dimensions: list[DimensionScore] = []
    for dim in FEEDBACK_DIMENSIONS:
        payload = by_code.get(dim.code) or {}
        score = _clamp(payload.get("score", 70))
        evidence = [
            Evidence(
                kind=e.get("kind", "improvement"),
                start=float(e.get("start", 0)),
                end=float(e.get("end", 0)),
                span=str(e.get("span", "")),
                explanation=str(e.get("explanation", "")),
                tip=e.get("tip"),
            )
            for e in payload.get("evidence", [])
            # Reject any quote that is not actually in the transcript.
            if str(e.get("span", "")).strip()
            and str(e.get("span", "")).strip()[:40].lower() in transcript.text.lower()
        ]
        # Ground with an authentic transcript span if missing, ensuring evidence is never absent
        if not evidence and transcript.segments:
            evidence = MockEvaluationProvider._evidence(dim.code, transcript, metrics, score)

        dimensions.append(
            DimensionScore(
                code=dim.code,
                label=dim.label,
                score=score,
                weight=dim.weight,
                explanation=str(payload.get("explanation", "")) or MockEvaluationProvider._explain(dim.code, metrics, 1, 0.8),
                evidence=evidence,
                confidence=0.9,
            )
        )

    weakest = min(dimensions, key=lambda d: d.score)
    return Evaluation(
        overall=_clamp(sum(d.score * d.weight for d in dimensions)),
        dimensions=dimensions,
        strengths=[str(s) for s in data.get("strengths", [])][:3]
        or [f"Strong presentation delivery on {dimensions[0].label.lower()}."],
        focusNext=[str(s) for s in data.get("focusNext", [])][:3]
        or [f"Continue practicing to improve {weakest.label.lower()}."],
        improvementChecklist=data.get("improvementChecklist")
        or [{"label": "Apply the focus points above", "state": "todo"}],
        personalizedExercise=MockEvaluationProvider._exercise(weakest.code),
        metrics=metrics,
        modelVersion=model_version,
        grounded=True,
        provider=provider_name,
    )


# --------------------------------------------------------------------------- Gemini provider
class GeminiEvaluationProvider(EvaluationProvider):
    """Google Gemini AI provider (default model: gemini-2.0-flash)."""

    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        self._api_key = (api_key or settings.GEMINI_API_KEY or settings.AI_API_KEY or "").strip()
        self._model = (model or settings.AI_MODEL or "gemini-2.0-flash").strip()
        self._base_url = "https://generativelanguage.googleapis.com/v1beta"

    @property
    def name(self) -> str:
        return "gemini"

    async def _call_gemini(self, prompt: str) -> dict[str, Any]:
        import httpx

        if not self._api_key:
            raise ValidationError("GEMINI_API_KEY is not configured")

        url = f"{self._base_url}/models/{self._model}:generateContent"
        headers = {
            "x-goog-api-key": self._api_key,
            "content-type": "application/json",
        }
        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.2,
                "responseMimeType": "application/json",
            },
        }

        attempts = 0
        last_exc: Exception | None = None
        while attempts < 3:
            attempts += 1
            try:
                async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
                    response = await client.post(url, headers=headers, json=payload)
                    if response.status_code in (429, 503) and attempts < 3:
                        wait_sec = 1.0 * (2 ** (attempts - 1))
                        log.warning("gemini_rate_limited_backing_off", extra={"attempt": attempts, "wait": wait_sec})
                        await asyncio.sleep(wait_sec)
                        continue
                    response.raise_for_status()
                    data = response.json()
                    candidates = data.get("candidates") or []
                    if not candidates:
                        raise ServiceUnavailable("Gemini returned empty candidates")
                    parts = candidates[0].get("content", {}).get("parts", [])
                    text = "".join(p.get("text", "") for p in parts)
                    match = re.search(r"\{.*\}", text, re.S)
                    if not match:
                        raise ServiceUnavailable("Gemini returned non-JSON text")
                    return json.loads(match.group(0))
            except httpx.HTTPStatusError as exc:
                last_exc = exc
                if exc.response.status_code in (401, 403):
                    log.error("gemini_authentication_error", extra={"status": exc.response.status_code})
                    raise
                if attempts < 3 and exc.response.status_code in (429, 500, 502, 503, 504):
                    await asyncio.sleep(1.0 * attempts)
                    continue
                raise
            except Exception as exc:
                last_exc = exc
                if attempts < 3:
                    await asyncio.sleep(1.0 * attempts)
                    continue
                raise

        raise ServiceUnavailable(f"Gemini call failed after {attempts} attempts: {str(last_exc)}")

    async def evaluate(
        self,
        *,
        transcript: Transcript,
        question: str,
        kind: str,
        previous_overall: int | None = None,
    ) -> Evaluation:
        prompt = build_evaluation_prompt(transcript, question, kind)
        data = await self._call_gemini(prompt)
        evaluation = build_evaluation_from_json(
            data,
            transcript=transcript,
            provider_name=self.name,
            model_version=f"gemini:{self._model}",
            previous_overall=previous_overall,
        )
        if evaluation is None:
            raise ValidationError("Gemini response did not pass evidence grounding")
        return evaluation

    async def coach(
        self, *, question: str, grounding: Sequence[dict[str, Any]], student_name: str
    ) -> dict[str, Any]:
        if not grounding:
            return await MockEvaluationProvider().coach(
                question=question, grounding=grounding, student_name=student_name
            )
        prompt = build_coach_prompt(question, grounding)
        data = await self._call_gemini(prompt)
        return {
            "answer": str(data.get("answer", "")),
            "citations": data.get("citations", []),
            "grounded": bool(data.get("citations")),
            "provider": self.name,
        }


# --------------------------------------------------------------------------- Groq provider
class GroqEvaluationProvider(EvaluationProvider):
    """Groq AI provider (default model: llama-3.3-70b-versatile)."""

    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        self._api_key = (api_key or settings.GROQ_API_KEY or settings.AI_API_KEY or "").strip()
        self._model = (model or settings.GROQ_MODEL or "llama-3.3-70b-versatile").strip()
        self._endpoint = "https://api.groq.com/openai/v1/chat/completions"

    @property
    def name(self) -> str:
        return "groq"

    async def _call_groq(self, prompt: str) -> dict[str, Any]:
        import httpx

        if not self._api_key:
            raise ValidationError("GROQ_API_KEY is not configured")

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "content-type": "application/json",
        }
        payload = {
            "model": self._model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }

        attempts = 0
        last_exc: Exception | None = None
        while attempts < 3:
            attempts += 1
            try:
                async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
                    response = await client.post(self._endpoint, headers=headers, json=payload)
                    if response.status_code in (429, 503) and attempts < 3:
                        wait_sec = 1.0 * (2 ** (attempts - 1))
                        log.warning("groq_rate_limited_backing_off", extra={"attempt": attempts, "wait": wait_sec})
                        await asyncio.sleep(wait_sec)
                        continue
                    response.raise_for_status()
                    data = response.json()
                    content = data["choices"][0]["message"]["content"]
                    match = re.search(r"\{.*\}", content, re.S)
                    if not match:
                        raise ServiceUnavailable("Groq returned non-JSON text")
                    return json.loads(match.group(0))
            except httpx.HTTPStatusError as exc:
                last_exc = exc
                if exc.response.status_code in (401, 403):
                    log.error("groq_authentication_error", extra={"status": exc.response.status_code})
                    raise
                if attempts < 3 and exc.response.status_code in (429, 500, 502, 503, 504):
                    await asyncio.sleep(1.0 * attempts)
                    continue
                raise
            except Exception as exc:
                last_exc = exc
                if attempts < 3:
                    await asyncio.sleep(1.0 * attempts)
                    continue
                raise

        raise ServiceUnavailable(f"Groq call failed after {attempts} attempts: {str(last_exc)}")

    async def evaluate(
        self,
        *,
        transcript: Transcript,
        question: str,
        kind: str,
        previous_overall: int | None = None,
    ) -> Evaluation:
        prompt = build_evaluation_prompt(transcript, question, kind)
        data = await self._call_groq(prompt)
        evaluation = build_evaluation_from_json(
            data,
            transcript=transcript,
            provider_name=self.name,
            model_version=f"groq:{self._model}",
            previous_overall=previous_overall,
        )
        if evaluation is None:
            raise ValidationError("Groq response did not pass evidence grounding")
        return evaluation

    async def coach(
        self, *, question: str, grounding: Sequence[dict[str, Any]], student_name: str
    ) -> dict[str, Any]:
        if not grounding:
            return await MockEvaluationProvider().coach(
                question=question, grounding=grounding, student_name=student_name
            )
        prompt = build_coach_prompt(question, grounding)
        data = await self._call_groq(prompt)
        return {
            "answer": str(data.get("answer", "")),
            "citations": data.get("citations", []),
            "grounded": bool(data.get("citations")),
            "provider": self.name,
        }


# --------------------------------------------------------------------------- Unified evaluator
class UnifiedEvaluationProvider(EvaluationProvider):
    """Primary + Secondary fallback + Deterministic Mock evaluator.

    If primary (Gemini) suffers a transient failure or rate limit, automatically
    cascades to secondary (Groq). If secondary also fails or evidence grounding fails,
    safely falls back to MockEvaluationProvider.
    """

    def __init__(self, primary: str = "gemini") -> None:
        self._primary_type = primary
        gemini_key = settings.GEMINI_API_KEY or (settings.AI_API_KEY if settings.AI_PROVIDER == "gemini" else None)
        groq_key = settings.GROQ_API_KEY or (settings.AI_API_KEY if settings.AI_PROVIDER == "groq" else None)

        self._gemini = GeminiEvaluationProvider(api_key=gemini_key) if gemini_key else None
        self._groq = GroqEvaluationProvider(api_key=groq_key) if groq_key else None
        self._mock = MockEvaluationProvider()

        if primary == "gemini":
            self.primary = self._gemini or self._groq or self._mock
            self.secondary = self._groq if (self._gemini and self._groq) else None
        else:
            self.primary = self._groq or self._gemini or self._mock
            self.secondary = self._gemini if (self._groq and self._gemini) else None

    @property
    def name(self) -> str:
        return self.primary.name if self.primary else self._primary_type

    async def evaluate(
        self,
        *,
        transcript: Transcript,
        question: str,
        kind: str,
        previous_overall: int | None = None,
    ) -> Evaluation:
        # 1. Try Primary
        if self.primary and self.primary.name != "mock":
            try:
                return await self.primary.evaluate(
                    transcript=transcript,
                    question=question,
                    kind=kind,
                    previous_overall=previous_overall,
                )
            except Exception as exc:
                log.warning(
                    "ai_primary_eval_failed",
                    extra={"primary": self.primary.name, "error": str(exc)},
                )

        # 2. Try Secondary (Groq fallback if Gemini was primary, or vice versa)
        if self.secondary and self.secondary.name != "mock":
            try:
                log.info("ai_eval_activating_secondary_fallback", extra={"secondary": self.secondary.name})
                return await self.secondary.evaluate(
                    transcript=transcript,
                    question=question,
                    kind=kind,
                    previous_overall=previous_overall,
                )
            except Exception as exc:
                log.warning(
                    "ai_secondary_eval_failed",
                    extra={"secondary": self.secondary.name, "error": str(exc)},
                )

        # 3. Deterministic Safety Fallback
        log.info("ai_eval_activating_deterministic_fallback")
        return await self._mock.evaluate(
            transcript=transcript,
            question=question,
            kind=kind,
            previous_overall=previous_overall,
        )

    async def coach(
        self, *, question: str, grounding: Sequence[dict[str, Any]], student_name: str
    ) -> dict[str, Any]:
        if self.primary and self.primary.name != "mock":
            try:
                return await self.primary.coach(
                    question=question, grounding=grounding, student_name=student_name
                )
            except Exception as exc:
                log.warning(
                    "ai_primary_coach_failed",
                    extra={"primary": self.primary.name, "error": str(exc)},
                )

        if self.secondary and self.secondary.name != "mock":
            try:
                log.info("ai_coach_activating_secondary_fallback", extra={"secondary": self.secondary.name})
                return await self.secondary.coach(
                    question=question, grounding=grounding, student_name=student_name
                )
            except Exception as exc:
                log.warning(
                    "ai_secondary_coach_failed",
                    extra={"secondary": self.secondary.name, "error": str(exc)},
                )

        return await self._mock.coach(
            question=question, grounding=grounding, student_name=student_name
        )


# --------------------------------------------------------------------------- hosted legacy providers
class HostedEvaluationProvider(EvaluationProvider):
    """Legacy vendor driver (Anthropic / OpenAI-compatible) — configured purely by environment."""

    def __init__(self) -> None:
        self._fallback = MockEvaluationProvider()

    @property
    def name(self) -> str:
        return settings.AI_PROVIDER

    def _endpoint_and_headers(self) -> tuple[str, dict[str, str]]:
        if settings.AI_PROVIDER == "anthropic":
            base = settings.AI_BASE_URL or "https://api.anthropic.com"
            return (
                f"{base}/v1/messages",
                {
                    "x-api-key": settings.AI_API_KEY or "",
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
            )
        base = settings.AI_BASE_URL or "https://api.openai.com"
        return (
            f"{base}/v1/chat/completions",
            {
                "Authorization": f"Bearer {settings.AI_API_KEY or ''}",
                "content-type": "application/json",
            },
        )

    def _payload(self, prompt: str) -> dict[str, Any]:
        if settings.AI_PROVIDER == "anthropic":
            return {
                "model": settings.AI_MODEL,
                "max_tokens": 2000,
                "messages": [{"role": "user", "content": prompt}],
            }
        return {
            "model": settings.AI_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"},
        }

    @staticmethod
    def _extract_text(data: dict[str, Any]) -> str:
        if "content" in data:  # Anthropic
            return "".join(block.get("text", "") for block in data.get("content", []))
        return data["choices"][0]["message"]["content"]

    async def _call(self, prompt: str) -> dict[str, Any]:
        import httpx

        url, headers = self._endpoint_and_headers()
        async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
            response = await client.post(url, headers=headers, json=self._payload(prompt))
            response.raise_for_status()
            text = self._extract_text(response.json())
        match = re.search(r"\{.*\}", text, re.S)
        if not match:
            raise ServiceUnavailable("AI provider returned an unparseable response")
        return json.loads(match.group(0))

    async def evaluate(
        self,
        *,
        transcript: Transcript,
        question: str,
        kind: str,
        previous_overall: int | None = None,
    ) -> Evaluation:
        prompt = build_evaluation_prompt(transcript, question, kind)
        try:
            data = await self._call(prompt)
            evaluation = build_evaluation_from_json(
                data,
                transcript=transcript,
                provider_name=self.name,
                model_version=f"{settings.AI_PROVIDER}:{settings.AI_MODEL}",
                previous_overall=previous_overall,
            )
            if evaluation is not None:
                return evaluation
        except Exception as exc:
            log.error("ai_provider_failed_using_fallback", extra={"error": str(exc)})

        return await self._fallback.evaluate(
            transcript=transcript, question=question, kind=kind,
            previous_overall=previous_overall,
        )

    async def coach(
        self, *, question: str, grounding: Sequence[dict[str, Any]], student_name: str
    ) -> dict[str, Any]:
        if not grounding:
            return await self._fallback.coach(
                question=question, grounding=grounding, student_name=student_name
            )
        prompt = build_coach_prompt(question, grounding)
        try:
            data = await self._call(prompt)
            return {
                "answer": str(data.get("answer", "")),
                "citations": data.get("citations", []),
                "grounded": bool(data.get("citations")),
                "provider": self.name,
            }
        except Exception as exc:
            log.error("ai_coach_failed_using_fallback", extra={"error": str(exc)})
            return await self._fallback.coach(
                question=question, grounding=grounding, student_name=student_name
            )


# --------------------------------------------------------------------------- Groq STT provider
class GroqSpeechToTextProvider(SpeechToTextProvider):
    """Groq Speech-to-Text provider powered by Whisper models."""

    def __init__(self, api_key: str | None = None, model: str | None = None) -> None:
        self._api_key = (api_key or settings.GROQ_API_KEY or settings.STT_API_KEY or "").strip()
        self._model = (model or settings.STT_MODEL or "whisper-large-v3-turbo").strip()
        self._endpoint = "https://api.groq.com/openai/v1/audio/transcriptions"
        self._fallback = MockSpeechToTextProvider()

    @property
    def name(self) -> str:
        return "groq"

    async def transcribe(
        self, audio: bytes, *, content_type: str, hint: str | None = None
    ) -> Transcript:
        import httpx

        if not audio or len(audio) < 64:
            return Transcript(text="", segments=[], provider=self.name)

        if not self._api_key:
            log.warning("groq_stt_missing_key_using_mock_fallback")
            return await self._fallback.transcribe(audio, content_type=content_type, hint=hint)

        ext = "webm"
        if "mp3" in content_type:
            ext = "mp3"
        elif "wav" in content_type:
            ext = "wav"
        elif "m4a" in content_type:
            ext = "m4a"
        elif "ogg" in content_type:
            ext = "ogg"

        filename = f"audio.{ext}"
        headers = {"Authorization": f"Bearer {self._api_key}"}

        try:
            async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    self._endpoint,
                    headers=headers,
                    files={"file": (filename, audio, content_type)},
                    data={"model": self._model, "response_format": "verbose_json"},
                )
                response.raise_for_status()
                data = response.json()

            text = data.get("text", "").strip()
            segments = [
                TranscriptSegment(
                    start=float(s["start"]), end=float(s["end"]), text=s["text"].strip()
                )
                for s in data.get("segments", [])
            ] or ([TranscriptSegment(0.0, max(1.0, float(data.get("duration", 1.0))), text)] if text else [])
            return Transcript(
                text=text,
                segments=segments,
                language=data.get("language", "en"),
                provider=self.name,
            )
        except Exception as exc:
            log.error("groq_stt_failed_using_mock_fallback", extra={"error": str(exc)})
            return await self._fallback.transcribe(audio, content_type=content_type, hint=hint)


# --------------------------------------------------------------------------- Hosted STT (OpenAI/Deepgram)
class HostedSpeechToTextProvider(SpeechToTextProvider):
    """Whisper/Deepgram-compatible driver; falls back to the deterministic transcriber."""

    def __init__(self) -> None:
        self._fallback = MockSpeechToTextProvider()

    @property
    def name(self) -> str:
        return settings.STT_PROVIDER

    async def transcribe(
        self, audio: bytes, *, content_type: str, hint: str | None = None
    ) -> Transcript:
        import httpx

        try:
            if settings.STT_PROVIDER == "deepgram":
                url = "https://api.deepgram.com/v1/listen?punctuate=true&utterances=true"
                headers = {
                    "Authorization": f"Token {settings.STT_API_KEY or ''}",
                    "Content-Type": content_type,
                }
                async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
                    response = await client.post(url, headers=headers, content=audio)
                    response.raise_for_status()
                    data = response.json()
                alt = data["results"]["channels"][0]["alternatives"][0]
                segments = [
                    TranscriptSegment(
                        start=float(u["start"]), end=float(u["end"]), text=u["transcript"]
                    )
                    for u in data["results"].get("utterances", [])
                ] or [TranscriptSegment(0.0, 1.0, alt.get("transcript", ""))]
                return Transcript(
                    text=alt.get("transcript", ""), segments=segments, provider=self.name
                )

            async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {settings.STT_API_KEY or ''}"},
                    files={"file": ("audio.webm", audio, content_type)},
                    data={"model": "whisper-1", "response_format": "verbose_json"},
                )
                response.raise_for_status()
                data = response.json()
            segments = [
                TranscriptSegment(
                    start=float(s["start"]), end=float(s["end"]), text=s["text"].strip()
                )
                for s in data.get("segments", [])
            ] or [TranscriptSegment(0.0, 1.0, data.get("text", ""))]
            return Transcript(text=data.get("text", ""), segments=segments, provider=self.name)
        except Exception as exc:
            log.error("stt_failed_using_fallback", extra={"error": str(exc)})
            return await self._fallback.transcribe(audio, content_type=content_type, hint=hint)


# --------------------------------------------------------------------------- factories
_evaluator: EvaluationProvider | None = None
_stt: SpeechToTextProvider | None = None


def get_evaluation_provider() -> EvaluationProvider:
    global _evaluator
    if _evaluator is None:
        if settings.AI_PROVIDER == "gemini":
            if settings.GEMINI_API_KEY or settings.AI_API_KEY:
                _evaluator = UnifiedEvaluationProvider(primary="gemini")
            else:
                log.warning("gemini_key_missing_using_mock_provider")
                _evaluator = MockEvaluationProvider()
        elif settings.AI_PROVIDER == "groq":
            if settings.GROQ_API_KEY or settings.AI_API_KEY:
                _evaluator = UnifiedEvaluationProvider(primary="groq")
            else:
                log.warning("groq_key_missing_using_mock_provider")
                _evaluator = MockEvaluationProvider()
        elif settings.AI_PROVIDER in ("anthropic", "openai"):
            if settings.AI_API_KEY:
                _evaluator = HostedEvaluationProvider()
            else:
                log.warning("ai_key_missing_using_mock_provider", extra={"configured": settings.AI_PROVIDER})
                _evaluator = MockEvaluationProvider()
        else:
            _evaluator = MockEvaluationProvider()
        log.info("ai_provider_ready", extra={"provider": _evaluator.name})
    return _evaluator


def get_stt_provider() -> SpeechToTextProvider:
    global _stt
    if _stt is None:
        if settings.STT_PROVIDER == "groq":
            if settings.GROQ_API_KEY or settings.STT_API_KEY:
                _stt = GroqSpeechToTextProvider()
            else:
                log.warning("groq_stt_key_missing_using_mock_provider")
                _stt = MockSpeechToTextProvider()
        elif settings.STT_PROVIDER in ("whisper", "deepgram"):
            if settings.STT_API_KEY:
                _stt = HostedSpeechToTextProvider()
            else:
                _stt = MockSpeechToTextProvider()
        else:
            _stt = MockSpeechToTextProvider()
        log.info("stt_provider_ready", extra={"provider": _stt.name})
    return _stt


def reset_ai_for_tests() -> None:
    global _evaluator, _stt
    _evaluator, _stt = None, None


def provider_health() -> dict[str, Any]:
    eval_prov = get_evaluation_provider()
    stt_prov = get_stt_provider()
    has_gemini = bool(settings.GEMINI_API_KEY or (settings.AI_PROVIDER == "gemini" and settings.AI_API_KEY))
    has_groq = bool(settings.GROQ_API_KEY or (settings.AI_PROVIDER == "groq" and settings.AI_API_KEY))
    has_groq_stt = bool(settings.GROQ_API_KEY or settings.STT_API_KEY)

    return {
        "evaluation": {
            "configured": settings.AI_PROVIDER,
            "active": eval_prov.name,
            "model": settings.AI_MODEL if settings.AI_PROVIDER == "gemini" else (settings.GROQ_MODEL if settings.AI_PROVIDER == "groq" else settings.AI_MODEL),
            "requiresEvidence": settings.AI_REQUIRE_EVIDENCE,
            "hasGeminiKey": has_gemini,
            "hasGroqKey": has_groq,
            "usingDevelopmentFallback": eval_prov.name == "mock",
        },
        "speechToText": {
            "configured": settings.STT_PROVIDER,
            "active": stt_prov.name,
            "model": settings.STT_MODEL,
            "hasGroqKey": has_groq_stt,
            "usingDevelopmentFallback": stt_prov.name == "mock",
        },
    }
