"""
RiskHub — WebSocket Endpoint Router
=====================================
ws://.../ws/alerts/{user_id}

PRD v1.0 §6.2.4:
  "Alerts shall be delivered via WebSocket push; no polling mechanism
   shall be used for alert delivery."

This endpoint accepts a WebSocket connection, registers it with the
global ``ConnectionManager``, and keeps it alive until the client
disconnects.  The Quant Engine pushes alerts through the manager's
``send_personal_message`` method.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.websocket_manager import ws_manager

logger = logging.getLogger("riskhub.api.ws")

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/alerts/{user_id}")
async def websocket_alerts_endpoint(websocket: WebSocket, user_id: str):
    """
    Per-user WebSocket connection for real-time alert delivery.

    Protocol:
      1. Client connects to ``ws://<host>/ws/alerts/<user_id>``
      2. Server accepts and registers the connection.
      3. Server pushes alert JSON payloads when the Quant Engine
         fires a new alert for this user.
      4. Client can send ``{"type": "ping"}`` to keep alive.
      5. Connection is cleaned up on disconnect.
    """
    await ws_manager.connect(user_id, websocket)

    try:
        while True:
            # Keep the connection alive; handle client messages
            data = await websocket.receive_json()
            msg_type = data.get("type", "")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif msg_type == "mark_read":
                # Future: could mark alerts read via WS
                await websocket.send_json({"type": "ack", "action": "mark_read"})
            else:
                await websocket.send_json({"type": "echo", "data": data})

    except WebSocketDisconnect:
        ws_manager.disconnect(user_id, websocket)
        logger.info("WS client disconnected normally: user=%s", user_id)
    except Exception as e:
        ws_manager.disconnect(user_id, websocket)
        logger.warning("WS connection error for user=%s: %s", user_id, e)
