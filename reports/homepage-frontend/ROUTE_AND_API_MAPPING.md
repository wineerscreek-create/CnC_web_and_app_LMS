# Route and API Mapping Specification

## 1. Frontend Route Mapping

| Route | Type | Description | Key Components Used |
| :--- | :--- | :--- | :--- |
| `/` | Public (Static) | Primary LMS Landing Page | `HomePage`, `TiltCard`, `StaggerContainer`, Trainers Carousel, Curricula Grid |
| `/trainers` | Public (Static) | All Faculty & Trainers Directory | `PublicTrainersPage`, Search & Filter Bar, Department Badges |
| `/trainers/[slug]` | Public (Dynamic) | Trainer Dynamic Dossier Page | `TrainerSlugPage`, Booking Modal, Verified Accreditations, Methodology |
| `/trainer/profile` | Auth (Trainer) | Trainer Profile Management Dashboard | `TrainerProfilePage`, Tabbed Section Editor, Avatar Upload, Completion Bar |
| `/student/dashboard` | Auth (Student) | Student Learning Dashboard | `HeroBanner`, `TiltCard`, `StaggerContainer`, Readiness Index Ring |

## 2. Backend Endpoint Specification

| Method | Endpoint | Access Level | Database Table | Response Payload / Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/user/banner` | Authenticated (All Roles) | `user_banners` | Retrieves user's active banner, position, scale, overlay settings |
| `PATCH` | `/api/v1/user/banner` | Authenticated (All Roles) | `user_banners` | Updates user banner layout, overlay, scale, text color |
| `POST` | `/api/v1/user/banner/upload` | Authenticated (All Roles) | Local disk / S3 | Uploads custom header banner image (< 5 MB) |
| `GET` | `/api/v1/public/trainers` | Public (No Auth) | `trainer_profiles` | Lists published and approved trainers for homepage carousel |
| `GET` | `/api/v1/public/trainers/{slug}` | Public (No Auth) | `trainer_profiles` | Retrieves full public trainer dossier by public URL slug |
| `POST` | `/api/v1/public/trainers/{slug}/inquire` | Public (No Auth) | `trainer_inquiries` | Submits candidate or corporate workshop booking inquiry (201 Created) |
| `GET` | `/api/v1/trainer/profile` | Trainer Auth | `trainer_profiles`, `users` | Returns authenticated trainer's profile, stats, completion % |
| `PATCH` | `/api/v1/trainer/profile` | Trainer Auth | `trainer_profiles` | Saves updated bio, education, certifications, and recalculates completion % |
| `POST` | `/api/v1/trainer/profile/photo` | Trainer Auth | Local disk / S3 | Uploads trainer professional profile avatar (< 5 MB) |
