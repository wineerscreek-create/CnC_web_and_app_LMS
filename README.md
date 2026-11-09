# CnC LMS — Winners Creek

**Learn. Practise. Improve. Grow.**

CnC LMS is a Learning Management System designed to support colleges and educational institutions with centralized academic management, interactive learning, student performance tracking, and administrative operations.

The platform provides role-based portals for managing learning activities, users, courses, assessments, and institutional workflows through a centralized system.

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js 15, React, TypeScript |
| Backend | FastAPI, Python |
| Database | PostgreSQL |
| Database Management | SQL-based migrations |
| Caching | Redis |
| UI & Styling | Tailwind CSS, Radix UI |
| State Management | Redux Toolkit |
| Charts & Analytics | Recharts |
| Frontend Deployment | Vercel |
| Backend & Database Hosting | Render |

## Key Features

- **Student Portal:** Learning resources, courses, assessments, progress tracking, and student activities.
- **Trainer Portal:** Student management, attendance, evaluations, and performance monitoring.
- **HOD Portal:** Department-level management, academic monitoring, and reporting.
- **Admin Portal:** User management, course management, department configuration, and institutional operations.
- **Super Admin:** Centralized platform administration and institution management.
- **Learning Management:** Course publishing, content management, and learning activities.
- **Assessments & Evaluation:** Structured assessments, performance tracking, and feedback.
- **Reports & Analytics:** Performance insights and institutional reports.
- **Role-Based Access Control:** Secure access based on user roles and permissions.
- **Operations Center:** Dedicated security and system monitoring interface.

## Project Architecture

The application follows a modular architecture with separate frontend and backend services connected through REST APIs.

```text
CnC-LMS/
│
├── apps/
│   ├── web/                  # Next.js frontend
│   │   └── src/
│   │       ├── app/
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── lib/
│   │       └── store/
│   │
│   └── api/                  # FastAPI backend
│       ├── app/
│       │   ├── core/
│       │   ├── routers/
│       │   ├── services/
│       │   ├── schemas/
│       │   └── models/
│       ├── migrations/
│       └── tests/
│
├── docs/
└── README.md
```

*Directory structure is representative; refer to the repository for the complete implementation.*

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js
- PostgreSQL
- Redis (if enabled in the local configuration)
- Git

### 1. Clone the Repository

```bash
git clone <repository-url>
cd CnC_web_and_app_LMS
```

### 2. Backend Setup

```bash
cd apps/api

python -m venv .venv
```

Activate the virtual environment:

```bash
# Windows
.venv\Scripts\activate

# Linux / macOS
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Configure the environment variables using the project's environment example file. Set the PostgreSQL connection and required secrets.

### 3. Database Configuration

Create a PostgreSQL database and configure its connection in the backend environment.

Apply the database migrations using the migration instructions provided in the repository.

**Important:** Do not run production migrations against a local or shared database without verifying the target connection.

### 4. Start the Backend

```bash
uvicorn app.main:app --reload --port 8000
```

### 5. Frontend Setup

Open another terminal:

```bash
cd apps/web

npm install
npm run dev
```

Open the application:

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs

API documentation availability depends on the backend environment configuration.

## Environment Configuration

Environment variables are used to configure database connections, authentication, integrations, and application settings.

Typical configuration includes:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `JWT_SECRET` | Authentication security |
| `REDIS_URL` | Redis connection |
| `ENV` | Application environment |
| `AI_API_KEY` | AI integration, if enabled |

Refer to the backend environment configuration for the exact required variables.

Never commit `.env` files, credentials, API keys, or private configuration to the repository.

## Testing

### Backend

```bash
cd apps/api
python -m pytest
```

### Frontend

```bash
cd apps/web

npm run typecheck
npm run lint
npm test
npm run build
```

Run only the scripts configured in the respective project `package.json` and backend test configuration.

## Security

The platform uses backend-enforced security controls, including:

- Role-Based Access Control (RBAC).
- Authentication and authorization.
- Server-side permission validation.
- Tenant and department-level data isolation.
- Secure password handling.
- Session and token management.
- API input validation.
- Audit logging and security event monitoring.
- Protected administrative operations.

Frontend route protection is not treated as a substitute for backend authorization.

## Deployment

| Component | Platform |
|---|---|
| Frontend | Vercel |
| Backend API | Render |
| PostgreSQL Database | Render PostgreSQL |
| Source Control | GitHub |

Production configuration and credentials are managed through deployment environment variables.

## Project Documentation

Refer to the `docs/` directory for technical documentation, requirements, architecture, API references, database information, and implementation details.

---

**CnC LMS — A Unified Learning and Management Platform.**
