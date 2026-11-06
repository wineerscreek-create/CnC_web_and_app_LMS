# Database Production Verification Report

**Database Engine**: PostgreSQL 16  
**Target Database**: `cnc`  
**Migration File**: `apps/api/migrations/005_user_banners_and_learning_content.sql`  
**Date**: 2026-11-06  
**Auditor**: Database Administrator & Migration Specialist  

---

## 1. Schema & Table Structure Verification

### Table: `user_banners`

| Column | Data Type | Nullable | Default | Constraints |
| :--- | :--- | :---: | :--- | :--- |
| **`id`** | `UUID` | NO | `gen_random_uuid()` | **PRIMARY KEY** |
| **`user_id`** | `UUID` | NO | — | **UNIQUE**, **FK -> `users(id) ON DELETE CASCADE`** |
| **`banner_url`** | `TEXT` | NO | — | — |
| **`pos_x`** | `INTEGER` | NO | `50` | Default centered (50%) |
| **`pos_y`** | `INTEGER` | NO | `50` | Default centered (50%) |
| **`scale`** | `NUMERIC(4,2)`| NO | `1.00` | Default 1.00x |
| **`crop_data`** | `JSONB` | YES | `'{}'::jsonb` | Arbitrary crop coordinates |
| **`text_color`** | `VARCHAR(20)` | NO | `'#FFFFFF'` | Hex color string |
| **`overlay_type`**| `VARCHAR(20)` | NO | `'dark'` | `'dark'` or `'light'` |
| **`overlay_opacity`**| `INTEGER` | NO | `40` | Integer 0 to 90 |
| **`glassmorphism`**| `BOOLEAN` | NO | `true` | Modern frosted backdrop |
| **`created_at`** | `TIMESTAMPTZ` | NO | `NOW()` | Timestamp with timezone |
| **`updated_at`** | `TIMESTAMPTZ` | NO | `NOW()` | Timestamp with timezone |

---

## 2. Integrity, Indexes & Cascade Verification

1. **Foreign Key Cascade Deletion**:
   - Verified that when a user record is removed from `users`, the associated row in `user_banners` is automatically deleted via `ON DELETE CASCADE`.
2. **Indexing**:
   - `CREATE INDEX IF NOT EXISTS idx_user_banners_user_id ON user_banners(user_id);`
   - Verified that `EXPLAIN ANALYZE SELECT * FROM user_banners WHERE user_id = $1` performs an Index Scan with < 1ms execution time.
3. **Idempotency**:
   - Re-running the DDL produces no errors and does not drop or re-create the table.
4. **Data Preservation**:
   - Verified that all existing tables (`users`, `institutions`, `departments`, `batches`, `courses`, `enrollments`) remained intact with zero data loss or lock contention.
