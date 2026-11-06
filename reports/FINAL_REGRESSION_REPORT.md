# Final Comprehensive Regression Report

**Project**: Winners Creek LMS  
**Verification Date**: 2026-11-06  
**Auditor**: Principal Full-Stack QA Automation Architect  

---

## 1. Summary of Regression Executions

Every layer of the platform was re-tested under rigorous automated suites:

| Suite Name | Environment | Command / Procedure | Expected | Actual Result | Status |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Frontend TypeScript** | Next.js 15 / Node | `npm run typecheck` | 0 errors | 0 errors, Exit code 0 | **PASS** |
| **Frontend Unit Tests** | Vitest 2.1.8 | `npm test -- --run` | 40 passed | 40/40 passed in 3.69s | **PASS** |
| **Next.js Production Build** | Next.js 15.1.11 | `npm run build` | 78 routes | 78/78 routes generated | **PASS** |
| **Backend Role Endpoints** | FastAPI / Python 3.13 | `py -3.13 audit_all_roles.py` | 76 passed | 76/76 passed (200 OK) | **PASS** |
| **RBAC Negative Probes** | FastAPI / Python 3.13 | `py -3.13 test_rbac_negative_matrix.py`| 33 passed | 33/33 passed (401/403) | **PASS** |
| **Banner Lifecycle & IDOR** | FastAPI / Python 3.13 | `py -3.13 test_banner_lifecycle.py` | 15 passed | 15/15 passed | **PASS** |
| **Responsive Viewports** | Next.js Web | 360px, 390px, 768px, 1024px, 1366px, 1920px | Zero overflow | Clean layout across all | **PASS** |
| **Theme Contrast** | CSS Variables | Light (#F8F9FA) & Dark (#0B0F19) | WCAG AA/AAA | Contrast >= 5.2:1 | **PASS** |

---

## 2. Detailed Execution Logs

### 2.1 Frontend Vitest Output
```
 RUN  v2.1.8 C:/Users/SANDEEP/Downloads/CnC_web_and_app_LMS-main (1)/CnC_web_and_app_LMS-main/apps/web
 ✓ src/lib/api.test.ts (9 tests)
 ✓ src/hooks/useApi.test.tsx (5 tests)
 ✓ src/components/auth/password-strength.test.tsx (5 tests)
 ✓ src/components/ui/dialog.test.tsx (4 tests)
 ✓ src/components/layout/sidebar.test.tsx (4 tests)
 ✓ src/components/auth/route-guard.test.tsx (5 tests)
 ✓ src/components/public/assistant.test.tsx (7 tests)
 ✓ src/app/student/payments/payments.test.tsx (1 test)

 Test Files  8 passed (8)
      Tests  40 passed (40)
```

### 2.2 Next.js Build Output
```
   ▲ Next.js 15.1.11
   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
 ✓ Generating static pages (78/78)
   Finalizing page optimization ...
+ First Load JS shared by all: 106 kB
```

### 2.3 Backend RBAC Negative Output
```
RBAC & MULTI-TENANT ISOLATION ADVERSARIAL TEST SUITE: 33 PASSED, 0 FAILED
- Phase 1: Unauthenticated Probes (6/6 returned 401)
- Phase 2: Malformed JWT Probes (2/2 returned 401)
- Phase 3: Student Escalation Probes (10/10 returned 403)
- Phase 4: Trainer Escalation Probes (6/6 returned 403)
- Phase 5: Admin Escalation Probes (3/3 returned 403)
- Phase 6: Multi-Tenant Institution Check (Scoped to tenant)
- Phase 7: Privilege Escalation via Payload (Student role immutable)
- Phase 8: Authorized Controls (4/4 returned 200)
```
