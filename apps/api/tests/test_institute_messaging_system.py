"""Comprehensive Integration Test Suite for Institute-Based Messaging System.

Tests:
- Scenario A: Institute-based group generation & automatic student membership
- Scenario B: Trainer batch assignment & automatic access revocation (preserving history)
- Scenario C: Section isolation (CS-A vs CS-B vs CS-C)
- Scenario D: Direct messaging & email/user ID search
- Scenario E: User blocking and unblocking (REST + backend enforcement)
- Scenario F: Security, RBAC, and cross-institute isolation
- Scenario G: Real-time message distribution & WebSocket subscription verification
"""
import json
import uuid
import pytest
from starlette.websockets import WebSocketState
from app.authz.context import ScopeContext
from app.authz.roles import Role
from app.core.errors import BusinessRuleViolation, NotFound, ScopeForbidden, ValidationError
from app.db.postgres import get_pg_connection
from app.services.messaging_service import MessagingService, parse_batch_group_identity
from app.websocket.messaging_ws import messaging_hub


@pytest.mark.asyncio
async def test_batch_group_identity_naming():
    """Verifies strict PASSOUT_YEAR-BRANCH-SECTION Group naming convention."""
    y, b, s, key, gname = parse_batch_group_identity(
        name="Batch 2023-27 Sem 7 CS-C",
        code="2023-27-VII-CS-C",
        academic_year="2023-2027",
        dep_code="CSE",
    )
    assert y == "2027"
    assert b == "CS"
    assert s == "C"
    assert key == "2027-CS-C"
    assert gname == "2027-CS-C Group"

    # Multiple sections
    _, _, s_a, _, name_a = parse_batch_group_identity("Batch 2025-29 Sem 3 IT-A", "2025-29-III-IT-A", "2025-2029", "IT")
    assert s_a == "A"
    assert name_a == "2029-IT-A Group"

    _, _, s_b, _, name_b = parse_batch_group_identity("Batch 2025-29 Sem 3 AI-B", "2025-29-III-AI-B", "2025-2029", "AI&DS")
    assert s_b == "B"
    assert name_b == "2029-AI-B Group"


@pytest.mark.asyncio
async def test_scenario_a_student_membership_and_group_generation():
    """Scenario A: Batch creation automatically generates group and adds students."""
    async with get_pg_connection() as conn:
        inst = await conn.fetchrow("SELECT id FROM institutions LIMIT 1")
        inst_id = inst["id"]

        dept = await conn.fetchrow("SELECT id FROM departments WHERE institution_id = $1 LIMIT 1", inst_id)
        if not dept:
            dept_id = uuid.uuid4()
            await conn.execute("INSERT INTO departments (id, institution_id, name, code, created_at, updated_at) VALUES ($1, $2, 'Computer Science', 'CSE', NOW(), NOW())", dept_id, inst_id)
        else:
            dept_id = dept["id"]

        # Create test batch 2027-CS-C
        batch_id = uuid.uuid4()
        batch_code = f"2023-27-VII-CS-C-{batch_id.hex[:4]}"
        await conn.execute(
            """
            INSERT INTO batches (id, institution_id, department_id, name, code, academic_year, semester, created_at, updated_at)
            VALUES ($1, $2, $3, 'Batch 2023-27 Sem 7 CS-C', $4, '2023-2027', 7, NOW(), NOW())
            """,
            batch_id, inst_id, dept_id, batch_code
        )

        # Create test student
        student_id = uuid.uuid4()
        await conn.execute(
            """
            INSERT INTO users (id, email, password_hash, name, role, institution_id, status, created_at, updated_at)
            VALUES ($1, $2, 'hash', 'Test Student A', 'STUDENT', $3, 'ACTIVE', NOW(), NOW())
            """,
            student_id, f"student_{student_id.hex[:6]}@test.edu", inst_id
        )

        await conn.execute(
            """
            INSERT INTO student_profiles (id, user_id, institution_id, department_id, batch_id, roll_number, created_at, updated_at)
            VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
            """,
            student_id, inst_id, dept_id, batch_id, f"ROLL_{student_id.hex[:6]}"
        )

    # Sync batch group
    group = await MessagingService.sync_batch_group(batch_id)
    assert group is not None
    assert group["name"] == "2027-CS-C Group"
    assert group["normalized_key"] == "2027-CS-C"

    # Sync student
    await MessagingService.sync_student_batch_membership(student_id, batch_id, inst_id)

    # Student retrieves accessible groups
    groups = await MessagingService.get_user_accessible_groups(student_id, "STUDENT", inst_id)
    assert len(groups) >= 1
    matching = [g for g in groups if g["id"] == str(group["id"])]
    assert len(matching) == 1
    assert matching[0]["name"] == "2027-CS-C Group"


@pytest.mark.asyncio
async def test_scenario_b_trainer_assignment_and_revocation():
    """Scenario B: Assigning trainer grants access; revoking trainer revokes access while preserving messages."""
    async with get_pg_connection() as conn:
        inst = await conn.fetchrow("SELECT id FROM institutions LIMIT 1")
        inst_id = inst["id"]

        dept = await conn.fetchrow("SELECT id FROM departments WHERE institution_id = $1 LIMIT 1", inst_id)
        dept_id = dept["id"] if dept else uuid.uuid4()
        if not dept:
            await conn.execute("INSERT INTO departments (id, institution_id, name, code, created_at, updated_at) VALUES ($1, $2, 'Computer Science', 'CSE', NOW(), NOW())", dept_id, inst_id)

        batch_id = uuid.uuid4()
        batch_code = f"2023-27-VII-CS-B-{batch_id.hex[:4]}"
        await conn.execute(
            """
            INSERT INTO batches (id, institution_id, department_id, name, code, academic_year, semester, created_at, updated_at)
            VALUES ($1, $2, $3, 'Batch 2023-27 Sem 7 CS-B', $4, '2023-2027', 7, NOW(), NOW())
            """,
            batch_id, inst_id, dept_id, batch_code
        )

        trainer_a = uuid.uuid4()
        trainer_b = uuid.uuid4()
        for t_id, t_name in [(trainer_a, "Trainer A"), (trainer_b, "Trainer B")]:
            await conn.execute(
                """
                INSERT INTO users (id, email, password_hash, name, role, institution_id, status, created_at, updated_at)
                VALUES ($1, $2, 'hash', $3, 'TRAINER', $4, 'ACTIVE', NOW(), NOW())
                """,
                t_id, f"trainer_{t_id.hex[:6]}@test.edu", t_name, inst_id
            )

    group = await MessagingService.sync_batch_group(batch_id)
    group_id = group["id"]

    # 1. Assign Trainer A
    await MessagingService.sync_trainer_batch_assignment(trainer_a, batch_id, action="assign")

    # Trainer A can view and post to group
    groups_a = await MessagingService.get_user_accessible_groups(trainer_a, "TRAINER", inst_id)
    assert any(g["id"] == str(group_id) for g in groups_a)

    msg = await MessagingService.post_group_message(
        group_id=group_id,
        sender_id=trainer_a,
        sender_role="TRAINER",
        content="Welcome to 2027-CS-B Group! This is an important notice.",
        message_type="announcement",
        is_pinned=True,
    )
    assert msg["isPinned"] is True

    # 2. Revoke Trainer A and Assign Trainer B
    await MessagingService.sync_trainer_batch_assignment(trainer_a, batch_id, action="revoke")
    await MessagingService.sync_trainer_batch_assignment(trainer_b, batch_id, action="assign")

    # Trainer A can no longer access group
    groups_a_after = await MessagingService.get_user_accessible_groups(trainer_a, "TRAINER", inst_id)
    assert not any(g["id"] == str(group_id) for g in groups_a_after)

    with pytest.raises(ScopeForbidden):
        await MessagingService.get_group_details(group_id, trainer_a, "TRAINER")

    with pytest.raises(ScopeForbidden):
        await MessagingService.post_group_message(group_id, trainer_a, "TRAINER", "Should fail")

    # Trainer B has access and history is intact!
    groups_b = await MessagingService.get_user_accessible_groups(trainer_b, "TRAINER", inst_id)
    assert any(g["id"] == str(group_id) for g in groups_b)

    history = await MessagingService.get_group_messages(group_id, trainer_b, "TRAINER")
    assert len(history) >= 1
    assert any("Welcome to 2027-CS-B Group" in m["content"] for m in history)


@pytest.mark.asyncio
async def test_scenario_c_section_isolation():
    """Scenario C: Students access only their own section group (CS-A vs CS-B)."""
    async with get_pg_connection() as conn:
        inst = await conn.fetchrow("SELECT id FROM institutions LIMIT 1")
        inst_id = inst["id"]

        dept = await conn.fetchrow("SELECT id FROM departments WHERE institution_id = $1 LIMIT 1", inst_id)
        dept_id = dept["id"] if dept else uuid.uuid4()
        if not dept:
            await conn.execute("INSERT INTO departments (id, institution_id, name, code, created_at, updated_at) VALUES ($1, $2, 'Computer Science', 'CSE', NOW(), NOW())", dept_id, inst_id)

        b_cs_a = uuid.uuid4()
        b_cs_b = uuid.uuid4()
        code_a = f"2023-27-VII-CS-A-{b_cs_a.hex[:4]}"
        code_b = f"2023-27-VII-CS-B-{b_cs_b.hex[:4]}"
        await conn.execute(
            """
            INSERT INTO batches (id, institution_id, department_id, name, code, academic_year, semester, created_at, updated_at)
            VALUES
                ($1, $3, $4, 'Batch 2023-27 Sem 7 CS-A', $5, '2023-2027', 7, NOW(), NOW()),
                ($2, $3, $4, 'Batch 2023-27 Sem 7 CS-B', $6, '2023-2027', 7, NOW(), NOW())
            """,
            b_cs_a, b_cs_b, inst_id, dept_id, code_a, code_b
        )

        student_a = uuid.uuid4()
        await conn.execute(
            """
            INSERT INTO users (id, email, password_hash, name, role, institution_id, status, created_at, updated_at)
            VALUES ($1, $2, 'hash', 'Student Section A', 'STUDENT', $3, 'ACTIVE', NOW(), NOW())
            """,
            student_a, f"student_a_{student_a.hex[:6]}@test.edu", inst_id
        )

    g_a = await MessagingService.sync_batch_group(b_cs_a)
    g_b = await MessagingService.sync_batch_group(b_cs_b)

    # Assign student to Section A
    await MessagingService.sync_student_batch_membership(student_a, b_cs_a, inst_id)

    # Student A can access Group A
    detail_a = await MessagingService.get_group_details(g_a["id"], student_a, "STUDENT")
    assert detail_a["name"] == "2027-CS-A Group"

    # Student A CANNOT access Group B
    with pytest.raises(ScopeForbidden):
        await MessagingService.get_group_details(g_b["id"], student_a, "STUDENT")

    with pytest.raises(ScopeForbidden):
        await MessagingService.post_group_message(g_b["id"], student_a, "STUDENT", "Unauthorized message")


@pytest.mark.asyncio
async def test_scenario_d_and_e_direct_messaging_and_blocking():
    """Scenarios D & E: 1-on-1 direct messaging and user blocking enforcement."""
    async with get_pg_connection() as conn:
        inst = await conn.fetchrow("SELECT id FROM institutions LIMIT 1")
        inst_id = inst["id"]

        user_x = uuid.uuid4()
        user_y = uuid.uuid4()

        email_x = f"user_x_{user_x.hex[:6]}@test.edu"
        email_y = f"user_y_{user_y.hex[:6]}@test.edu"

        await conn.execute(
            """
            INSERT INTO users (id, email, password_hash, name, role, institution_id, status, created_at, updated_at)
            VALUES
                ($1, $3, 'hash', 'User X', 'STUDENT', $5, 'ACTIVE', NOW(), NOW()),
                ($2, $4, 'hash', 'User Y', 'TRAINER', $5, 'ACTIVE', NOW(), NOW())
            """,
            user_x, user_y, email_x, email_y, inst_id
        )

    # 1. Search user by email and user ID
    search_by_email = await MessagingService.search_direct_message_users(email_y, user_x, "STUDENT", inst_id)
    assert len(search_by_email) == 1
    assert search_by_email[0]["id"] == str(user_y)

    search_by_id = await MessagingService.search_direct_message_users(str(user_x), user_y, "TRAINER", inst_id)
    assert len(search_by_id) == 1
    assert search_by_id[0]["id"] == str(user_x)

    # 2. Start direct conversation
    conv = await MessagingService.get_or_create_direct_conversation(user_x, user_y, inst_id)
    conv_id = conv["id"]

    # 3. Send message
    msg1 = await MessagingService.send_direct_message(
        conversation_id=conv_id,
        sender_id=user_x,
        sender_role="STUDENT",
        content="Hello Trainer, I have a doubt on the assignment.",
    )
    assert msg1["content"] == "Hello Trainer, I have a doubt on the assignment."

    # 4. User Y blocks User X
    await MessagingService.block_user(blocker_id=user_y, blocked_id=user_x, reason="Spam")

    # Blocked status verified
    blocked_list = await MessagingService.get_blocked_users(user_y)
    assert any(b["id"] == str(user_x) for b in blocked_list)

    # User X cannot send messages to User Y anymore
    with pytest.raises(BusinessRuleViolation):
        await MessagingService.send_direct_message(
            conversation_id=conv_id,
            sender_id=user_x,
            sender_role="STUDENT",
            content="Trying to message again",
        )

    # Existing message history remains completely preserved
    history = await MessagingService.get_direct_messages(conv_id, user_x)
    assert len(history) >= 1
    assert any("Hello Trainer" in m["content"] for m in history)

    # 5. User Y unblocks User X
    await MessagingService.unblock_user(blocker_id=user_y, blocked_id=user_x)

    # User X can send messages again
    msg2 = await MessagingService.send_direct_message(
        conversation_id=conv_id,
        sender_id=user_x,
        sender_role="STUDENT",
        content="Thank you for unblocking, I can message now.",
    )
    assert msg2["content"] == "Thank you for unblocking, I can message now."


@pytest.mark.asyncio
async def test_scenario_f_cross_institute_isolation():
    """Scenario F: Enforces strict isolation between institutions."""
    async with get_pg_connection() as conn:
        inst_a = await conn.fetchrow("SELECT id FROM institutions LIMIT 1")
        inst_a_id = inst_a["id"]

        # Create or fetch second institution
        inst_b_id = uuid.uuid4()
        await conn.execute(
            """
            INSERT INTO institutions (id, name, code, status, created_at, updated_at)
            VALUES ($1, 'Second University', $2, 'ACTIVE', NOW(), NOW())
            """,
            inst_b_id, f"SEC-UNI-{inst_b_id.hex[:6]}"
        )

        user_inst_a = uuid.uuid4()
        user_inst_b = uuid.uuid4()

        await conn.execute(
            """
            INSERT INTO users (id, email, password_hash, name, role, institution_id, status, created_at, updated_at)
            VALUES
                ($1, $2, 'hash', 'Student Inst A', 'STUDENT', $3, 'ACTIVE', NOW(), NOW()),
                ($4, $5, 'hash', 'Student Inst B', 'STUDENT', $6, 'ACTIVE', NOW(), NOW())
            """,
            user_inst_a, f"user_a_{user_inst_a.hex[:6]}@inst-a.edu", inst_a_id,
            user_inst_b, f"user_b_{user_inst_b.hex[:6]}@inst-b.edu", inst_b_id
        )

    # Student from Inst A cannot search or find Student from Inst B
    results = await MessagingService.search_direct_message_users(
        query=f"user_b_{user_inst_b.hex[:6]}@inst-b.edu",
        current_user_id=user_inst_a,
        current_role="STUDENT",
        institution_id=inst_a_id,
    )
    assert len(results) == 0

    # Student A cannot start direct conversation with Student B
    with pytest.raises(ScopeForbidden):
        await MessagingService.get_or_create_direct_conversation(
            user1_id=user_inst_a,
            user2_id=user_inst_b,
            institution_id=inst_a_id,
        )


@pytest.mark.asyncio
async def test_scenario_g_websocket_hub_and_revocation():
    """Scenario G: Verifies WebSocket hub connection, room subscription, and real-time revocation."""
    class MockWebSocket:
        def __init__(self):
            self.client_state = WebSocketState.CONNECTED
            self.sent_messages = []

        async def send_text(self, text: str):
            self.sent_messages.append(json.loads(text))

    ws_client = MockWebSocket()
    user_id = str(uuid.uuid4())
    room_name = f"group:{uuid.uuid4()}"

    # Connect and subscribe
    await messaging_hub.connect_user(user_id, ws_client)
    await messaging_hub.subscribe(user_id, ws_client, room_name)

    # Broadcast message to room
    await messaging_hub.broadcast_to_room(
        room_name=room_name,
        event="new_message",
        data={"content": "Live announcement"},
    )
    assert len(ws_client.sent_messages) == 1
    assert ws_client.sent_messages[0]["event"] == "new_message"
    assert ws_client.sent_messages[0]["data"]["content"] == "Live announcement"

    # Revoke user access from room
    await messaging_hub.revoke_user_from_room(user_id, room_name)
    assert len(ws_client.sent_messages) == 2
    assert ws_client.sent_messages[1]["event"] == "room_revoked"
    assert ws_client.sent_messages[1]["room"] == room_name

    # Disconnect
    await messaging_hub.disconnect(ws_client)
    assert ws_client not in messaging_hub.user_connections.get(user_id, set())

