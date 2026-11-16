# Institute-Based Messaging System — Implementation Report

**Winners Creek LMS / SkillSharp**  
**Date:** November 2026  
**Status:** Completed & Verified  

---

## Executive Summary

The Institute-Based Messaging System provides a real-time, institution-scoped collaboration and communication platform natively integrated into the Winners Creek LMS. It introduces automated batch group formation, automatic student membership synchronization, dynamic trainer access management with historical preservation, secure 1-on-1 direct messaging, user blocking enforcement, and full-duplex WebSocket messaging with strict Role-Based Access Control (RBAC).

---

## 1. Architecture Overview

```
                      +---------------------------------------+
                      |         Web Browser Clients           |
                      |  (Student & Trainer Portal Next.js)   |
                      +-------------------+-------------------+
                                          |
                        HTTP REST / WS    | (Auth via Bearer Header / First Frame)
                                          v
                      +---------------------------------------+
                      |        FastAPI Backend Engine         |
                      | - /api/v1/messaging/* REST Endpoints  |
                      | - /api/v1/messaging/ws WebSocket Hub  |
                      | - ScopeContext RBAC & Institute Guard |
                      +-------------------+-------------------+
                                          |
                      +-------------------+-------------------+
                      |      Core Services & Managers         |
                      | - MessagingService                    |
                      | - MessagingHub (WS Room Manager)      |
                      | - StorageDriver (File Attachments)    |
                      +-------------------+-------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |       PostgreSQL Relational DB        |
                      | - messaging_groups                    |
                      | - messaging_group_members             |
                      | - messaging_conversations             |
                      | - messaging_messages                  |
                      | - messaging_attachments               |
                      | - messaging_blocks                    |
                      | - messaging_read_receipts             |
                      | - messaging_audit_logs                |
                      +---------------------------------------+
```

---

## 2. Database Schema & Migration

Database migration `apps/api/migrations/022_institute_messaging_system.sql` established the relational foundation:

### Tables Implemented
1. `messaging_groups`: Scoped uniquely per institution via `UNIQUE(institution_id, normalized_key)`. Contains metadata: `id`, `institution_id`, `batch_id`, `name`, `normalized_key`, `passout_year`, `branch`, `section`, `department_id`, `is_archived`.
2. `messaging_group_members`: Maintains group membership: `id`, `group_id`, `user_id`, `role`, `joined_at`, `is_active`, `is_muted`, `last_read_at`, `unread_count`, `UNIQUE(group_id, user_id)`.
3. `messaging_conversations`: Manages canonical 1-on-1 direct conversations with ordering `CHECK(user1_id < user2_id)` and `UNIQUE(user1_id, user2_id)`. Tracks unread counts per participant and last message snippet.
4. `messaging_messages`: Central message store for both group and direct conversations. Supports message types (`text`, `announcement`, `file`, `system`), threaded replies (`reply_to_id`), pinned state, edit tracking (`is_edited`, 15-minute window), and soft deletes (`is_deleted`).
5. `messaging_attachments`: Stores file attachments: `id`, `message_id`, `file_name`, `file_url`, `file_type`, `file_size_bytes`.
6. `messaging_blocks`: Enforces user-level direct messaging blocks: `id`, `blocker_id`, `blocked_id`, `reason`, `UNIQUE(blocker_id, blocked_id)`.
7. `messaging_read_receipts`: Tracks per-user read timestamps for messages: `id`, `message_id`, `user_id`, `read_at`.
8. `messaging_audit_logs`: Immutable security audit log tracking room access, assignments, revocations, and blocks.

---

## 3. Key Functional Modules

### 3.1 Automated Group Identity & Naming
- **Naming Rule**: Strictly formatted as `PASSOUT_YEAR-BRANCH-SECTION Group` (e.g. `2027-CS-C Group`, `2027-IT-A Group`, `2029-AI-B Group`).
- **Normalized Key**: `PASSOUT_YEAR-BRANCH-SECTION` ensures idempotent lookups and prevents duplicate groups across batch imports or updates.
- **Parsing Heuristics**: Extracts passout year (e.g., from `2023-2027` -> `2027`), branch/discipline (`CS`, `IT`, `AI`, `ECE`, etc.), and section (`A`, `B`, `C`, `D`).

### 3.2 Automatic Student Batch Membership
- When a student is assigned to a batch via admin assignment or CSV roster import:
  1. The student is activated in their section's batch group (`messaging_group_members.is_active = TRUE`).
  2. Any previous batch group memberships in that institution are deactivated (`is_active = FALSE`).
  3. Student only sees their assigned batch group and cannot access groups for other sections or years.

### 3.3 Dynamic Trainer Assignment & Revocation
- **Grant Access**: When a trainer is assigned to a batch, they are immediately enrolled into the corresponding batch group.
- **Access Revocation**: When unassigned or reassigned to a different batch:
  - The trainer's `is_active` flag is set to `FALSE`.
  - The real-time WebSocket manager immediately sends a `room_revoked` event to all active sessions of the trainer and removes their socket subscriptions.
  - **Preservation of History**: The group itself and all existing messages sent by the trainer remain fully preserved for students, replacement trainers, and administrators.

### 3.4 Personal Direct Messaging (1-on-1)
- Users can search directory by email address or LMS User UUID.
- Search queries are strictly scoped to the searcher's institution unless the caller is a `SUPER_ADMIN`.
- System establishes or reuses a canonical conversation pair (`user1_id < user2_id`).

### 3.5 Unidirectional Blocking System
- Any user can block another user from direct messaging.
- When User A blocks User B:
  - User B cannot send direct messages to User A (`BusinessRuleViolation: You cannot send messages to this user because you have been blocked`).
  - Existing direct message history remains preserved.
  - Official batch group communication is untouched (academic notices continue to function).
  - Unblocking immediately restores 1-on-1 direct messaging.

### 3.6 Moderation & Announcement Features
- **Announcements & Pinning**: Trainers and Admins can publish official announcements that automatically pin to the top banner of the batch group.
- **15-Minute Edit Window**: Senders can edit their message within 15 minutes of posting; edited messages display an `(edited)` indicator.
- **Soft Deletion**: Senders can delete their own messages; Trainers and Admins can moderate/delete any student message.
- **Attachments**: Supports PDFs, documents, images, and archives up to 25MB with secure signed URLs.

### 3.7 Secure WebSocket Engine
- **No Query Param Tokens**: To prevent token leakage in server logs, reverse proxy logs, and browser history, JWT authentication is performed strictly over the first WebSocket frame payload: `{"type": "auth", "token": "..."}`.
- **Room Subscriptions**: Dynamic `group:<uuid>` and `conv:<uuid>` channels.
- **Heartbeat & Reconnection**: 25-second ping interval and exponential backoff client reconnects.

---

## 4. Frontend Integration

1. `apps/web/src/lib/messaging/ws.ts`: Robust WebSocket manager supporting handshake auth, room lifecycle, reconnection, and event callbacks.
2. `apps/web/src/components/messaging/MessagingApp.tsx`:
   - Unified desktop and mobile-responsive interface.
   - Batch group list with unread badges, section badges, and passout year.
   - Direct message list with avatar colors, role indicators, and unread counters.
   - User search modal (email/UUID).
   - Message thread with replies, announcements, pinned banners, attachments, and actions (reply, edit, delete, pin, block).
3. `apps/web/src/app/student/chat/page.tsx`: Integrated with top-level tabs allowing seamless switching between Institute/Batch Chat and AI Academic Coach.
4. `apps/web/src/app/trainer/chat/page.tsx`: Embedded directly as the trainer's batch communication hub.
