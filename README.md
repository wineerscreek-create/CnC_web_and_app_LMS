# CnC LMS – Learning Management System

**CnC LMS** is a college-focused Learning Management System designed to enhance students' communication, soft skills, personality development, and professional readiness through interactive learning, assessments, practice activities, and performance tracking.

## Key Features

- **Student Portal:** Access courses, practice activities, assessments, games, and personal performance reports.
- **Trainer Portal:** Manage assigned batches, attendance, student evaluations, and performance.
- **HOD Portal:** Monitor departmental activities, student progress, and trainer performance.
- **Admin Portal:** Manage institutions, departments, users, courses, reports, and certificates.
- **Super Admin:** Platform-level administration and access management.
- **AI-Powered Evaluation:** Evaluate communication skills and practice sessions using AI-assisted assessment.
- **Performance Analytics:** Track student progress, readiness scores, and skill development.
- **Interactive Learning:** Skill-based games, practice modules, and assessments.
- **Role-Based Access Control:** Secure access based on user roles and institutional permissions.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript |
| Backend | Python, FastAPI |
| Database | MongoDB |
| Cache & Queue | Redis |
| State Management | Redux Toolkit |
| UI | Tailwind CSS, Radix UI |
| Data Visualization | Recharts |
| Testing | Pytest, Vitest, Playwright |

## User Roles

The platform supports role-based access for:

1. Student
2. Trainer
3. HOD
4. Institution Admin
5. Super Admin
6. Placement Cell
7. Recruiter
8. Parent

Each role has defined permissions and access restrictions.

## Project Structure

```text
CnC-LMS/
│
├── apps/
│   ├── api/                 # FastAPI Backend
│   │   ├── app/
│   │   │   ├── authz/
│   │   │   ├── core/
│   │   │   ├── db/
│   │   │   ├── repositories/
│   │   │   ├── routers/
│   │   │   ├── schemas/
│   │   │   ├── services/
│   │   │   └── workers/
│   │   └── tests/
│   │
│   └── web/                 # Next.js Frontend
│       └── src/
│           ├── app/
│           ├── components/
│           ├── hooks/
│           ├── lib/
│           └── store/
│
└── docs/                    # Project Documentation
```

## Installation & Setup

### Prerequisites

- Python 3.11+
- Node.js
- MongoDB
- Redis

### 1. Clone Repository

```bash
git clone <repository-url>
cd CnC-LMS
```

### 2. Backend Setup

```bash
cd apps/api

python -m venv .venv

# Activate virtual environment
# Windows
.venv\Scripts\activate

# Linux/macOS
source .venv/bin/activate

pip install -r requirements.txt

cp .env.example .env
```

Configure the required environment variables in `.env`.

Start the backend:

```bash
uvicorn app.main:app --reload --port 8000
```

### 3. Start Background Worker

```bash
cd apps/api

python -m app.workers.worker
```

### 4. Frontend Setup

```bash
cd apps/web

npm install
npm run dev
```

Open the application:

```text
http://localhost:3000
```

Backend API documentation:

```text
http://localhost:8000/docs
```

## Environment Configuration

Configure the following variables in the backend `.env` file:

| Variable | Description |
|---|---|
| `MONGODB_URL` | MongoDB connection URL |
| `MONGODB_DB` | Database name |
| `REDIS_URL` | Redis connection URL |
| `JWT_SECRET` | Authentication secret |
| `STORAGE_DRIVER` | File storage configuration |
| `AI_PROVIDER` | AI evaluation provider |
| `AI_API_KEY` | AI provider API key |

Refer to `.env.example` for the complete configuration.

**Important:** Never commit environment files, API keys, passwords, or other sensitive credentials.

## Testing

### Backend

```bash
cd apps/api
python -m pytest tests/ -q
```

### Frontend

```bash
cd apps/web

npm run typecheck
npm run lint
npm test
npm run build
npm run e2e
```

## Security

- Role-Based Access Control (RBAC).
- Institution and department-level data isolation.
- Secure authentication and session management.
- Password hashing and account protection.
- Protected API endpoints.
- Audit logging and security monitoring.
- Private file storage with secure access.

## Project Documentation

Detailed technical documentation is available in the `docs/` directory.

## License

This project is maintained for the CnC LMS platform.
