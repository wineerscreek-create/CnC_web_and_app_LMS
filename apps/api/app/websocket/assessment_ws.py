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
        # quiz_id -> user_id -> last_persisted_time
        self.last_persisted_time: dict[str, dict[str, float]] = {}

    async def register_student(
        self,
        quiz_id: str,
        user_id: str,
        ws: WebSocket,
        name: str,
        roll_number: str,
        total_questions: int = 0,
        duration_minutes: int = 30,
        remaining_seconds: int | None = None,
        deadline: float | None = None,
    ) -> None:
        async with self._lock:
            if quiz_id not in self.student_sockets:
                self.student_sockets[quiz_id] = {}
                self.trainer_sockets[quiz_id] = set()
                self.latest_snapshots[quiz_id] = {}
                self.student_states[quiz_id] = {}
                self.last_snapshot_time[quiz_id] = {}
                self.last_persisted_time[quiz_id] = {}

            self.student_sockets[quiz_id][user_id] = ws

            now = time.time()
            eff_deadline = deadline if deadline is not None else (now + (duration_minutes * 60))
            eff_remaining = remaining_seconds if remaining_seconds is not None else max(0, int(eff_deadline - now))

            if user_id not in self.student_states[quiz_id]:
                self.student_states[quiz_id][user_id] = {
                    "session_id": user_id,
                    "name": name,
                    "roll_number": roll_number,
                    "current_question": 0,
                    "total_questions": total_questions,
                    "remaining_seconds": eff_remaining,
                    "deadline": eff_deadline,
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
                if remaining_seconds is not None:
                    self.student_states[quiz_id][user_id]["remaining_seconds"] = eff_remaining
                    self.student_states[quiz_id][user_id]["deadline"] = eff_deadline

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
                self.last_persisted_time[quiz_id] = {}
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

    async def handle_snapshot(self, quiz_id: str, user_id: str, frame: str, event_type: str = "PERIODIC") -> bool:
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
            "event_type": event_type,
        }
        self.latest_snapshots[quiz_id][user_id] = snapshot_event

        # Persist representative snapshot to database
        last_persisted = self.last_persisted_time.get(quiz_id, {}).get(user_id, 0.0)
        should_persist = (
            (event_type != "PERIODIC") or
            (last_persisted == 0.0) or
            (now - last_persisted >= 20.0)
        )
        if should_persist:
            try:
                from app.db.postgres import get_pg_connection
                from app.repositories.assignment_quiz_repo import _safe_uuid
                q_uuid = _safe_uuid(quiz_id)
                u_uuid = _safe_uuid(user_id)
                if q_uuid and u_uuid:
                    async with get_pg_connection() as conn:
                        att_row = await conn.fetchrow(
                            """
                            SELECT id FROM quiz_attempts
                            WHERE quiz_id = $1 AND student_user_id = $2
                            ORDER BY created_at DESC LIMIT 1
                            """,
                            q_uuid, u_uuid
                        )
                        att_id = att_row["id"] if att_row else None
                        cnt = await conn.fetchval(
                            """
                            SELECT COUNT(*) FROM quiz_camera_snapshots
                            WHERE quiz_id = $1 AND student_user_id = $2
                            """,
                            q_uuid, u_uuid
                        )
                        if cnt is None or cnt < 15:
                            await conn.execute(
                                """
                                INSERT INTO quiz_camera_snapshots (
                                    id, quiz_id, student_user_id, attempt_id, snapshot_timestamp, event_type, image_data, created_at
                                ) VALUES (
                                    gen_random_uuid(), $1, $2, $3, NOW(), $4, $5, NOW()
                                )
                                """,
                                q_uuid, u_uuid, att_id, str(event_type)[:64], frame
                            )
                            if att_id:
                                await conn.execute(
                                    "UPDATE quiz_attempts SET last_camera_frame_at = NOW(), camera_status = 'active' WHERE id = $1",
                                    att_id
                                )
                            if quiz_id not in self.last_persisted_time:
                                self.last_persisted_time[quiz_id] = {}
                            self.last_persisted_time[quiz_id][user_id] = now
            except Exception:
                pass

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
            state["status"] = result.get("candidate_status") or "submitted"
            state["online"] = False
            state["last_seen"] = time.time()
            # Immediately release camera snapshot resources upon submission
            if quiz_id in self.latest_snapshots and user_id in self.latest_snapshots[quiz_id]:
                del self.latest_snapshots[quiz_id][user_id]
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

    async def handle_abandonment_warning(self, quiz_id: str, user_id: str, grace_seconds: int = 20) -> None:
        state = self.student_states.get(quiz_id, {}).get(user_id)
        if state:
            state["status"] = "abandonment_warning"
            state["abandonment_warning"] = True
            state["last_seen"] = time.time()
            await self.broadcast_to_trainers(
                quiz_id,
                "abandonment_warning",
                {
                    "session_id": user_id,
                    "roll_number": state["roll_number"],
                    "name": state["name"],
                    "grace_seconds": grace_seconds,
                    "timestamp": int(time.time() * 1000),
                },
            )

    async def handle_abandonment_cancel(self, quiz_id: str, user_id: str) -> None:
        state = self.student_states.get(quiz_id, {}).get(user_id)
        if state:
            state["status"] = "in_progress"
            state["abandonment_warning"] = False
            state["last_seen"] = time.time()
            await self.broadcast_to_trainers(
                quiz_id,
                "abandonment_cancel",
                {
                    "session_id": user_id,
                    "roll_number": state["roll_number"],
                    "name": state["name"],
                    "timestamp": int(time.time() * 1000),
                },
            )

    async def handle_attempt_recovered(
        self,
        quiz_id: str,
        user_id: str,
        action: str,
        remaining_seconds: int,
        current_question_index: int = 0,
    ) -> None:
        async with self._lock:
            state = self.student_states.get(quiz_id, {}).get(user_id)
            if state:
                state["status"] = "in_progress"
                state["online"] = True
                state["remaining_seconds"] = remaining_seconds
                state["deadline"] = time.time() + remaining_seconds
                state["current_question"] = current_question_index
                state["last_seen"] = time.time()

        payload = {
            "session_id": user_id,
            "action": action,
            "remaining_seconds": remaining_seconds,
            "current_question_index": current_question_index,
            "timestamp": int(time.time() * 1000),
        }
        await self.broadcast_to_students(quiz_id, "attempt_recovered", payload)
        await self.broadcast_to_trainers(quiz_id, "attempt_recovered", payload)

    def get_monitor_data(self, quiz_id: str) -> list[dict[str, Any]]:
        now = time.time()
        students = []
        for uid, s in self.student_states.get(quiz_id, {}).items():
            last_seen_sec = round(now - s.get("last_seen", now))
            is_online = s.get("online", False) and last_seen_sec < 45
            is_stale = is_online and last_seen_sec >= 30

            # Authoritative candidate status calculation
            raw_status = s.get("status", "in_progress")
            if raw_status in ("submitted", "completed", "auto_submitted", "abandoned"):
                cand_status = raw_status.upper()
            elif s.get("abandonment_warning"):
                cand_status = "ABANDONMENT_WARNING"
            elif not is_online:
                cand_status = "TEMPORARILY_DISCONNECTED"
            else:
                cand_status = raw_status.upper()

            # Determine camera status
            last_snap_t = self.last_snapshot_time.get(quiz_id, {}).get(uid, 0.0)
            snap_age = round(now - last_snap_t) if last_snap_t > 0 else 9999
            if not s.get("camera_on"):
                cam_status = "OFF"
            elif snap_age > 30:
                cam_status = "STREAM_DISCONNECTED"
            elif last_snap_t > 0:
                cam_status = "LIVE"
            else:
                cam_status = "WAITING_FIRST_FRAME"

            students.append({
                "session_id": uid,
                "name": s["name"],
                "roll_number": s["roll_number"],
                "current_question": s.get("current_question", 0),
                "total_questions": s.get("total_questions", 0),
                "remaining_seconds": max(0, int(s.get("deadline", now) - now)),
                "warnings": s.get("warnings", 0),
                "camera_on": s.get("camera_on", False),
                "camera_status": cam_status,
                "fullscreen": s.get("fullscreen", False),
                "online": is_online,
                "status": cand_status.lower(),
                "candidate_status": cand_status,
                "last_seen_seconds_ago": last_seen_sec,
                "last_snapshot_seconds_ago": snap_age,
                "stale": is_stale,
            })
        return sorted(students, key=lambda x: x["roll_number"])

    def get_latest_snapshots(self, quiz_id: str) -> dict[str, dict[str, Any]]:
        active = {}
        for uid, snap in self.latest_snapshots.get(quiz_id, {}).items():
            state = self.student_states.get(quiz_id, {}).get(uid, {})
            # Exclude students who are submitted or abandoned
            if state.get("status") in ("submitted", "completed", "auto_submitted", "abandoned"):
                continue
            active[uid] = snap
        return active


assessment_hub = AssessmentHub()
