"""Institute Messaging API Router & WebSocket Endpoint.

Provides REST and WebSocket capabilities for batch groups, direct messaging,
user blocking, search, attachments, and real-time event distribution.
"""
from __future__ import annotations

import json
from typing import Any
import jwt
from fastapi import APIRouter, Depends, Query, UploadFile, File, WebSocket, WebSocketDisconnect, status
from starlette.websockets import WebSocketState

from app.authz.context import ScopeContext
from app.authz.guards import get_scope_context, require_role
from app.authz.roles import Role
from app.core.config import settings
from app.core.errors import NotFound, ScopeForbidden, ValidationError
from app.core.logging import get_logger
from app.services.messaging_service import MessagingService
from app.services.storage import get_storage
from app.websocket.messaging_ws import messaging_hub

log = get_logger("app.routers.messaging")

router = APIRouter(prefix="/messaging", tags=["messaging"])
AuthCtx = Depends(get_scope_context)
AdminCtx = Depends(require_role(Role.ADMIN, Role.SUPER_ADMIN))


# ------------------------------------------------------------------------------
# GROUP ENDPOINTS
# ------------------------------------------------------------------------------

@router.get("/groups")
async def list_groups(ctx: ScopeContext = AuthCtx) -> dict[str, Any]:
    """Lists all batch groups accessible to the authenticated user."""
    groups = await MessagingService.get_user_accessible_groups(
        user_id=ctx.user_id,
        role=ctx.role.value,
        institution_id=ctx.college_id,
    )
    return {"groups": groups}


@router.get("/groups/{group_id}")
async def get_group_details(group_id: str, ctx: ScopeContext = AuthCtx) -> dict[str, Any]:
    """Returns group metadata and active members."""
    details = await MessagingService.get_group_details(
        group_id=group_id,
        user_id=ctx.user_id,
        role=ctx.role.value,
    )
    return {"group": details}


@router.get("/groups/{group_id}/messages")
async def get_group_messages(
    group_id: str,
    limit: int = Query(50, ge=1, le=100),
    before: str | None = Query(None),
    ctx: ScopeContext = AuthCtx,
) -> dict[str, Any]:
    """Returns paginated message history for a group."""
    messages = await MessagingService.get_group_messages(
        group_id=group_id,
        user_id=ctx.user_id,
        role=ctx.role.value,
        limit=limit,
        before=before,
    )
    return {"messages": messages}


@router.post("/groups/{group_id}/messages")
async def post_group_message(
    group_id: str,
    payload: dict[str, Any],
    ctx: ScopeContext = AuthCtx,
) -> dict[str, Any]:
    """Posts a message to a group and broadcasts to all connected group members."""
    content = payload.get("content", "")
    message_type = payload.get("messageType", "text")
    reply_to_id = payload.get("replyToId")
    attachments = payload.get("attachments")
    is_pinned = bool(payload.get("isPinned", False))

    msg = await MessagingService.post_group_message(
        group_id=group_id,
        sender_id=ctx.user_id,
        sender_role=ctx.role.value,
        content=content,
        message_type=message_type,
        reply_to_id=reply_to_id,
        attachments=attachments,
        is_pinned=is_pinned,
    )

    # Real-time WebSocket broadcast to group room
    await messaging_hub.broadcast_to_room(
        room_name=f"group:{group_id}",
        event="new_message",
        data=msg,
        exclude_user_id=str(ctx.user_id),
    )

    return {"message": msg}


@router.post("/groups/{group_id}/read")
async def mark_group_read(group_id: str, ctx: ScopeContext = AuthCtx) -> dict[str, Any]:
    """Marks group messages as read and resets unread count for user."""
    await MessagingService.mark_group_messages_read(group_id, ctx.user_id)
    await messaging_hub.broadcast_to_room(
        room_name=f"group:{group_id}",
        event="messages_read",
        data={"userId": str(ctx.user_id), "groupId": group_id},
        exclude_user_id=str(ctx.user_id),
    )
    return {"ok": True}


@router.post("/groups/{group_id}/pin/{message_id}")
async def pin_group_message(
    group_id: str,
    message_id: str,
    payload: dict[str, Any] | None = None,
    ctx: ScopeContext = AuthCtx,
) -> dict[str, Any]:
    """Pins or unpins a message in a group (Trainer/Admin only)."""
    is_pinned = bool(payload.get("isPinned", True)) if payload else True
    res = await MessagingService.pin_group_message(
        group_id=group_id,
        message_id=message_id,
        user_id=ctx.user_id,
        role=ctx.role.value,
        is_pinned=is_pinned,
    )

    await messaging_hub.broadcast_to_room(
        room_name=f"group:{group_id}",
        event="message_pinned",
        data={"messageId": message_id, "isPinned": is_pinned},
    )
    return res


# ------------------------------------------------------------------------------
# DIRECT CONVERSATIONS (1-ON-1)
# ------------------------------------------------------------------------------

@router.get("/conversations")
async def list_direct_conversations(ctx: ScopeContext = AuthCtx) -> dict[str, Any]:
    """Lists all direct 1-on-1 conversations for the current user."""
    conversations = await MessagingService.get_user_direct_conversations(ctx.user_id)
    return {"conversations": conversations}


@router.post("/conversations/start")
async def start_direct_conversation(
    payload: dict[str, Any],
    ctx: ScopeContext = AuthCtx,
) -> dict[str, Any]:
    """Initiates or fetches a direct conversation with a target user."""
    target_user_id = payload.get("targetUserId")
    if not target_user_id:
        raise ValidationError("targetUserId is required.")

    conv = await MessagingService.get_or_create_direct_conversation(
        user1_id=ctx.user_id,
        user2_id=target_user_id,
        institution_id=ctx.college_id,
    )
    return {"conversation": conv}


@router.get("/conversations/{conversation_id}/messages")
async def get_direct_messages(
    conversation_id: str,
    limit: int = Query(50, ge=1, le=100),
    before: str | None = Query(None),
    ctx: ScopeContext = AuthCtx,
) -> dict[str, Any]:
    """Returns paginated message history for a direct conversation."""
    messages = await MessagingService.get_direct_messages(
        conversation_id=conversation_id,
        user_id=ctx.user_id,
        limit=limit,
        before=before,
    )
    return {"messages": messages}


@router.post("/conversations/{conversation_id}/messages")
async def send_direct_message(
    conversation_id: str,
    payload: dict[str, Any],
    ctx: ScopeContext = AuthCtx,
) -> dict[str, Any]:
    """Sends a direct message and delivers to recipient in real-time."""
    content = payload.get("content", "")
    reply_to_id = payload.get("replyToId")
    attachments = payload.get("attachments")

    msg = await MessagingService.send_direct_message(
        conversation_id=conversation_id,
        sender_id=ctx.user_id,
        sender_role=ctx.role.value,
        content=content,
        reply_to_id=reply_to_id,
        attachments=attachments,
    )

    recipient_id = msg.get("recipientId")
    if recipient_id:
        # Broadcast to conversation room and direct push to recipient
        await messaging_hub.broadcast_to_room(
            room_name=f"conv:{conversation_id}",
            event="new_direct_message",
            data=msg,
            exclude_user_id=str(ctx.user_id),
        )
        await messaging_hub.send_to_user(
            user_id=recipient_id,
            event="conversation_updated",
            data=msg,
        )

    return {"message": msg}


@router.post("/conversations/{conversation_id}/read")
async def mark_conversation_read(conversation_id: str, ctx: ScopeContext = AuthCtx) -> dict[str, Any]:
    """Marks direct conversation as read and resets unread count for user."""
    await MessagingService.mark_conversation_read(conversation_id, ctx.user_id)
    await messaging_hub.broadcast_to_room(
        room_name=f"conv:{conversation_id}",
        event="direct_messages_read",
        data={"userId": str(ctx.user_id), "conversationId": conversation_id},
        exclude_user_id=str(ctx.user_id),
    )
    return {"ok": True}


# ------------------------------------------------------------------------------
# USER SEARCH AND BLOCKING
# ------------------------------------------------------------------------------

@router.get("/users/search")
async def search_users(
    q: str = Query(..., min_length=1),
    ctx: ScopeContext = AuthCtx,
) -> dict[str, Any]:
    """Searches for users by email or LMS user ID for direct messaging."""
    users = await MessagingService.search_direct_message_users(
        query=q,
        current_user_id=ctx.user_id,
        current_role=ctx.role.value,
        institution_id=ctx.college_id,
    )
    return {"users": users}


@router.post("/users/block")
async def block_user(payload: dict[str, Any], ctx: ScopeContext = AuthCtx) -> dict[str, Any]:
    """Blocks a user from direct messaging interactions."""
    target_user_id = payload.get("targetUserId")
    reason = payload.get("reason")
    if not target_user_id:
        raise ValidationError("targetUserId is required.")

    res = await MessagingService.block_user(
        blocker_id=ctx.user_id,
        blocked_id=target_user_id,
        reason=reason,
    )
    # Notify target user socket
    await messaging_hub.send_to_user(
        user_id=str(target_user_id),
        event="user_blocked_notice",
        data={"blockerId": str(ctx.user_id)},
    )
    return res


@router.post("/users/unblock")
async def unblock_user(payload: dict[str, Any], ctx: ScopeContext = AuthCtx) -> dict[str, Any]:
    """Unblocks a user from direct messaging interactions."""
    target_user_id = payload.get("targetUserId")
    if not target_user_id:
        raise ValidationError("targetUserId is required.")

    res = await MessagingService.unblock_user(
        blocker_id=ctx.user_id,
        blocked_id=target_user_id,
    )
    await messaging_hub.send_to_user(
        user_id=str(target_user_id),
        event="user_unblocked_notice",
        data={"unblockerId": str(ctx.user_id)},
    )
    return res


@router.get("/users/blocked")
async def list_blocked_users(ctx: ScopeContext = AuthCtx) -> dict[str, Any]:
    """Returns all users blocked by the current user."""
    blocked = await MessagingService.get_blocked_users(ctx.user_id)
    return {"blockedUsers": blocked}


# ------------------------------------------------------------------------------
# MESSAGE EDIT AND DELETE
# ------------------------------------------------------------------------------

@router.post("/messages/{message_id}/edit")
async def edit_message(
    message_id: str,
    payload: dict[str, Any],
    ctx: ScopeContext = AuthCtx,
) -> dict[str, Any]:
    """Edits message content (author only, within 15 minutes)."""
    new_content = payload.get("content", "")
    res = await MessagingService.edit_message(message_id, ctx.user_id, new_content)
    return res


@router.delete("/messages/{message_id}")
async def delete_message(message_id: str, ctx: ScopeContext = AuthCtx) -> dict[str, Any]:
    """Deletes/moderates a message (author or trainer/admin)."""
    res = await MessagingService.delete_message(message_id, ctx.user_id, ctx.role.value)
    return res


@router.post("/attachments/upload")
async def upload_attachment(
    file: UploadFile = File(...),
    ctx: ScopeContext = AuthCtx,
) -> dict[str, Any]:
    """Uploads file attachment for messaging (PDF, document, image)."""
    import uuid
    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise ValidationError("File size exceeds 25 MB limit.")

    filename = file.filename or "attachment"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    file_type = "other"
    if ext in ("png", "jpg", "jpeg", "webp", "gif"):
        file_type = "image"
    elif ext == "pdf":
        file_type = "pdf"
    elif ext in ("doc", "docx", "txt", "xlsx", "csv"):
        file_type = "document"

    storage_key = f"messaging/{ctx.user_id}/{uuid.uuid4()}.{ext}"
    storage = get_storage()
    await storage.put(storage_key, content, content_type=file.content_type or "application/octet-stream")
    download_url = await storage.signed_download_url(storage_key, filename=filename)

    return {
        "fileName": filename,
        "fileUrl": download_url,
        "fileType": file_type,
        "fileSizeBytes": len(content),
    }


# ------------------------------------------------------------------------------
# SYNCHRONIZATION AND RECONCILIATION
# ------------------------------------------------------------------------------

@router.post("/sync/reconcile")
async def reconcile_messaging(ctx: ScopeContext = AdminCtx) -> dict[str, Any]:
    """Administrative trigger to reconcile all batch groups and memberships."""
    groups_cnt = await MessagingService.sync_all_institute_batch_groups(ctx.college_id)
    trainers_cnt = await MessagingService.reconcile_all_trainers(ctx.college_id)
    students_cnt = await MessagingService.reconcile_all_students(ctx.college_id)
    return {
        "success": True,
        "syncedGroups": groups_cnt,
        "reconciledTrainers": trainers_cnt,
        "reconciledStudents": students_cnt,
    }


# ------------------------------------------------------------------------------
# WEBSOCKET REAL-TIME ENDPOINT
# ------------------------------------------------------------------------------

@router.websocket("/ws")
async def messaging_websocket(ws: WebSocket):
    """Authenticated WebSocket endpoint for real-time messaging.
    Tokens are transmitted over initial handshake JSON payload, not URL query params.
    """
    await ws.accept()
    auth_user_id: str | None = None
    auth_role: str | None = None
    auth_institution_id: str | None = None

    try:
        # Step 1: Handshake Authentication
        init_data = await asyncio.wait_for(ws.receive_text(), timeout=10.0)
        auth_msg = json.loads(init_data)
        if auth_msg.get("type") != "auth" or not auth_msg.get("token"):
            await ws.send_text(json.dumps({"type": "error", "message": "Authentication required as first message."}))
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        token = auth_msg["token"]
        try:
            payload = jwt.decode(
                token,
                settings.JWT_SECRET,
                algorithms=[settings.JWT_ALGORITHM],
                options={"verify_exp": True},
            )
            auth_user_id = str(payload.get("sub") or payload.get("user_id"))
            auth_role = str(payload.get("role", "STUDENT")).upper()
            auth_institution_id = str(payload.get("institution_id") or "")
        except Exception as e:
            log.warning("WebSocket auth failed", extra={"error": str(e)})
            await ws.send_text(json.dumps({"type": "error", "message": "Invalid or expired token."}))
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
            return

        await messaging_hub.connect_user(auth_user_id, ws)
        await ws.send_text(
            json.dumps({"type": "auth_ack", "userId": auth_user_id, "status": "authenticated"})
        )

        # Step 2: Message & Subscription Event Loop
        while True:
            text = await ws.receive_text()
            data = json.loads(text)
            event_type = data.get("type")

            if event_type == "heartbeat":
                await ws.send_text(json.dumps({"type": "heartbeat_ack", "timestamp": data.get("timestamp")}))

            elif event_type == "subscribe":
                room = data.get("room")
                if room:
                    # Validate room access permission
                    if room.startswith("group:"):
                        group_id = room.replace("group:", "")
                        try:
                            # Validates active membership
                            await MessagingService.get_group_details(group_id, auth_user_id, auth_role)
                            await messaging_hub.subscribe(auth_user_id, ws, room)
                            await ws.send_text(json.dumps({"type": "subscribed", "room": room}))
                        except Exception as e:
                            await ws.send_text(json.dumps({"type": "error", "message": f"Room subscription denied: {str(e)}"}))
                    elif room.startswith("conv:"):
                        conv_id = room.replace("conv:", "")
                        try:
                            # Validates participant authorization
                            await MessagingService.get_direct_messages(conv_id, auth_user_id, limit=1)
                            await messaging_hub.subscribe(auth_user_id, ws, room)
                            await ws.send_text(json.dumps({"type": "subscribed", "room": room}))
                        except Exception as e:
                            await ws.send_text(json.dumps({"type": "error", "message": f"Room subscription denied: {str(e)}"}))

            elif event_type == "unsubscribe":
                room = data.get("room")
                if room:
                    await messaging_hub.unsubscribe(auth_user_id, ws, room)
                    await ws.send_text(json.dumps({"type": "unsubscribed", "room": room}))

    except WebSocketDisconnect:
        pass
    except asyncio.TimeoutError:
        try:
            await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        except Exception:
            pass
    finally:
        await messaging_hub.disconnect(ws)
