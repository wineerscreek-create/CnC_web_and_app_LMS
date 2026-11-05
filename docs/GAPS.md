# Frontend / Backend Integration Gaps & Workarounds

This document catalogues functional capabilities where the frontend UI expects specific data structures, streaming responses, or third-party integrations that require backend service configuration or development, along with the current safe frontend workarounds.

---

## 1. Identified UI / Backend Gaps

| # | Screen / Feature | What is Missing in Backend | Suggested Backend Change (For Decision) | Frontend Workaround |
|---|---|---|---|---|
| **1** | **Participant — AI Presentation Coach** (`/student/practice/presentation-coach`) | Automatic Speech-to-Text (STT) audio transcription pipeline for raw audio blob uploads. | Add an endpoint `POST /api/v1/ai/transcribe-audio` backed by Whisper or cloud STT to return timestamped word tokens, filler words, and cadence. | The UI uses the browser SpeechRecognition Web API when available and falls back to deterministic client-side pacing and filler word analysis. |
| **2** | **Participant — Live Video Classroom** (`/live-classes/[id]/room`) | Multi-party SFU media server for large cohort video rooms (>10 participants). | Integrate an SFU provider (e.g. LiveKit Cloud or mediasoup) behind `GET /student/live-classes/{id}/token` to issue signed room tokens. | The UI includes a full WebRTC P2P mesh and interactive room simulator when external media server credentials are not provisioned. |
| **3** | **Participant — Resume ATS Scanner** (`/student/resume-analyzer`) | Complex multi-column OCR / PDF parsing for graphical or non-standard resumes. | Add server-side unstructured PDF parsing in `POST /api/v1/student/resume-analyzer/scan` using PyMuPDF or Tesseract OCR. | Frontend extracts text in-browser using PDF.js text layer and sends structured plain text to `/api/v1/ai/assess` for deterministic keyword matching. |
| **4** | **Platform — Master Course Mode Sync** (`/super-admin/courses`) | Automatic bulk propagation of syllabus updates from master courses down into all active college batch instances. | Implement a Celery / Redis queue background task triggered by `POST /courses/{id}/publish` to sync curriculum changes across existing student progress records. | UI prompts the admin that existing batch instances retain their current snapshot until explicit cohort synchronization. |
| **5** | **SPOC / HOD — Defaulter Notification Triggers** (`/hod/attendance`) | Automated WhatsApp or SMS gateway integration for defaulting attendance alerts. | Add Twilio / SMS webhook integration in `POST /hod/alerts/notify-defaulters`. | Frontend renders student email address and roll number with standard `mailto:` action triggers and CSV export for institutional staff. |
| **6** | **Trainer — Interactive Mini-Game Live Host View** (`/trainer/games`) | Real-time WebSocket pub/sub room for live classroom leaderboard updates during in-class game sessions. | Add a WebSocket endpoint `WS /api/v1/gamification/room/{room_id}` backed by Redis PubSub to broadcast live scores to trainer dashboard. | Frontend polls `GET /trainer/games/analytics` with a 5-second interval while the game session is active. |

---

## 2. Review Recommendations

- No backend changes were made by the frontend agent during this sync (per Hard Rule 3).
- The frontend workarounds are fully functional, resilient against network failures, and gracefully handle empty or offline backend states.
