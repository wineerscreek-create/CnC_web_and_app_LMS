"""WebSocket Hub for Real-Time Institute Messaging.

Manages authenticated WebSocket connections, group rooms, personal conversation rooms,
and real-time event broadcasting (new messages, read receipts, message moderation, and access revocations).
"""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from typing import Any
import jwt
from fastapi import WebSocket
from starlette.websockets import WebSocketState

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger("app.websocket.messaging_ws")


class MessagingHub:
    def __init__(self):
        # Map user_id -> set of active WebSockets
        self.user_connections: dict[str, set[WebSocket]] = defaultdict(set)
        # Map room_name -> set of user_ids subscribed
        self.room_subscribers: dict[str, set[str]] = defaultdict(set)
        # Map websocket -> set of subscribed rooms
        self.socket_rooms: dict[WebSocket, set[str]] = defaultdict(set)
        # Map websocket -> user_id
        self.socket_user: dict[WebSocket, str] = {}
        self._lock = asyncio.Lock()

    async def connect_user(self, user_id: str, ws: WebSocket) -> None:
        async with self._lock:
            self.user_connections[user_id].add(ws)
            self.socket_user[ws] = user_id
        log.info("User connected to messaging hub", extra={"user_id": user_id})

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            user_id = self.socket_user.pop(ws, None)
            if user_id and user_id in self.user_connections:
                self.user_connections[user_id].discard(ws)
                if not self.user_connections[user_id]:
                    del self.user_connections[user_id]

            rooms = self.socket_rooms.pop(ws, set())
            for room in rooms:
                if user_id:
                    self.room_subscribers[room].discard(user_id)
                    if not self.room_subscribers[room]:
                        del self.room_subscribers[room]

    async def subscribe(self, user_id: str, ws: WebSocket, room_name: str) -> None:
        async with self._lock:
            self.room_subscribers[room_name].add(user_id)
            self.socket_rooms[ws].add(room_name)
        log.debug("User subscribed to room", extra={"user_id": user_id, "room": room_name})

    async def unsubscribe(self, user_id: str, ws: WebSocket, room_name: str) -> None:
        async with self._lock:
            self.socket_rooms[ws].discard(room_name)
            self.room_subscribers[room_name].discard(user_id)

    async def revoke_user_from_room(self, user_id: str, room_name: str) -> None:
        """Immediately kicks user from a room and notifies their client."""
        async with self._lock:
            self.room_subscribers[room_name].discard(user_id)
            for ws in list(self.user_connections.get(user_id, set())):
                self.socket_rooms[ws].discard(room_name)
                try:
                    if ws.client_state == WebSocketState.CONNECTED:
                        await ws.send_text(
                            json.dumps({"event": "room_revoked", "room": room_name, "reason": "access_revoked"})
                        )
                except Exception:
                    pass

    async def broadcast_to_room(
        self,
        room_name: str,
        event: str,
        data: Any,
        exclude_user_id: str | None = None,
    ) -> None:
        """Broadcasts payload to all active sockets of users subscribed to room_name."""
        target_users = set()
        async with self._lock:
            target_users = set(self.room_subscribers.get(room_name, set()))

        if exclude_user_id:
            target_users.discard(exclude_user_id)

        payload = json.dumps({"event": event, "room": room_name, "data": data})
        coros = []
        for uid in target_users:
            for ws in list(self.user_connections.get(uid, set())):
                if ws.client_state == WebSocketState.CONNECTED:
                    coros.append(ws.send_text(payload))

        if coros:
            await asyncio.gather(*coros, return_exceptions=True)

    async def send_to_user(self, user_id: str, event: str, data: Any) -> None:
        """Sends payload directly to all sockets connected for user_id."""
        payload = json.dumps({"event": event, "data": data})
        coros = []
        for ws in list(self.user_connections.get(user_id, set())):
            if ws.client_state == WebSocketState.CONNECTED:
                coros.append(ws.send_text(payload))

        if coros:
            await asyncio.gather(*coros, return_exceptions=True)


messaging_hub = MessagingHub()
