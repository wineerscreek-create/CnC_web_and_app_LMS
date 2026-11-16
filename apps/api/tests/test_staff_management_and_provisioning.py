"""Integration tests for Super Admin Staff Management & Provisioning System,
Online vs Institution Trainers, and Course Invitation Lifecycle.
"""
import uuid
import pytest
from bson import ObjectId
from app.core.config import settings
from app.authz.context import ScopeContext, Role
from app.db.postgres import get_pg_connection

# Force PostgreSQL mode for staff management and provisioning tests
settings.USE_POSTGRES = True
from app.routers.super_admin import (
    super_admin_provision_user,
    super_admin_list_users,
    super_admin_staff_metrics,
    super_admin_reset_user_password,
    super_admin_suspend_user,
    super_admin_activate_user,
    super_admin_update_user,
    super_admin_create_course_invitation,
    super_admin_list_course_invitations,
    super_admin_withdraw_course_invitation,
)
from app.routers.trainer import (
    trainer_list_course_invitations,
    trainer_accept_course_invitation,
    trainer_reject_course_invitation,
)
from app.core.errors import Conflict, NotFound, ValidationError


@pytest.fixture
async def cleanup_test_data():
    yield
    async with get_pg_connection() as conn:
        await conn.execute("DELETE FROM users WHERE email LIKE '%@teststaffmgmt.com'")


@pytest.mark.asyncio
async def test_provision_online_trainer(cleanup_test_data):
    """Test provisioning an independent / online trainer without institution requirement."""
    ctx = ScopeContext(user_id=ObjectId(), role=Role.SUPER_ADMIN, college_id=None, department_id=None, session_id="test_sess")
    
    payload = {
        "name": "Prof. Online Specialist",
        "email": "online_specialist@teststaffmgmt.com",
        "role": "TRAINER",
        "affiliationType": "ONLINE",
        "mobile": "+91 91234 56789",
        "designation": "Staff Cloud Architect",
        "qualification": "Ph.D Computer Science",
        "specialization": "Distributed Systems, Go, Kubernetes",
    }
    res = await super_admin_provision_user(payload, ctx)
    assert res["success"] is True
    assert res["data"]["email"] == "online_specialist@teststaffmgmt.com"
    assert res["data"]["affiliationType"] == "ONLINE"
    assert res["data"]["collegeId"] is None
    assert res["data"]["mustChangePassword"] is True
    assert "temporaryPassword" in res

    user_id = uuid.UUID(res["data"]["id"])
    async with get_pg_connection() as conn:
        row = await conn.fetchrow("SELECT role, must_change_password, affiliation_type FROM users WHERE id = $1", user_id)
        assert row["role"] == "TRAINER"
        assert row["must_change_password"] is True
        assert row["affiliation_type"] == "ONLINE"

        t_row = await conn.fetchrow("SELECT affiliation_type, designation, qualification FROM trainer_profiles WHERE user_id = $1", user_id)
        assert t_row["affiliation_type"] == "ONLINE"
        assert t_row["designation"] == "Staff Cloud Architect"


@pytest.mark.asyncio
async def test_provision_institutional_admin_and_hod(cleanup_test_data):
    """Test provisioning Institutional Admin and Department HOD."""
    ctx = ScopeContext(user_id=ObjectId(), role=Role.SUPER_ADMIN, college_id=None, department_id=None, session_id="test_sess")
    
    async with get_pg_connection() as conn:
        inst = await conn.fetchrow("SELECT id FROM institutions LIMIT 1")
        assert inst is not None
        dept = await conn.fetchrow("SELECT id FROM departments WHERE institution_id = $1 LIMIT 1", inst["id"])

    inst_id = str(inst["id"])
    dept_id = str(dept["id"]) if dept else None

    # 1. Provision Institutional Admin
    admin_payload = {
        "name": "Dean Admin User",
        "email": "dean_admin@teststaffmgmt.com",
        "role": "ADMIN",
        "collegeId": inst_id,
        "designation": "Dean of Academics",
    }
    admin_res = await super_admin_provision_user(admin_payload, ctx)
    assert admin_res["success"] is True
    assert admin_res["data"]["role"] == "ADMIN"
    assert admin_res["data"]["collegeId"] == inst_id

    # 2. Provision HOD (requires department)
    if dept_id:
        hod_payload = {
            "name": "Dr. CSE Head",
            "email": "cse_head@teststaffmgmt.com",
            "role": "HOD",
            "collegeId": inst_id,
            "departmentId": dept_id,
            "designation": "Head of Department",
        }
        hod_res = await super_admin_provision_user(hod_payload, ctx)
        assert hod_res["success"] is True
        assert hod_res["data"]["role"] == "HOD"
        assert hod_res["data"]["departmentId"] == dept_id

        # Verify spoc_branch_assignments
        hod_uuid = uuid.UUID(hod_res["data"]["id"])
        async with get_pg_connection() as conn:
            spoc_row = await conn.fetchrow("SELECT * FROM spoc_branch_assignments WHERE spoc_user_id = $1", hod_uuid)
            assert spoc_row is not None


@pytest.mark.asyncio
async def test_provisioning_validation_and_conflict(cleanup_test_data):
    """Test validation errors for missing fields and duplicate emails."""
    ctx = ScopeContext(user_id=ObjectId(), role=Role.SUPER_ADMIN, college_id=None, department_id=None, session_id="test_sess")
    
    # Missing required name/email
    with pytest.raises(ValidationError):
        await super_admin_provision_user({"name": "", "email": "valid@teststaffmgmt.com", "role": "ADMIN"}, ctx)

    # Admin without college
    with pytest.raises(ValidationError):
        await super_admin_provision_user({"name": "Admin No College", "email": "nocollege@teststaffmgmt.com", "role": "ADMIN"}, ctx)

    # First creation
    payload = {
        "name": "Unique Staff",
        "email": "unique_staff@teststaffmgmt.com",
        "role": "TRAINER",
        "affiliationType": "ONLINE",
    }
    await super_admin_provision_user(payload, ctx)

    # Conflict on duplicate email
    with pytest.raises(Conflict):
        await super_admin_provision_user(payload, ctx)


@pytest.mark.asyncio
async def test_staff_metrics_and_status_actions(cleanup_test_data):
    """Test staff metrics, password reset, and status toggles."""
    ctx = ScopeContext(user_id=ObjectId(), role=Role.SUPER_ADMIN, college_id=None, department_id=None, session_id="test_sess")
    
    p = {
        "name": "Metrics Test Trainer",
        "email": "metrics_trainer@teststaffmgmt.com",
        "role": "TRAINER",
        "affiliationType": "ONLINE",
    }
    res = await super_admin_provision_user(p, ctx)
    user_id = res["data"]["id"]

    # Metrics
    metrics = await super_admin_staff_metrics(ctx)
    assert metrics["success"] is True
    assert metrics["data"]["totalStaff"] >= 1
    assert metrics["data"]["totalTrainers"] >= 1

    # Reset password
    pwd_res = await super_admin_reset_user_password(user_id, {"temporaryPassword": "ManualResetPassword123!"}, ctx)
    assert pwd_res["success"] is True
    assert pwd_res["temporaryPassword"] == "ManualResetPassword123!"
    assert pwd_res["mustChangePassword"] is True

    # Suspend user
    sus_res = await super_admin_suspend_user(user_id, ctx)
    assert sus_res["success"] is True

    async with get_pg_connection() as conn:
        st = await conn.fetchval("SELECT status FROM users WHERE id = $1", uuid.UUID(user_id))
        assert st == "SUSPENDED"

    # Activate user
    act_res = await super_admin_activate_user(user_id, ctx)
    assert act_res["success"] is True

    async with get_pg_connection() as conn:
        st = await conn.fetchval("SELECT status FROM users WHERE id = $1", uuid.UUID(user_id))
        assert st == "ACTIVE"


@pytest.mark.asyncio
async def test_course_invitation_lifecycle(cleanup_test_data):
    """Test complete Course Invitation workflow:
    Offer -> Pending (not assigned) -> Accept -> Assigned in course_trainers.
    Also test Reject and Withdraw.
    """
    admin_ctx = ScopeContext(user_id=ObjectId(), role=Role.SUPER_ADMIN, college_id=None, department_id=None, session_id="admin_sess")

    # 1. Create Trainer
    t_payload = {
        "name": "Candidate Trainer",
        "email": "candidate_trainer@teststaffmgmt.com",
        "role": "TRAINER",
        "affiliationType": "ONLINE",
    }
    t_res = await super_admin_provision_user(t_payload, admin_ctx)
    trainer_user_id = t_res["data"]["id"]
    t_uuid = uuid.UUID(trainer_user_id)

    async with get_pg_connection() as conn:
        courses = await conn.fetch("SELECT id, title FROM courses LIMIT 2")
        assert len(courses) >= 1
    
    course_1_id = str(courses[0]["id"])
    c1_uuid = courses[0]["id"]

    # 2. Super Admin offers Course 1
    offer_res = await super_admin_create_course_invitation({
        "trainerUserId": trainer_user_id,
        "courseId": course_1_id,
        "notes": "Please lead our cloud batch.",
        "proposedStartDate": "2026-12-01",
        "proposedEndDate": "2027-02-28",
    }, admin_ctx)
    assert offer_res["success"] is True
    inv_1_id = offer_res["data"]["id"]
    assert offer_res["data"]["status"] == "PENDING"

    # Verify Course is NOT yet in course_trainers!
    async with get_pg_connection() as conn:
        pre_assign = await conn.fetchrow("SELECT * FROM course_trainers WHERE trainer_user_id = $1 AND course_id = $2", t_uuid, c1_uuid)
        assert pre_assign is None, "Course must NOT be assigned while invitation is PENDING!"

    # 3. Trainer retrieves invitations
    trainer_ctx = ScopeContext(user_id=t_uuid, role=Role.TRAINER, college_id=None, department_id=None, session_id="trainer_sess")
    inv_list = await trainer_list_course_invitations(trainer_ctx)
    assert inv_list["success"] is True
    matching = [i for i in inv_list["items"] if i["id"] == inv_1_id]
    assert len(matching) == 1
    assert matching[0]["status"] == "PENDING"

    # 4. Trainer accepts invitation
    accept_res = await trainer_accept_course_invitation(inv_1_id, trainer_ctx)
    assert accept_res["success"] is True

    # 5. Verify Course is NOW assigned in course_trainers and course_trainer_assignments!
    async with get_pg_connection() as conn:
        post_assign = await conn.fetchrow("SELECT * FROM course_trainers WHERE trainer_user_id = $1 AND course_id = $2", t_uuid, c1_uuid)
        assert post_assign is not None, "Course must be active in course_trainers after acceptance!"

        inv_row = await conn.fetchrow("SELECT status, responded_at FROM course_invitations WHERE id = $1", uuid.UUID(inv_1_id))
        assert inv_row["status"] == "ACCEPTED"
        assert inv_row["responded_at"] is not None

    # 6. Test Decline (Course 2)
    if len(courses) >= 2:
        course_2_id = str(courses[1]["id"])
        c2_uuid = courses[1]["id"]
        offer_2 = await super_admin_create_course_invitation({
            "trainerUserId": trainer_user_id,
            "courseId": course_2_id,
        }, admin_ctx)
        inv_2_id = offer_2["data"]["id"]

        reject_res = await trainer_reject_course_invitation(inv_2_id, {"reason": "Schedule overlap"}, trainer_ctx)
        assert reject_res["success"] is True

        async with get_pg_connection() as conn:
            c2_assign = await conn.fetchrow("SELECT * FROM course_trainers WHERE trainer_user_id = $1 AND course_id = $2", t_uuid, c2_uuid)
            assert c2_assign is None, "Declined course must NOT be assigned!"

            inv2_row = await conn.fetchrow("SELECT status, response_notes FROM course_invitations WHERE id = $1", uuid.UUID(inv_2_id))
            assert inv2_row["status"] == "REJECTED"
            assert inv2_row["response_notes"] == "Schedule overlap"

        # 7. Test Withdraw
        # Offer another invitation to test Super Admin withdrawal
        async with get_pg_connection() as conn:
            await conn.execute("DELETE FROM course_invitations WHERE id = $1", uuid.UUID(inv_2_id))
        offer_3 = await super_admin_create_course_invitation({
            "trainerUserId": trainer_user_id,
            "courseId": course_2_id,
        }, admin_ctx)
        inv_3_id = offer_3["data"]["id"]

        withdraw_res = await super_admin_withdraw_course_invitation(inv_3_id, admin_ctx)
        assert withdraw_res["success"] is True

        async with get_pg_connection() as conn:
            inv3_row = await conn.fetchrow("SELECT status FROM course_invitations WHERE id = $1", uuid.UUID(inv_3_id))
            assert inv3_row["status"] == "WITHDRAWN"
