# BACKEND API TEST REPORT
**Platform:** Winners Creek LMS  
**Test Suite:** `apps/api/audit_all_roles.py`  
**Execution Environment:** Python 3.13, PostgreSQL, FastAPI  
**Test Date:** 2026-11-06  
**Result:** 76 / 76 PASSED (100% SUCCESS)  

---

## 1. Role-by-Role Test Execution Summary

### 1.1 Super Admin (`superadmin@eedilms.app`)
| Endpoint | Method | Expected | Result |
| :--- | :--- | :--- | :--- |
| `/api/v1/super-admin/dashboard` | GET | 200 OK | **200 OK** |
| `/api/v1/super-admin/colleges` | GET | 200 OK | **200 OK** |
| `/api/v1/super-admin/courses` | GET | 200 OK | **200 OK** |
| `/api/v1/super-admin/users` | GET | 200 OK | **200 OK** |
| `/api/v1/super-admin/payments` | GET | 200 OK | **200 OK** |
| `/api/v1/super-admin/payments/verification-queue` | GET | 200 OK | **200 OK** |
| `/api/v1/super-admin/ebooks/requests` | GET | 200 OK | **200 OK** |
| `/api/v1/super-admin/ebooks/reports` | GET | 200 OK | **200 OK** |
| `/api/v1/super-admin/games` | GET | 200 OK | **200 OK** |
| `/api/v1/super-admin/system` | GET | 200 OK | **200 OK** |
| `/api/v1/user/banner` | GET | 200 OK | **200 OK** |
| `/api/v1/auth/me` | GET | 200 OK | **200 OK** |
| `/api/v1/home/courses` | GET | 200 OK | **200 OK** |
| `/api/v1/home/announcements` | GET | 200 OK | **200 OK** |
| `/api/v1/home/institutions` | GET | 200 OK | **200 OK** |

### 1.2 Institution Admin (`test_admin@abcengg.edu`)
| Endpoint | Method | Expected | Result |
| :--- | :--- | :--- | :--- |
| `/api/v1/admin/dashboard` | GET | 200 OK | **200 OK** |
| `/api/v1/admin/departments` | GET | 200 OK | **200 OK** |
| `/api/v1/admin/batches` | GET | 200 OK | **200 OK** |
| `/api/v1/admin/trainers` | GET | 200 OK | **200 OK** |
| `/api/v1/admin/users` | GET | 200 OK | **200 OK** |
| `/api/v1/admin/payments` | GET | 200 OK | **200 OK** |
| `/api/v1/admin/payments/summary` | GET | 200 OK | **200 OK** |
| `/api/v1/admin/reports` | GET | 200 OK | **200 OK** |
| `/api/v1/admin/reports/catalogue` | GET | 200 OK | **200 OK** |
| `/api/v1/admin/games` | GET | 200 OK | **200 OK** |
| `/api/v1/admin/games/{id}/attempts` | GET | 200 OK | **200 OK** |
| `/api/v1/admin/system-health` | GET | 200 OK | **200 OK** |
| `/api/v1/admin/ai-usage` | GET | 200 OK | **200 OK** |
| `/api/v1/admin/import/jobs` | GET | 200 OK | **200 OK** |
| `/api/v1/admin/semesters` | GET | 200 OK | **200 OK** |
| `/api/v1/admin/training-modules` | GET | 200 OK | **200 OK** |
| `/api/v1/user/banner` | GET | 200 OK | **200 OK** |
| `/api/v1/auth/me` | GET | 200 OK | **200 OK** |

### 1.3 Trainer (`test_trainer@abcengg.edu`)
| Endpoint | Method | Expected | Result |
| :--- | :--- | :--- | :--- |
| `/api/v1/trainer/dashboard` | GET | 200 OK | **200 OK** |
| `/api/v1/trainer/batches` | GET | 200 OK | **200 OK** |
| `/api/v1/trainer/sessions` | GET | 200 OK | **200 OK** |
| `/api/v1/trainer/assignments` | GET | 200 OK | **200 OK** |
| `/api/v1/trainer/course-progress` | GET | 200 OK | **200 OK** |
| `/api/v1/trainer/evaluations` | GET | 200 OK | **200 OK** |
| `/api/v1/trainer/evaluations/parameters` | GET | 200 OK | **200 OK** |
| `/api/v1/trainer/alerts` | GET | 200 OK | **200 OK** |
| `/api/v1/trainer/reports` | GET | 200 OK | **200 OK** |
| `/api/v1/trainer/students` | GET | 200 OK | **200 OK** |
| `/api/v1/trainer/chat/conversations` | GET | 200 OK | **200 OK** |
| `/api/v1/trainer/chat/students` | GET | 200 OK | **200 OK** |
| `/api/v1/trainer/courses` | GET | 200 OK | **200 OK** |
| `/api/v1/trainer/ebooks` | GET | 200 OK | **200 OK** |
| `/api/v1/trainer/games` | GET | 200 OK | **200 OK** |
| `/api/v1/trainer/profile` | GET | 200 OK | **200 OK** |
| `/api/v1/trainer/training-modules` | GET | 200 OK | **200 OK** |
| `/api/v1/user/banner` | GET | 200 OK | **200 OK** |
| `/api/v1/auth/me` | GET | 200 OK | **200 OK** |

### 1.4 Participant / Student (`sandeep.27cs@aryacollege.in`)
| Endpoint | Method | Expected | Result |
| :--- | :--- | :--- | :--- |
| `/api/v1/student/dashboard` | GET | 200 OK | **200 OK** |
| `/api/v1/student/courses` | GET | 200 OK | **200 OK** |
| `/api/v1/student/learning-path` | GET | 200 OK | **200 OK** |
| `/api/v1/student/progress` | GET | 200 OK | **200 OK** |
| `/api/v1/student/placement-goal` | GET | 200 OK | **200 OK** |
| `/api/v1/student/profile` | GET | 200 OK | **200 OK** |
| `/api/v1/student/achievements` | GET | 200 OK | **200 OK** |
| `/api/v1/student/assessments` | GET | 200 OK | **200 OK** |
| `/api/v1/student/assignments` | GET | 200 OK | **200 OK** |
| `/api/v1/student/chat/conversations` | GET | 200 OK | **200 OK** |
| `/api/v1/student/chat/mentors` | GET | 200 OK | **200 OK** |
| `/api/v1/student/ebooks` | GET | 200 OK | **200 OK** |
| `/api/v1/student/ebooks/my-uploads` | GET | 200 OK | **200 OK** |
| `/api/v1/student/games` | GET | 200 OK | **200 OK** |
| `/api/v1/student/payments` | GET | 200 OK | **200 OK** |
| `/api/v1/student/practice/modes` | GET | 200 OK | **200 OK** |
| `/api/v1/student/practice/sessions` | GET | 200 OK | **200 OK** |
| `/api/v1/student/resume/analysis` | GET | 200 OK | **200 OK** |
| `/api/v1/student/settings` | GET | 200 OK | **200 OK** |
| `/api/v1/student/trials` | GET | 200 OK | **200 OK** |
| `/api/v1/student/recommendations/courses` | GET | 200 OK | **200 OK** |
| `/api/v1/live-classes/my` | GET | 200 OK | **200 OK** |
| `/api/v1/live-classes/recordings/my` | GET | 200 OK | **200 OK** |
| `/api/v1/user/banner` | GET | 200 OK | **200 OK** |
| `/api/v1/auth/me` | GET | 200 OK | **200 OK** |
