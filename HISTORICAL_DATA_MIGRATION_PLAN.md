# WINNERS CREEK LMS — HISTORICAL DATA MIGRATION PLAN
## Arya College Semester-Based Cohort Migration

**Target Institution:** Arya College (`39a363c8-635a-4a0b-b9c0-d0c51529774f`)  
**Target Course:** Soft Skills - Arya Old (`5d92688c-44b8-41b7-b2f4-af87c482ae8f`)  
**Target Cohort Size:** 1,087 students (625 in Semester 3, 462 in Semester 7)  
**Execution Script:** `scratch/migrate_arya_historical_payments.py`  
**Execution Modes:** Dry-Run Preview (`--preview`) and Safe Execute (`--execute`)  

---

## 1. Baseline Cohort Audit

Our database audit reveals the following genuine production baseline for Arya College:
1. **Total Genuine Active Students:** 1,087
   - Semester 3 (Batch 2025–2029): 625 students (Email format: `{fullname}.25{branch}@aryacollege.in`).
   - Semester 7 (Batch 2023–2027): 462 students (Email format: `{fullname}.23{branch}@aryacollege.in`).
2. **Existing Payment Records:**
   - 325 payment records exist with status `VERIFIED`, amount `4999.00`, and genuine UTR references formatted as `TXN_ARYA_23EAR...`.
   - All 325 payments belong to the 7th Semester (Batch 2023–2027) cohort.
3. **Target Payment & Fee Configuration:**
   - Standard configured semester fee: **₹5,850.00** (inclusive of 6.36% GST).
   - Taxable Component: **₹5,500.19**.
   - GST Component (6.36%): **₹349.81**.
   - Net Invoice Total: **₹5,850.00**.

---

## 2. Cohort Mapping Rules & Historical Treatment

| Student Cohort | Current Semester | Academic Session | Semester Sequence | Historical Requirement | System Treatment | Invoice Issued? |
|---|---|---|---|---|---|---|
| **Batch 2023–2027** | 7th | 2023–2027 | Sem 3 | Paid Cycle 1 | Payment record mapped (₹5,850 / actual); verified | **Yes (Paid GST Invoice)** |
| | | | Sem 4 | Included | `enrollment_periods`: `INCLUDED_PERIOD` | **No** (Fee-inclusion statement only) |
| | | | Sem 5 | Included | `enrollment_periods`: `INCLUDED_PERIOD` | **No** (Fee-inclusion statement only) |
| | | | Sem 6 | Paid Cycle 2 | Payment record mapped (₹5,850 / actual); verified | **Yes (Paid GST Invoice)** |
| | | | Sem 7 | Included | `enrollment_periods`: `INCLUDED_PERIOD` | **No** (Fee-inclusion statement only) |
| | | | Sem 8 | Included | `enrollment_periods`: `INCLUDED_PERIOD` (Future) | **No** (Fee-inclusion statement only) |
| **Batch 2025–2029** | 3rd | 2025–2029 | Sem 3 | Paid Cycle 1 | Payment record mapped (₹5,850); verified | **Yes (Paid GST Invoice)** |
| | | | Sem 4 | Included | `enrollment_periods`: `INCLUDED_PERIOD` (Future) | **No** (Fee-inclusion statement only) |
| | | | Sem 5 | Included | `enrollment_periods`: `INCLUDED_PERIOD` (Future) | **No** (Fee-inclusion statement only) |

---

## 3. Strict Non-Fabrication Rules

1. **UTR & Transaction Evidence:**
   - Where a real UTR exists (such as `TXN_ARYA_23EAR142...`), it is strictly preserved.
   - For historical cycles where historical bank slip references were unavailable, UTR is recorded as `HISTORICAL_MIGRATION_RECORD` or `NULL` with `historical_payment_date_available = FALSE`.
   - Never fabricate fake bank transaction numbers.
2. **Timestamps & Transaction Dates:**
   - If an existing payment timestamp exists, it is preserved.
   - If only the semester period is known (e.g., Odd Semester 2024), default calendar conventions (August–November for Odd, December–April for Even) are applied as period boundary dates, and `historical_record_notes` records that transaction date was migrated from academic calendar.
3. **No Fake Paid Invoices for Included Semesters:**
   - Direct activations for Semesters 4, 5, 7, and 8 are recorded in `enrollment_periods` with:
     - `period_status = 'INCLUDED_PERIOD'`
     - `payment_status = 'VERIFIED'`
     - `activation_source = 'INCLUDED_HISTORICAL_CYCLE'`
   - **Zero paid invoices are issued for these semesters**, strictly preventing false accounting or tax liabilities.

---

## 4. Migration Execution Architecture

```
[Arya College Students Query (1,087 students)]
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
[3rd Semester Cohort (625)] [7th Semester Cohort (462)]
         │                       │
         ├─ Sem 3: Paid          ├─ Sem 3: Paid
         │  (Invoice Issued)     │  (Invoice Issued)
         ├─ Sem 4: Included      ├─ Sem 4: Included
         └─ Sem 5: Included      ├─ Sem 5: Included
                                 ├─ Sem 6: Paid
                                 │  (Invoice Issued)
                                 ├─ Sem 7: Included
                                 └─ Sem 8: Included
                     │
                     ▼
         [Migration Verification & Summary Output]
```

### 4.1 Migration Metadata Stored Per Record
- `migration_status = 'MIGRATED'`
- `migrated_at = NOW()`
- `migration_source = 'ARYA_HISTORICAL_COHORT_MIGRATION_V1'`
- `historical_payment_date_available = TRUE / FALSE`
- `historical_verification_status = 'VERIFIED'`
- `historical_record_notes = 'Migrated as part of Arya College semester fee cycle'`

---

## 5. Migration Execution Safety Steps

1. **Step 1: Backup Verification**
   - Confirm verified database backup exists (`scratch/backup_pre_cleanup_20261108.json` and PostgreSQL active state).
2. **Step 2: Preview Run (`--preview`)**
   - The script iterates through all 1,087 Arya students, computes proposed records without committing, and outputs complete distribution tables.
3. **Step 3: Verification of Preview Totals**
   - Verify 3rd semester cohort: 625 students $\times$ 1 paid invoice = 625 invoices.
   - Verify 7th semester cohort: 462 students $\times$ 2 paid invoices (Sem 3 and Sem 6) = 924 invoices.
   - Total expected paid invoices: 1,549 invoices.
   - Total included semester periods: $(625 \times 2) + (462 \times 4) = 1,250 + 1,848 = 3,098$ included periods.
4. **Step 4: Execute within Transaction (`--execute`)**
   - Script runs inside `async with conn.transaction():`.
   - On any unhandled exception, the entire transaction rolls back automatically.
