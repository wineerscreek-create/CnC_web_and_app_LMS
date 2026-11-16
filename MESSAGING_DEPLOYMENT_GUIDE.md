# Institute-Based Messaging System — Deployment & Operations Guide

**Winners Creek LMS / SkillSharp**  
**Target Environments:** Production (Render / Vercel), Staging, and Local Development  

---

## 1. Database Migration

The messaging system requires migration `022_institute_messaging_system.sql`.

### Apply Migration via psql
```bash
# In production / staging container or direct PostgreSQL host
psql -U postgres -d cnc -f apps/api/migrations/022_institute_messaging_system.sql
```

### Verification
Ensure the following 8 tables and indexes exist:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name LIKE 'messaging_%';

-- Output:
-- messaging_groups
-- messaging_group_members
-- messaging_conversations
-- messaging_messages
-- messaging_attachments
-- messaging_blocks
-- messaging_read_receipts
-- messaging_audit_logs
```

---

## 2. One-Time Historical Data Reconciliation

After applying the migration, run the automated reconciliation job to parse existing LMS batches, generate official batch groups (`PASSOUT_YEAR-BRANCH-SECTION Group`), and enroll existing students and trainers.

### Via API Endpoint (Admin / Super Admin):
```bash
curl -X POST https://api.yourdomain.com/api/v1/messaging/sync/reconcile \
  -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
```

### Response:
```json
{
  "status": "success",
  "groups_synced": 97,
  "student_memberships_synced": 2480,
  "trainer_memberships_synced": 70
}
```

### Via Python Script (Direct Backend Host):
```python
import asyncio
from app.services.messaging_service import MessagingService

async def reconcile():
    print("Syncing batch groups...")
    groups = await MessagingService.sync_all_institute_batch_groups()
    print(f"Synced {len(groups)} batch groups.")
    
    print("Reconciling student batch memberships...")
    students = await MessagingService.reconcile_all_students()
    print(f"Reconciled {students} student memberships.")
    
    print("Reconciling trainer batch assignments...")
    trainers = await MessagingService.reconcile_all_trainers()
    print(f"Reconciled {trainers} trainer assignments.")

asyncio.run(reconcile())
```

---

## 3. Environment Variables Configuration

### Backend (`apps/api/.env`)
| Variable | Description | Example |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/cnc` |
| `JWT_SECRET` | Signing secret for authentication tokens | `your-secure-jwt-secret` |
| `STORAGE_DRIVER` | File storage provider (`local`, `s3`, `r2`) | `s3` or `local` |
| `MAX_ATTACHMENT_SIZE` | Maximum upload byte size (default: 25MB) | `26214400` |

### Frontend (`apps/web/.env.production`)
| Variable | Description | Example |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | Base HTTP endpoint for REST calls | `https://cnc-backend-qzmb.onrender.com` |
| `NEXT_PUBLIC_WS_URL` | Base WebSocket endpoint | `wss://cnc-backend-qzmb.onrender.com` |

---

## 4. Reverse Proxy & WebSocket Configuration

### Nginx (FastAPI Reverse Proxy)
```nginx
location /api/v1/messaging/ws {
    proxy_pass http://backend_upstream/api/v1/messaging/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Prevent connection drop during idle periods (heartbeat handles 25s ping)
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

### Cloudflare
1. In Cloudflare Dashboard -> **Network**, verify **WebSockets** is toggled **ON**.
2. No query string caching rules should match `/api/v1/messaging/*`.

---

## 5. Monitoring & Operational Health Checks

### Health Endpoints
- **REST Health**: `GET /api/v1/health` -> returns `{"status": "ok"}`
- **Messaging Hub Status**: `GET /api/v1/messaging/groups` with valid auth bearer token.

### Audit Logs
All security and membership lifecycle events are logged in `messaging_audit_logs`. To monitor room revocations or blocks:
```sql
SELECT event_type, user_id, group_id, performed_by, details, created_at 
FROM messaging_audit_logs 
ORDER BY created_at DESC 
LIMIT 50;
```

---

## 6. Rollback Plan

If a rollback is required:
1. Revert web frontend deployment to previous commit.
2. The database schema does not alter any existing LMS tables (`batches`, `users`, `departments`, `student_profiles` only have foreign keys referenced from `messaging_*`).
3. If dropping messaging tables is desired:
   ```sql
   DROP TABLE IF EXISTS messaging_audit_logs CASCADE;
   DROP TABLE IF EXISTS messaging_read_receipts CASCADE;
   DROP TABLE IF EXISTS messaging_blocks CASCADE;
   DROP TABLE IF EXISTS messaging_attachments CASCADE;
   DROP TABLE IF EXISTS messaging_messages CASCADE;
   DROP TABLE IF EXISTS messaging_conversations CASCADE;
   DROP TABLE IF EXISTS messaging_group_members CASCADE;
   DROP TABLE IF EXISTS messaging_groups CASCADE;
   ```
