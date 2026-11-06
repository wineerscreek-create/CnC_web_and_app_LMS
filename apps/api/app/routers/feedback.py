"""Feedback & Testimonials Router.

Covers:
- Public platform reviews (anonymous or authenticated, rate-limited, anti-spam)
- Homepage public testimonials (only approved and published)
- Course feedback (draft, final submission, and completion gating)
- Super Admin moderation center & live analytics
- Newsletter subscriptions
"""
from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field

from app.authz.context import ScopeContext
from app.authz.guards import get_scope_context, _client_ip
from app.authz.roles import Role
from app.core.errors import RoleForbidden, ScopeForbidden, ValidationError, Unauthenticated
from app.core.logging import get_logger
from app.repositories.feedback_repo import FeedbackRepository

log = get_logger("app.feedback")

router = APIRouter()


async def optional_context(request: Request) -> ScopeContext | None:
    if not request.headers.get("authorization"):
        return None
    try:
        return await get_scope_context(request)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------
class PlatformFeedbackCreate(BaseModel):
    overallPlatformRating: int = Field(..., ge=1, le=5)
    easeOfUseRating: int = Field(..., ge=1, le=5)
    learningQualityRating: int = Field(..., ge=1, le=5)
    practicalExperienceRating: int = Field(..., ge=1, le=5)
    recommendationRating: int = Field(..., ge=1, le=5)
    writtenFeedback: str = Field(..., min_length=10, max_length=5000)
    suggestions: str | None = Field(None, max_length=3000)
    greetingMessage: str | None = Field(None, max_length=1000)
    displayName: str | None = Field(None, max_length=150)
    email: str | None = Field(None, max_length=255)
    publicDisplayConsent: bool = False
    userCategory: str = Field("EXTERNAL", max_length=50)
    honeypot: str | None = None  # Anti-spam protection for anonymous submissions


class CourseFeedbackPayload(BaseModel):
    contentRating: int = Field(5, ge=1, le=5)
    trainerRating: int = Field(5, ge=1, le=5)
    practicalActivityRating: int = Field(5, ge=1, le=5)
    learningMaterialRating: int = Field(5, ge=1, le=5)
    overallCourseRating: int = Field(5, ge=1, le=5)
    learningOutcome: str | None = Field(None, max_length=3000)
    positiveFeedback: str | None = Field(None, max_length=3000)
    improvementSuggestions: str | None = Field(None, max_length=3000)
    futureBatchSuggestions: str | None = Field(None, max_length=3000)
    greetingMessage: str | None = Field(None, max_length=1000)
    testimonialText: str | None = Field(None, max_length=3000)
    publicDisplayConsent: bool = False


class ModerateFeedbackRequest(BaseModel):
    action: str = Field(..., description="APPROVE, REJECT, HIDE, RESTORE")
    internalNote: str | None = Field(None, max_length=2000)


class PublishHomepageRequest(BaseModel):
    isPublished: bool


class NewsletterSubscribeRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)


# ---------------------------------------------------------------------------
# 1. PUBLIC ENDPOINTS (No Auth Required)
# ---------------------------------------------------------------------------
@router.post("/platform")
async def submit_platform_feedback(
    payload: PlatformFeedbackCreate,
    request: Request,
    ctx: ScopeContext | None = Depends(optional_context),
) -> dict[str, Any]:
    """Submit platform review. Open to all (anonymous visitors or logged-in users)."""
    # Abuse prevention / honeypot: bots fill hidden fields
    if payload.honeypot:
        log.warning("feedback_honeypot_triggered", extra={"ip": _client_ip(request)})
        return {"success": True, "message": "Thank you for your feedback."}

    user_id = ctx.user_id if ctx else None
    user_category = payload.userCategory
    if ctx:
        if ctx.role == Role.STUDENT:
            user_category = "STUDENT"
        elif ctx.role == Role.TRAINER:
            user_category = "TRAINER"
        elif ctx.role == Role.HOD:
            user_category = "SPOC"
        elif ctx.role in (Role.ADMIN, Role.SUPER_ADMIN):
            user_category = "ADMIN"

    ip_address = _client_ip(request)

    res = await FeedbackRepository.submit_platform_feedback(
        overall_platform_rating=payload.overallPlatformRating,
        ease_of_use_rating=payload.easeOfUseRating,
        learning_quality_rating=payload.learningQualityRating,
        practical_experience_rating=payload.practicalExperienceRating,
        recommendation_rating=payload.recommendationRating,
        written_feedback=payload.writtenFeedback,
        suggestions=payload.suggestions,
        greeting_message=payload.greetingMessage,
        display_name=payload.displayName,
        email=payload.email,
        public_display_consent=payload.publicDisplayConsent,
        user_category=user_category,
        user_id=user_id,
        ip_address=ip_address,
    )
    return {
        "success": True,
        "data": res,
        "message": "Thank you for sharing your feedback! Your review helps us continuously improve the platform.",
    }


@router.get("/public/testimonials")
async def get_public_testimonials() -> dict[str, Any]:
    """Fetch approved & published testimonials for the public homepage and testimonials page."""
    items = await FeedbackRepository.get_public_homepage_testimonials()
    return {"success": True, "data": items}


@router.post("/newsletter/subscribe")
async def subscribe_newsletter(
    payload: NewsletterSubscribeRequest, request: Request
) -> dict[str, Any]:
    """Newsletter subscription with validation and duplicate handling."""
    ip = _client_ip(request)
    res = await FeedbackRepository.subscribe_newsletter(payload.email, ip)
    return res


# ---------------------------------------------------------------------------
# 2. COURSE-SPECIFIC FEEDBACK & COMPLETION GATING (Participant)
# ---------------------------------------------------------------------------
@router.get("/course/{course_id}")
async def get_course_feedback(
    course_id: str, ctx: ScopeContext = Depends(get_scope_context)
) -> dict[str, Any]:
    """Get the participant's draft or submitted feedback for a course."""
    if ctx.role != Role.STUDENT and ctx.role != Role.SUPER_ADMIN:
        raise RoleForbidden("Only participants can access personal course feedback.")

    feedback = await FeedbackRepository.get_course_feedback(course_id, ctx.user_id)
    gate = await FeedbackRepository.check_completion_gate(course_id, ctx.user_id)
    return {"success": True, "data": {"feedback": feedback, "gate": gate}}


@router.get("/course/{course_id}/gate")
async def check_course_completion_gate(
    course_id: str, ctx: ScopeContext = Depends(get_scope_context)
) -> dict[str, Any]:
    """Check if course completion requires feedback."""
    gate = await FeedbackRepository.check_completion_gate(course_id, ctx.user_id)
    return {"success": True, "data": gate}


@router.post("/course/{course_id}/draft")
async def save_course_feedback_draft(
    course_id: str,
    payload: CourseFeedbackPayload,
    ctx: ScopeContext = Depends(get_scope_context),
) -> dict[str, Any]:
    """Save an in-progress feedback draft without finalizing completion."""
    if ctx.role != Role.STUDENT:
        raise RoleForbidden("Only enrolled participants may submit course feedback.")

    res = await FeedbackRepository.save_course_feedback(
        course_id=course_id,
        participant_id=ctx.user_id,
        payload=payload.model_dump(),
        is_final=False,
    )
    return {"success": True, "data": res}


@router.post("/course/{course_id}/submit")
async def submit_final_course_feedback(
    course_id: str,
    payload: CourseFeedbackPayload,
    ctx: ScopeContext = Depends(get_scope_context),
) -> dict[str, Any]:
    """Mandatory final course feedback submission.
    Validates learning requirements and marks course completion in the backend.
    """
    if ctx.role != Role.STUDENT:
        raise RoleForbidden("Only enrolled participants may submit course feedback.")

    res = await FeedbackRepository.save_course_feedback(
        course_id=course_id,
        participant_id=ctx.user_id,
        payload=payload.model_dump(),
        is_final=True,
    )
    return {"success": True, "data": res}


# ---------------------------------------------------------------------------
# 3. SUPER ADMIN & ADMIN FEEDBACK CONTROL CENTER
# ---------------------------------------------------------------------------
@router.get("/admin/summary")
async def get_admin_summary(
    ctx: ScopeContext = Depends(get_scope_context),
) -> dict[str, Any]:
    """Aggregated feedback and testimonial numbers."""
    if ctx.role not in (Role.SUPER_ADMIN, Role.ADMIN, Role.HOD):
        raise RoleForbidden("Access restricted to administrative roles.")

    summary = await FeedbackRepository.get_admin_summary(
        institution_id=ctx.college_id if ctx.role != Role.SUPER_ADMIN else None
    )
    return {"success": True, "data": summary}


@router.get("/admin/list")
async def get_admin_feedback_list(
    tab: str = Query("all"),
    status: str | None = Query(None),
    rating: int | None = Query(None),
    search: str | None = Query(None),
    course_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    ctx: ScopeContext = Depends(get_scope_context),
) -> dict[str, Any]:
    """Paginated feedback list with multi-parameter filtering."""
    if ctx.role not in (Role.SUPER_ADMIN, Role.ADMIN, Role.HOD):
        raise RoleForbidden("Access restricted to administrative roles.")

    res = await FeedbackRepository.get_admin_feedback_list(
        tab=tab,
        status=status,
        rating=rating,
        search=search,
        course_id=course_id,
        limit=limit,
        offset=offset,
    )
    return {"success": True, "data": res}


@router.get("/admin/analytics")
async def get_admin_analytics(
    ctx: ScopeContext = Depends(get_scope_context),
) -> dict[str, Any]:
    """Detailed rating distributions and historical feedback volume."""
    if ctx.role not in (Role.SUPER_ADMIN, Role.ADMIN):
        raise RoleForbidden("Access restricted to administrators.")

    analytics = await FeedbackRepository.get_admin_analytics()
    return {"success": True, "data": analytics}


@router.post("/admin/{feedback_type}/{feedback_id}/moderate")
async def moderate_feedback(
    feedback_type: str,
    feedback_id: str,
    payload: ModerateFeedbackRequest,
    ctx: ScopeContext = Depends(get_scope_context),
) -> dict[str, Any]:
    """Super Admin approves, rejects, hides, or restores feedback."""
    if ctx.role != Role.SUPER_ADMIN:
        raise RoleForbidden("Only Super Admin can moderate platform and course reviews.")

    res = await FeedbackRepository.moderate_feedback(
        feedback_type=feedback_type,
        feedback_id=feedback_id,
        action=payload.action,
        moderator_id=ctx.user_id,
        internal_note=payload.internalNote,
    )
    return {"success": True, "data": res, "message": f"Feedback status updated to {res.get('moderation_status')}."}


@router.post("/admin/{feedback_type}/{feedback_id}/publish")
async def toggle_homepage_publication(
    feedback_type: str,
    feedback_id: str,
    payload: PublishHomepageRequest,
    ctx: ScopeContext = Depends(get_scope_context),
) -> dict[str, Any]:
    """Super Admin toggles homepage publication for approved testimonials with consent."""
    if ctx.role != Role.SUPER_ADMIN:
        raise RoleForbidden("Only Super Admin can manage homepage testimonials.")

    res = await FeedbackRepository.toggle_homepage_publication(
        feedback_type=feedback_type,
        feedback_id=feedback_id,
        is_published=payload.isPublished,
        moderator_id=ctx.user_id,
    )
    action_str = "featured on the homepage" if payload.isPublished else "removed from the homepage"
    return {"success": True, "data": res, "message": f"Testimonial successfully {action_str}."}
