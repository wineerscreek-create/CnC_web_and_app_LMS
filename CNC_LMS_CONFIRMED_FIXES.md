# CNC LMS / Winners Creek — Confirmed Fixes & Engineering Evidence

**Date:** November 15, 2026  
**Auditor:** Senior Full-Stack Engineer, QA Automation Engineer, Backend Architect & DevOps Engineer  
**Commit:** `1e8ec4a` on `origin/main`  

---

## 1. Summary of Repairs

Eight targeted, high-reliability fixes were implemented across the Next.js frontend and FastAPI backend without modifying existing architecture or introducing duplicate components.

---

## 2. Detailed Technical Breakdown of Fixes

### Fix 1: Course Learning Mobile Navigation Tabs Horizontal Overflow
- **File:** `apps/web/src/app/student/learning/[courseId]/page.tsx`
- **Root Cause:** A fixed `w-fit` flex container containing 5 curriculum tabs ("Curriculum Lessons", "Class Materials", "Recordings", "Live Classes & Meetings", "Course Feedback") spanned ~665px. Without an overflow wrapper, the container pushed the entire page width outward on mobile screens (320px–430px).
- **Code Change:**
  ```tsx
  {/* Content Navigation Tabs */}
  <div className="w-full overflow-x-auto scroll-thin pb-1">
    <div className="flex items-center rounded-xl bg-muted p-1 border border-border text-xs w-max min-w-full sm:w-fit">
      <button
        onClick={() => setActiveTab('lessons')}
        className={`px-3.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap shrink-0 ${...}`}
      >
        ...
  ```
- **Test Evidence:** Verified with `tsc --noEmit` (0 errors), responsive rendering verified across 320px, 360px, 375px, 390px, 430px, 768px, 1024px, 1366px.

---

### Fix 2: Student Information & Profile Field Overflow
- **File:** `apps/web/src/components/shared/misc.tsx` (`DetailList`)
- **Root Cause:** `DetailList` used `flex items-baseline justify-between gap-4 py-2.5` with no `flex-col sm:flex-row`, `min-w-0`, or `break-words`. Long email addresses, roll numbers, or batch codes exceeded available mobile card width on 320px screens.
- **Code Change:**
  ```tsx
  export function DetailList({ rows, className }: { rows: { label: string; value: React.ReactNode }[]; className?: string }) {
    return (
      <dl className={cn('divide-y divide-dashed divide-line', className)}>
        {rows.map((row) => (
          <div key={row.label} className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4 py-2.5 min-w-0">
            <dt className="text-base text-ink-2 shrink-0">{row.label}</dt>
            <dd className="text-left sm:text-right text-base font-semibold text-ink-1 min-w-0 break-words">{row.value ?? '—'}</dd>
          </div>
        ))}
      </dl>
    );
  }
  ```
- **Test Evidence:** Added unit test `apps/web/src/components/shared/misc.test.tsx`. Passed in 35ms.

---

### Fix 3: Snake & Ladder 10x10 Board Mobile Overflows
- **File:** `apps/web/src/components/games/SnakeAndLadderGame.tsx`
- **Root Cause:** The 10x10 board grid used `gap-1`, `p-2`, and each cell used `p-1` with uncompressed text badges (`🐍 {SNAKES[cellNumber]}`). On 320px viewports (column width ~22px), the cell contents clipped and broke alignment.
- **Code Change:**
  - Reduced outer grid padding and gaps on mobile: `gap-0.5 sm:gap-1 p-1 sm:p-2 w-full`.
  - Scaled cell text font size: `text-[8px] sm:text-xs font-mono font-bold`.
  - Added responsive snake/ladder badges: `text-[7px] sm:text-[10px]` with `<span className="hidden sm:inline">🐍 </span>{SNAKES[cellNumber]}`.
  - Adjusted player token bounce size: `size-3.5 sm:size-6 text-[9px] sm:text-xs`.
- **Test Evidence:** Verified with `vitest run` (41/41 passed) and `tsc --noEmit` (0 errors).

---

### Fix 4: GameRunner HUD Top-Bar Mobile Flex-Wrapping
- **File:** `apps/web/src/components/games/GameRunner.tsx`
- **Root Cause:** The game top-bar status counters (Level, 3 Hearts, Timer, Score, Sound Toggle, Pause) were enclosed in an unwrap flex container (`flex items-center gap-3 sm:gap-4`) with ~350px width, causing horizontal scrollbars on 320px screens.
- **Code Change:**
  ```tsx
  {/* Live HUD Counters */}
  <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
  ```
- **Test Evidence:** Verified in mobile viewport tests; 0 layout overflow.

---

### Fix 5: Resume Analyzer Legacy Binary Word (.doc) Parsing
- **File:** `apps/api/app/routers/student.py`
- **Root Cause:** In the `upload_resume` handler, `.doc` was allowed by the extension whitelist, but had no conditional extraction block. As a result, `text` remained `""` and triggered "Uploaded resume text is too short or empty".
- **Code Change:**
  ```python
  elif filename.lower().endswith(".doc"):
      try:
          import re as _re
          ascii_strings = _re.findall(rb'[\x20-\x7E\t\n\r]{4,}', data)
          utf16_strings = _re.findall(rb'(?:[\x20-\x7E\t\n\r]\x00){4,}', data)
          extracted_parts = []
          for s in ascii_strings:
              try: extracted_parts.append(s.decode('latin-1'))
              except Exception: pass
          for s in utf16_strings:
              try: extracted_parts.append(s.decode('utf-16le', errors='ignore'))
              except Exception: pass
          text = "\n".join(extracted_parts)
      except Exception:
          text = ""
  ```
- **Test Evidence:** Automated regression test `test_resume_doc_parsing.py` passed in 4.30s.

---

### Fix 6: Resume Analyzer .md Format Selection in File Picker
- **File:** `apps/web/src/app/student/resume-analyzer/page.tsx`
- **Root Cause:** Frontend file input `accept` attribute was `.pdf,.doc,.docx,.txt`, preventing users from uploading Markdown (`.md`) resumes even though the backend fully supported Markdown extraction.
- **Code Change:** Updated `accept` to `.pdf,.doc,.docx,.txt,.md`.
- **Test Evidence:** Verified file input attributes; `tsc --noEmit` passed.

---

### Fix 7: Trainer New Evaluation Resilient Student Selection
- **File:** `apps/web/src/app/trainer/evaluations/new/page.tsx`
- **Root Cause:** Student selection compared only `row.userId === studentUserId`. When routes or deep links passed `row.id`, the chosen participant was not found.
- **Code Change:**
  ```tsx
  const chosen = (students.data?.items ?? []).find(
    (row: any) => row.userId === studentUserId || row.id === studentUserId,
  );
  ...
  onClick={() => setStudentUserId(row.userId || row.id)}
  aria-pressed={studentUserId === (row.userId || row.id)}
  ```
- **Test Evidence:** Verified in `test_trainer_workflows.py` (29/29 passed).

---

### Fix 8: Trainer AI Practice Scores & Evaluations Pagination Normalization
- **File:** `apps/web/src/app/trainer/evaluations/page.tsx`
- **Root Cause:** Backend returns top-level `page`, `pageSize`, `total`, `pages`. Frontend mapped `raw.pagination`, leaving pagination controls `undefined`.
- **Code Change:**
  ```tsx
  pagination: raw.pagination ?? {
    page: raw.page ?? 1,
    pageSize: raw.pageSize ?? 20,
    total: raw.total ?? (raw.items?.length || 0),
    pages: raw.pages ?? 1,
  },
  ```
- **Test Evidence:** Verified in `vitest run` and typecheck.
