"""Assessment Real-Time WebSocket Hub and In-Memory Session Manager.

Provides low-latency, low-bandwidth camera snapshot relays, supervisor monitoring,
student heartbeats, and proctoring violation broadcasts.
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any
from fastapi import WebSocket

from app.core.logging import get_logger

log = get_logger("app.assessment_ws")


class AssessmentHub:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        # quiz_id -> { user_id: WebSocket }
        self.student_sockets: dict[str, dict[str, WebSocket]] = {}
        # quiz_id -> set[WebSocket]
        self.trainer_sockets: dict[str, set[WebSocket]] = {}
        # quiz_id -> user_id -> snapshot dict
        self.latest_snapshots: dict[str, dict[str, dict[str, Any]]] = {}
        # quiz_id -> user_id -> metadata
        self.student_states: dict[str, dict[str, dict[str, Any]]] = {}
        # quiz_id -> user_id -> last_snapshot_time (rate limiting)
        self.last_snapshot_time: dict[str, dict[str, float]] = {}

    async def register_student(
        self,
        quiz_id: str,
        user_id: str,
        ws: WebSocket,
        name: str,
        roll_number: str,
        total_questions: int = 0,
        duration_minutes: int = 60,
    ) -> None:
        async with self._lock:
            if quiz_id not in self.student_sockets:
                self.student_sockets[quiz_id] = {}
                self.trainer_sockets[quiz_id] = set()
                self.latest_snapshots[quiz_id] = {}
                self.student_states[quiz_id] = {}
                self.last_snapshot_time[quiz_id] = {}

            self.student_sockets[quiz_id][user_id] = ws

            now = time.time()
            deadline = now + (duration_minutes * 60)
            if user_id not in self.student_states[quiz_id]:
                self.student_states[quiz_id][user_id] = {
                    "session_id": user_id,
                    "name": name,
                    "roll_number": roll_number,
                    "current_question": 0,
                    "total_questions": total_questions,
                    "remaining_seconds": duration_minutes * 60,
                    "deadline": deadline,
                    "warnings": 0,
                    "camera_on": False,
                    "fullscreen": False,
                    "online": True,
                    "last_seen": now,
                    "status": "in_progress",
                }
            else:
                self.student_states[quiz_id][user_id]["online"] = True
                self.student_states[quiz_id][user_id]["last_seen"] = now

        log.info("student_ws_registered", extra={"quiz_id": quiz_id, "user_id": user_id, "student_name": name})
        await self.broadcast_to_trainers(
            quiz_id,
            "student_joined",
            {
                "session_id": user_id,
                "name": name,
                "roll_number": roll_number,
            },
        )

    async def unregister_student(self, quiz_id: str, user_id: str, ws: WebSocket) -> None:
        async with self._lock:
            if quiz_id in self.student_sockets and self.student_sockets[quiz_id].get(user_id) == ws:
                del self.student_sockets[quiz_id][user_id]
            if quiz_id in self.student_states and user_id in self.student_states[quiz_id]:
                self.student_states[quiz_id][user_id]["online"] = False
                self.student_states[quiz_id][user_id]["last_seen"] = time.time()

        log.info("student_ws_unregistered", extra={"quiz_id": quiz_id, "user_id": user_id})
        await self.broadcast_to_trainers(
            quiz_id,
            "student_status",
            {"session_id": user_id, "online": False},
        )

    async def register_trainer(self, quiz_id: str, ws: WebSocket, user_id: str) -> None:
        async with self._lock:
            if quiz_id not in self.trainer_sockets:
                self.student_sockets[quiz_id] = {}
                self.trainer_sockets[quiz_id] = set()
                self.latest_snapshots[quiz_id] = {}
                self.student_states[quiz_id] = {}
                self.last_snapshot_time[quiz_id] = {}
            self.trainer_sockets[quiz_id].add(ws)

        log.info("trainer_ws_registered", extra={"quiz_id": quiz_id, "user_id": user_id})

    async def unregister_trainer(self, quiz_id: str, ws: WebSocket) -> None:
        async with self._lock:
            if quiz_id in self.trainer_sockets:
                self.trainer_sockets[quiz_id].discard(ws)

    async def broadcast_to_trainers(self, quiz_id: str, event: str, data: Any) -> None:
        payload = json.dumps({"event": event, "data": data})
        to_remove = set()
        trainers = self.trainer_sockets.get(quiz_id, set()).copy()
        for ws in trainers:
            try:
                await ws.send_text(payload)
            except Exception:
                to_remove.add(ws)

        if to_remove:
            async with self._lock:
                if quiz_id in self.trainer_sockets:
                    self.trainer_sockets[quiz_id].difference_update(to_remove)

    async def broadcast_to_students(self, quiz_id: str, event: str, data: Any) -> None:
        payload = json.dumps({"event": event, "data": data})
        to_remove = []
        students = self.student_sockets.get(quiz_id, {}).copy()
        for uid, ws in students.items():
            try:
                await ws.send_text(payload)
            except Exception:
                to_remove.append(uid)

        if to_remove:
            async with self._lock:
                for uid in to_remove:
                    self.student_sockets.get(quiz_id, {}).pop(uid, None)

    async def handle_snapshot(self, quiz_id: str, user_id: str, frame: str) -> bool:
        # Rate limiting: max 1 frame per 4 seconds
        now = time.time()
        last_t = self.last_snapshot_time.get(quiz_id, {}).get(user_id, 0.0)
        if now - last_t < 3.8:
            return False

        # Validate snapshot format and payload size
        if not isinstance(frame, str) or not frame.startswith("data:image/jpeg;base64,"):
            return False
        if len(frame) > 260000:  # ~200KB limit
            return False

        state = self.student_states.get(quiz_id, {}).get(user_id)
        if not state:
            return False

        self.last_snapshot_time[quiz_id][user_id] = now
        state["camera_on"] = True
        state["last_seen"] = now

        snapshot_event = {
            "session_id": user_id,
            "name": state["name"],
            "roll_number": state["roll_number"],
            "frame": frame,
            "timestamp": int(now * 1000),
        }
        self.latest_snapshots[quiz_id][user_id] = snapshot_event

        await self.broadcast_to_trainers(quiz_id, "camera_snapshot", snapshot_event)
        return True

    async def handle_heartbeat(self, quiz_id: str, user_id: str) -> int:
        now = time.time()
        state = self.student_states.get(quiz_id, {}).get(user_id)
        if not state:
            return 0

        state["last_seen"] = now
        state["online"] = True
        remaining = max(0, int(state.get("deadline", now) - now))
        state["remaining_seconds"] = remaining
        return remaining

    async def handle_status_change(self, quiz_id: str, user_id: str, camera_on: bool | None, fullscreen: bool | None) -> None:
        state = self.student_states.get(quiz_id, {}).get(user_id)
        if not state:
            return
        if camera_on is not None:
            state["camera_on"] = camera_on
        if fullscreen is not None:
            state["fullscreen"] = fullscreen
        state["last_seen"] = time.time()
        await self.broadcast_to_trainers(
            quiz_id,
            "student_status",
            {
                "session_id": user_id,
                "camera_on": state["camera_on"],
                "fullscreen": state["fullscreen"],
                "online": True,
            },
        )

    async def handle_warning(self, quiz_id: str, user_id: str, warning_type: str, count: int) -> None:
        state = self.student_states.get(quiz_id, {}).get(user_id)
        if state:
            state["warnings"] = count
            state["last_seen"] = time.time()
            await self.broadcast_to_trainers(
                quiz_id,
                "warning",
                {
                    "session_id": user_id,
                    "roll_number": state["roll_number"],
                    "name": state["name"],
                    "warning_type": warning_type,
                    "count": count,
                },
            )

    async def handle_answer_saved(self, quiz_id: str, user_id: str, question_id: str, current_index: int) -> None:
        state = self.student_states.get(quiz_id, {}).get(user_id)
        if state:
            state["current_question"] = current_index
            state["last_seen"] = time.time()
            await self.broadcast_to_trainers(
                quiz_id,
                "answer_saved",
                {
                    "session_id": user_id,
                    "roll_number": state["roll_number"],
                    "question_id": question_id,
                    "current_question": current_index,
                },
            )

    async def handle_submit(self, quiz_id: str, user_id: str, result: dict[str, Any]) -> None:
        state = self.student_states.get(quiz_id, {}).get(user_id)
        if state:
            state["status"] = "submitted"
            state["online"] = False
            state["last_seen"] = time.time()
            await self.broadcast_to_trainers(
                quiz_id,
                "submit",
                {
                    "session_id": user_id,
                    "roll_number": state["roll_number"],
                    "name": state["name"],
                    "result": result,
                },
            )

    def get_monitor_data(self, quiz_id: str) -> list[dict[str, Any]]:
        now = time.time()
        students = []
        for uid, s in self.student_states.get(quiz_id, {}).items():
            last_seen_sec = round(now - s.get("last_seen", now))
            is_stale = s.get("status") == "in_progress" and last_seen_sec >= 45
            is_online = s.get("online", False) and last_seen_sec < 45
            students.append({
                "session_id": uid,
                "name": s["name"],
                "roll_number": s["roll_number"],
                "current_question": s.get("current_question", 0),
                "total_questions": s.get("total_questions", 0),
                "remaining_seconds": max(0, int(s.get("deadline", now) - now)),
                "warnings": s.get("warnings", 0),
                "camera_on": s.get("camera_on", False),
                "fullscreen": s.get("fullscreen", False),
                "online": is_online,
                "status": s.get("status", "in_progress"),
                "last_seen_seconds_ago": last_seen_sec,
                "stale": is_stale,
            })
        return sorted(students, key=lambda x: x["roll_number"])

    def get_latest_snapshots(self, quiz_id: str) -> dict[str, dict[str, Any]]:
        return self.latest_snapshots.get(quiz_id, {}).copy()


assessment_hub = AssessmentHub()
