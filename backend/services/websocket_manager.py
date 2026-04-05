"""
RiskHub — WebSocket Connection Manager
========================================
Manages per-user WebSocket connections for real-time alert delivery.

PRD v1.0 §6.2.4:
  "Alerts shall be delivered via WebSocket push; no polling mechanism
   shall be used for alert delivery."

Design:
  * Keyed by ``user_id`` (string) — one user can have multiple active
    connections (multiple browser tabs).
  * ``send_personal_message`` pushes to ALL connections for a given user.
  * Thread-safe via asyncio (single-threaded event loop).
  * Non-blocking: if a send fails, the dead connection is removed silently.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from fastapi import WebSocket
from bson import ObjectId, Decimal128

logger = logging.getLogger("riskhub.ws")


def _json_serialiser(obj: Any) -> Any:
    """Custom serialiser for JSON-incompatible types in alert payloads."""
    if isinstance(obj, ObjectId):
        return str(obj)
    if isinstance(obj, Decimal128):
        return str(obj.to_decimal())
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


class ConnectionManager:
    """
    Manages active WebSocket connections mapped by ``user_id``.

    Usage::

        manager = ConnectionManager()

        # On connect
        await manager.connect(user_id, websocket)

        # Push alert
        await manager.send_personal_message(user_id, alert_dict)

        # On disconnect
        manager.disconnect(user_id, websocket)
    """

    def __init__(self) -> None:
        # user_id → set of active WebSocket connections
        self._connections: dict[str, set[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        """Accept and register a new WebSocket connection for a user."""
        await websocket.accept()
        if user_id not in self._connections:
            self._connections[user_id] = set()
        self._connections[user_id].add(websocket)
        logger.info(
            "WS connected: user=%s (total connections for user: %d)",
            user_id, len(self._connections[user_id]),
        )

    def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        """Remove a WebSocket connection for a user."""
        if user_id in self._connections:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                del self._connections[user_id]
            logger.info("WS disconnected: user=%s", user_id)

    def is_connected(self, user_id: str) -> bool:
        """Check if a user has at least one active WebSocket connection."""
        return user_id in self._connections and len(self._connections[user_id]) > 0

    @property
    def active_users(self) -> list[str]:
        """Return list of user_ids with active connections."""
        return list(self._connections.keys())

    @property
    def total_connections(self) -> int:
        """Total number of active WebSocket connections across all users."""
        return sum(len(sockets) for sockets in self._connections.values())

    async def send_personal_message(
        self,
        user_id: str,
        message: dict[str, Any],
    ) -> int:
        """
        Push a JSON message to ALL active connections for a specific user.

        Returns the number of connections that received the message
        successfully.  Dead connections are removed silently.
        """
        if user_id not in self._connections:
            logger.debug("No active WS for user %s — message dropped", user_id)
            return 0

        payload = json.dumps(message, default=_json_serialiser)
        dead: list[WebSocket] = []
        sent = 0

        for ws in self._connections[user_id]:
            try:
                await ws.send_text(payload)
                sent += 1
            except Exception as e:
                logger.warning("WS send failed for user %s: %s", user_id, e)
                dead.append(ws)

        # Prune dead connections
        for ws in dead:
            self._connections[user_id].discard(ws)
        if user_id in self._connections and not self._connections[user_id]:
            del self._connections[user_id]

        if sent > 0:
            logger.debug(
                "WS message sent to user %s (%d connections)", user_id, sent
            )

        return sent

    async def broadcast(self, message: dict[str, Any]) -> int:
        """Push a message to ALL connected users (e.g., system announcements)."""
        total = 0
        for user_id in list(self._connections.keys()):
            total += await self.send_personal_message(user_id, message)
        return total


# ── Singleton instance (imported by other modules) ───────────────────────
ws_manager = ConnectionManager()
