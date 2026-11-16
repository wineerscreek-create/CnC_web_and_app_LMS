# Institute-Based Messaging System — Test Results

**Winners Creek LMS / SkillSharp**  
**Date:** November 2026  
**Status:** ALL TESTS PASSED  

---

## 1. Test Suite Summary

The test verification for the Institute-Based Messaging System encompasses end-to-end integration tests in Python (`pytest` + `asyncpg` + `pytest-asyncio`) and frontend unit tests in TypeScript (`vitest` + `tsc`).

| Component | Test File | Tests Run | Result | Duration |
| :--- | :--- | :---: | :---: | :---: |
| **Backend Core & Scenarios** | `apps/api/tests/test_institute_messaging_system.py` | 7 | **7 PASSED** | 4.79s |
| **Frontend WS Manager** | `apps/web/src/lib/messaging/ws.test.ts` | 4 | **4 PASSED** | 3.52s |
| **Frontend Static Types** | `tsc --noEmit` (`apps/web`) | 1 | **PASSED (0 Errors)** | 14.2s |

---

## 2. Detailed Scenario Verifications

### Scenario A: Automatic Batch Group Generation & Student Membership
- **Test**: `test_scenario_a_student_membership_and_group_generation`
- **Actions Tested**:
  1. Created academic department and batch `Batch 2023-27 Sem 7 CS-C` (`2023-27-VII-CS-C`).
  2. Executed `MessagingService.sync_batch_group(batch_id)`.
  3. Verified group name follows `PASSOUT_YEAR-BRANCH-SECTION Group` -> `2027-CS-C Group` with normalized key `2027-CS-C`.
  4. Created test student and executed `MessagingService.sync_student_batch_membership(student_id, batch_id, inst_id)`.
  5. Retrieved accessible groups for student and asserted presence of `2027-CS-C Group`.
- **Status**: **PASS**

### Scenario B: Trainer Batch Assignment & Automatic Access Revocation (Preserving History)
- **Test**: `test_scenario_b_trainer_assignment_and_revocation`
- **Actions Tested**:
  1. Created batch `Batch 2023-27 Sem 7 CS-B` and synced group `2027-CS-B Group`.
  2. Assigned Trainer A via `sync_trainer_batch_assignment(trainer_a, batch_id, action="assign")`.
  3. Trainer A posted a pinned announcement: `"Welcome to 2027-CS-B Group! This is an important notice."`.
  4. Revoked Trainer A and assigned Trainer B.
  5. Verified Trainer A's access is immediately revoked (`ScopeForbidden` on group access and message posting).
  6. Verified Trainer B has full access to `2027-CS-B Group`.
  7. Verified message history and pinned announcement posted by Trainer A remain fully intact and visible to Trainer B and students.
- **Status**: **PASS**

### Scenario C: Section Isolation (CS-A vs CS-B)
- **Test**: `test_scenario_c_section_isolation`
- **Actions Tested**:
  1. Created concurrent batches `Batch 2023-27 Sem 7 CS-A` and `Batch 2023-27 Sem 7 CS-B`.
  2. Synced groups `2027-CS-A Group` and `2027-CS-B Group`.
  3. Assigned Student to Section A.
  4. Verified Student successfully accesses Section A group.
  5. Attempted access and posting to Section B group -> Verified `ScopeForbidden` is raised.
- **Status**: **PASS**

### Scenario D & E: 1-on-1 Direct Messaging and User Blocking
- **Test**: `test_scenario_d_and_e_direct_messaging_and_blocking`
- **Actions Tested**:
  1. Searched users by email and LMS User UUID -> Verified accurate record lookup.
  2. Initiated direct conversation between User X (Student) and User Y (Trainer).
  3. Sent message `"Hello Trainer, I have a doubt on the assignment."`.
  4. User Y blocked User X via `MessagingService.block_user(user_y, user_x)`.
  5. User X attempted to send a new message -> Verified `BusinessRuleViolation` raised.
  6. Verified existing direct conversation history remains preserved.
  7. User Y unblocked User X via `MessagingService.unblock_user(user_y, user_x)`.
  8. User X sent a subsequent message -> Verified successful delivery.
- **Status**: **PASS**

### Scenario F: Multi-Tenant Cross-Institute Isolation
- **Test**: `test_scenario_f_cross_institute_isolation`
- **Actions Tested**:
  1. Created Institution A and Institution B with distinct students.
  2. Student from Inst A attempted to search for Student from Inst B -> Verified 0 results returned.
  3. Student A attempted to initiate a direct conversation with Student B -> Verified `ScopeForbidden: Direct messaging across different institutions is strictly prohibited.`
- **Status**: **PASS**

### Scenario G: Real-Time WebSocket Hub & Room Revocation
- **Test**: `test_scenario_g_websocket_hub_and_revocation`
- **Actions Tested**:
  1. Connected mock WebSocket client and subscribed to `group:<uuid>`.
  2. Broadcasted `new_message` event to room -> Verified client received live message payload.
  3. Executed `revoke_user_from_room(user_id, room_name)` -> Verified client immediately received `room_revoked` event and was removed from room subscriber set.
  4. Disconnected client -> Verified socket was evicted from connection pool.
- **Status**: **PASS**

---

## 3. Frontend Unit & Type Test Results

### Vitest: `apps/web/src/lib/messaging/ws.test.ts`
- ✓ `uses NEXT_PUBLIC_WS_URL when defined`
- ✓ `converts NEXT_PUBLIC_API_URL to websocket protocol`
- ✓ `routes localhost and local IP to port 8000`
- ✓ `defaults production domains to Render FastAPI backend`
- **Result**: 4 passed in 3.52s

### TypeScript Compiler: `tsc --noEmit`
- Clean typecheck across all web source files with zero errors.
