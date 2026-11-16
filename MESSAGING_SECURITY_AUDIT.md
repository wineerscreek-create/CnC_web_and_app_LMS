# Institute-Based Messaging System — Security Audit

**Winners Creek LMS / SkillSharp**  
**Audit Status:** PASSED  
**Classification:** Internal Technical Architecture & Security Assessment  

---

## 1. Executive Summary

A comprehensive security review of the Institute-Based Messaging System was conducted across data modeling, authentication, authorization, session lifecycles, and real-time WebSocket communication. The architecture enforces strict multi-tenant institute isolation, role-based capabilities, and defensive handling of credentials and attachments.

---

## 2. Threat Modeling & Trust Boundaries

```
+--------------------------------------------------------------------------+
|                         UNTRUSTED CLIENT BROWSER                         |
+--------------------------------------------------------------------------+
       |                                              |
       | HTTPS (Bearer Token in Header)               | WSS (Token in JSON Handshake)
       v                                              v
+--------------------------------------------------------------------------+
|                      SECURITY BOUNDARY / FASTAPI API                     |
|                                                                          |
|  - Token Verification (HMAC-SHA256 JWT, Expiry Check, Audience Check)    |
|  - ScopeContext Resolution (User ID, Role, Institution ID)               |
|  - Institute Isolation Enforcer                                          |
|  - Group Membership & Active Status Guard                                |
|  - Rate & Size Limiter (25MB Attachment Cap)                             |
+--------------------------------------------------------------------------+
       |
       | Parameterized asyncpg Queries
       v
+--------------------------------------------------------------------------+
|                      TRUSTED DATA STORE (PostgreSQL)                     |
|  - Row-level scoping by institution_id                                   |
|  - Relational Foreign Keys with CASCADE/SET NULL                         |
|  - Immutable messaging_audit_logs table                                  |
+--------------------------------------------------------------------------+
```

---

## 3. Role-Based Access Control (RBAC) Matrix

| Action | Student | Trainer | Institution Admin | Super Admin |
| :--- | :---: | :---: | :---: | :---: |
| View own batch group messages |  Yes |  Yes |  Yes |  Yes |
| View other batch groups in institute |  No | Only if assigned |  Yes |  Yes |
| View batch groups of other colleges |  No |  No |  No |  Yes |
| Post messages in batch group |  Yes |  Yes |  Yes |  Yes |
| Post official announcements & pin |  No |  Yes |  Yes |  Yes |
| Edit own message (within 15m) |  Yes |  Yes |  Yes |  Yes |
| Edit other user's message |  No |  No |  No |  No |
| Delete own message |  Yes |  Yes |  Yes |  Yes |
| Moderate/Delete student messages |  No |  Yes |  Yes |  Yes |
| Search directory for direct messaging | Same Institute | Same Institute | Same Institute | Global |
| Initiate direct message | Same Institute | Same Institute | Same Institute | Global |
| Block/Unblock users |  Yes |  Yes |  Yes |  Yes |
| Upload file attachments (<=25MB) |  Yes |  Yes |  Yes |  Yes |

---

## 4. Key Security Controls Evaluated

### 4.1 Token Security in Real-Time WebSockets
- **Vulnerability Prevented**: Token leakage via URL query parameters (`ws://host/path?token=XYZ`).
  - URL query parameters are logged in plaintext by Nginx, Cloudflare, AWS ALB, and browser history.
- **Implementation**: The WebSocket connection opens without credentials in the URL. Immediately after connection establishment, the client must transmit an authentication frame:
  ```json
  { "type": "auth", "token": "eyJhbGciOiJIUzI1Ni..." }
  ```
  Unauthenticated connections are terminated with WebSocket close code `4401` after 10 seconds of inactivity or upon malformed/expired token.

### 4.2 Multi-Tenant Institute Isolation
- Every database query for direct messaging, groups, and search joins on `u.institution_id = $institution_id`.
- In `MessagingService.get_or_create_direct_conversation`:
  ```python
  if user1["role"] != "SUPER_ADMIN" and user2["role"] != "SUPER_ADMIN":
      if user1["institution_id"] != user2["institution_id"]:
          raise ScopeForbidden("Direct messaging across different institutions is strictly prohibited.")
  ```
  Verified by Integration Test Scenario F.

### 4.3 Immediate Session Eviction on Revocation
- When a trainer is unassigned or reassigned to a different batch, the `MessagingHub` executes:
  ```python
  await messaging_hub.revoke_user_from_room(user_id, room_name)
  ```
  The server dispatches a `room_revoked` event to the user's active client sockets and evicts the subscription. Subsequent POST requests to that group return `403 Forbidden` (`ScopeForbidden: You are not an active member of this group`).

### 4.4 Unidirectional Direct Message Blocking
- Blocking is enforced at the service layer prior to database insertion:
  ```python
  block_check = await conn.fetchrow(
      "SELECT 1 FROM messaging_blocks WHERE blocker_id = $1 AND blocked_id = $2",
      target_user_id, sender_id
  )
  if block_check:
      raise BusinessRuleViolation("You cannot send messages to this user because you have been blocked.")
  ```
- **Group Exemption**: Blocking does not apply to official batch groups, ensuring critical academic notices and coursework discussions are never missed.

### 4.5 File Attachment Restrictions
- File size limit: 25MB (`MAX_UPLOAD_SIZE = 25 * 1024 * 1024`).
- MIME type validation: Restricted to documents (`application/pdf`, `msword`, `vnd.openxmlformats...`, `text/plain`, `zip`) and images (`image/jpeg`, `image/png`, `image/webp`). Executables (`.exe`, `.bat`, `.sh`, `.php`) are rejected.
- Signed Storage: Storage driver generates time-limited presigned download URLs rather than serving raw local file paths.

### 4.6 SQL Injection Prevention
- All database interactions use parameterized queries via `asyncpg` (`$1, $2, ...`). Zero dynamic SQL string concatenations exist in `MessagingService`.

---

## 5. Security Audit Conclusion

The system demonstrates defense-in-depth across transport, session, application, and database tiers. All identified attack vectors (cross-tenant leakage, credential logging in URLs, stale session reuse, and unconstrained uploads) have been effectively mitigated and verified by automated tests.
