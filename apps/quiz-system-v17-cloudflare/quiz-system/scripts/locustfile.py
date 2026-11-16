"""
Load test for the quiz-taking flow: join -> fetch questions one at a time ->
save each answer -> submit. This is deliberately NOT run by Claude/this
build environment -- it needs a real deployed instance and real concurrency,
neither of which a sandboxed dev environment can honestly simulate. Run it
yourself against a staging deployment before trusting any concurrency number.

Setup
-----
1. pip install locust
2. Start the backend + frontend normally (or point at a staging deployment).
3. As admin: create a quiz, upload a question bank (the bigger the more
   realistic -- try scripts/sample_quiz.csv for a quick smoke test, and a
   50-100 question CSV for a more realistic "exam" load), Schedule, then
   Start it so it's live. Copy its quiz code.
4. Run:
     QUIZ_CODE=ABC123 locust -f scripts/locustfile.py --host http://localhost:8000
   Then open http://localhost:8089, set:
     - Number of users: 50 / 250 / 500 / 1000 (test each separately, not
       all in one run -- you want a clean before/after per tier)
     - Spawn rate: ~10-20/s so students trickle in like a real class
       logging in, not all 1000 hitting /join in the same instant
   and click Start.

What to actually watch (Locust's UI gives you most of this directly)
----------------------------------------------------------------------
  - Requests/s and response time percentiles (p50/p95/p99) per endpoint --
    /student/question/{id} and /student/answer are the hottest paths.
  - Failure rate -- should be ~0%. Any 401s mid-run likely mean JWT expiry
    (STUDENT_TOKEN_EXPIRE_MINUTES) firing during a long test; any 429s mean
    you're hitting the rate limiter (middleware/rate_limit_middleware.py) --
    expected only if you spawn faster than real students would join.
  - Server-side: watch CPU/RAM with `htop` (or the deployment platform's
    metrics) and hit GET /api/admin/system/memory-stats before and after --
    session count should return to whatever "currently live" actually is
    once students finish submitting, not keep climbing.
  - Socket.IO isn't exercised by this script (Locust's plain HttpUser
    doesn't speak Engine.IO) -- REST is the heavier, more realistic load
    surface (every answer autosave is a REST call), but if you want to also
    load-test live monitoring, open a handful of real admin browser tabs on
    /admin/quiz/<id>/monitor during the run and watch for lag in the camera
    grid / live event feed.

A rough one-machine expectation (from the architecture notes in README.md,
NOT a promise -- your hardware/network will differ): a modest VPS should
comfortably handle 500 concurrent students; beyond that, the documented
scale-out path is Redis + multiple app workers behind a load balancer rather
than pushing one process harder.
"""
import os
import random
import string
import uuid

from locust import HttpUser, task, between, events

QUIZ_CODE = os.environ.get("QUIZ_CODE", "")


@events.init_command_line_parser.add_listener
def _(parser):
    parser.add_argument("--quiz-code", type=str, env_var="QUIZ_CODE", default="",
                         help="Code of the LIVE quiz to load-test against (required)")


def _random_roll_number() -> str:
    # Unique per simulated student so /student/join doesn't collide with
    # another simulated student and trip the one-device-per-roll-number
    # check (see quiz_service.start_session_for_student).
    return "LT" + "".join(random.choices(string.digits, k=8))


class StudentUser(HttpUser):
    """Simulates one student: join, answer every question at a human-ish
    pace, submit. Weight this class heavily -- it's the traffic pattern
    that matters most (hundreds of these running concurrently)."""

    wait_time = between(1, 3)  # pacing between actions, like a real person reading a question

    def on_start(self):
        self.quiz_code = self.environment.parsed_options.quiz_code or QUIZ_CODE
        if not self.quiz_code:
            raise RuntimeError("Set QUIZ_CODE env var or pass --quiz-code (the quiz must already be live)")

        self.roll_number = _random_roll_number()
        self.device_id = str(uuid.uuid4())
        self.token = None
        self.question_ids = []

        with self.client.post(
            "/api/student/join",
            json={
                "quiz_code": self.quiz_code,
                "name": f"Load Test {self.roll_number}",
                "roll_number": self.roll_number,
                "device_id": self.device_id,
            },
            catch_response=True,
            name="/student/join",
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"join failed: {resp.status_code} {resp.text}")
                return
            data = resp.json()
            self.token = data["access_token"]
            self.total_questions = data["total_questions"]

    def _auth_headers(self):
        return {"Authorization": f"Bearer {self.token}"}

    @task
    def take_quiz(self):
        if not self.token:
            return  # join failed in on_start -- nothing to do

        # 1. Palette -> ordered list of this student's (shuffled) question ids
        resp = self.client.get("/api/student/palette", headers=self._auth_headers(), name="/student/palette")
        if resp.status_code != 200:
            return
        self.question_ids = [p["question_id"] for p in resp.json()["palette"]]

        # 2. Fetch + answer every question, one at a time -- this mirrors the
        # real client, which never receives the whole bank up front.
        for qid in self.question_ids:
            q_resp = self.client.get(
                f"/api/student/question/{qid}", headers=self._auth_headers(), name="/student/question/[id]"
            )
            if q_resp.status_code != 200:
                continue
            question = q_resp.json()

            if question.get("question_type") == "numerical":
                answer_body = {"question_id": qid, "selected_options": [], "numerical_answer": "42",
                                "marked_for_review": False, "time_spent_seconds": random.uniform(5, 20)}
            else:
                options = question.get("options", [])
                pick = random.choice(options)["key"] if options else None
                answer_body = {"question_id": qid, "selected_options": [pick] if pick else [],
                                "numerical_answer": None, "marked_for_review": False,
                                "time_spent_seconds": random.uniform(5, 20)}

            self.client.post("/api/student/answer", json=answer_body, headers=self._auth_headers(),
                              name="/student/answer")

        # 3. Submit
        self.client.post("/api/student/submit", json={"reason": "manual"}, headers=self._auth_headers(),
                          name="/student/submit")

        # Stop this simulated user after one full attempt -- one student
        # only takes a quiz once. Locust will just leave it idle; that's
        # fine for a fixed-duration run.
        self.token = None


class AdminMonitorUser(HttpUser):
    """Optional: a couple of these simulate admins watching the live
    Monitor screen while the load test runs, to catch monitoring-path
    slowdowns under concurrent student traffic. Give this class a low
    --weight relative to StudentUser (e.g. spawn 2-3 total, not hundreds)."""

    wait_time = between(4, 6)
    weight = 1

    def on_start(self):
        self.admin_token = None
        self.quiz_id = None
        # Fill these in for your environment before running with admins enabled.
        username = os.environ.get("LOAD_TEST_ADMIN_USERNAME", "")
        password = os.environ.get("LOAD_TEST_ADMIN_PASSWORD", "")
        if not username:
            return
        resp = self.client.post("/api/auth/admin/login", json={"username": username, "password": password},
                                 name="/auth/admin/login")
        if resp.status_code == 200:
            self.admin_token = resp.json()["access_token"]

    @task
    def poll_monitor(self):
        if not self.admin_token or not self.quiz_id:
            return
        self.client.get(f"/api/admin/quizzes/{self.quiz_id}/monitor",
                         headers={"Authorization": f"Bearer {self.admin_token}"}, name="/admin/monitor")
