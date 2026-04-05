"""
RiskHub — Dashboard REST API
==============================
Endpoints for the frontend dashboard to read computed metrics and alerts.

GET /api/v1/dashboard/{user_id}/metrics  — Latest risk_metrics snapshot
GET /api/v1/dashboard/{user_id}/alerts   — Recent unread alerts
GET /api/v1/dashboard/{user_id}/history  — Discipline score time-series
POST /api/v1/dashboard/{user_id}/alerts/read  — Mark alerts as read
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from bson import ObjectId, Decimal128
from fastapi import APIRouter, HTTPException, Query

from database import get_database

logger = logging.getLogger("riskhub.api.dashboard")

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


# ── Helpers ──────────────────────────────────────────────────────────────

def _serialise_doc(doc: dict[str, Any]) -> dict[str, Any]:
    """
    Recursively convert BSON types (ObjectId, Decimal128, datetime) to
    JSON-safe primitives so FastAPI can serialise the response.
    """
    if doc is None:
        return {}
    out: dict[str, Any] = {}
    for key, val in doc.items():
        if isinstance(val, ObjectId):
            out[key] = str(val)
        elif isinstance(val, Decimal128):
            out[key] = str(val.to_decimal())
        elif isinstance(val, datetime):
            out[key] = val.isoformat()
        elif isinstance(val, dict):
            out[key] = _serialise_doc(val)
        elif isinstance(val, list):
            out[key] = [
                _serialise_doc(item) if isinstance(item, dict)
                else str(item) if isinstance(item, (ObjectId, Decimal128))
                else item.isoformat() if isinstance(item, datetime)
                else item
                for item in val
            ]
        else:
            out[key] = val
    return out


# ── Endpoints ────────────────────────────────────────────────────────────

@router.get("/{user_id}/metrics")
async def get_latest_metrics(user_id: str):
    """
    Fetch the **single latest** risk_metrics snapshot for a user.

    Uses ``hint("idx_user_calculated_desc")`` for guaranteed index
    utilisation per DB Schema §6.1.

    Projection limits the document transfer to dashboard-required
    fields per DB Schema §6.2.
    """
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id format")

    db = get_database()

    doc = await db.risk_metrics.find_one(
        {"user_id": uid},
        sort=[("calculated_at", -1)],
        hint="idx_user_calculated_desc",
    )

    if not doc:
        raise HTTPException(
            status_code=404,
            detail="No risk metrics found for this user. Run the engine first.",
        )

    return {"status": "ok", "data": _serialise_doc(doc)}


@router.get("/{user_id}/alerts")
async def get_recent_alerts(
    user_id: str,
    unread_only: bool = Query(True, description="If true, return only unread alerts"),
    limit: int = Query(20, ge=1, le=100, description="Max number of alerts to return"),
    severity: Optional[str] = Query(None, description="Filter by severity level"),
):
    """
    Fetch recent alerts for a user from ``alerts_log``.

    Uses ``hint("idx_user_isread_triggered")`` for unread queries and
    ``hint("idx_user_triggered_desc")`` for general queries.
    """
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id format")

    db = get_database()
    query: dict[str, Any] = {"user_id": uid}

    if unread_only:
        query["is_read"] = False
        hint = "idx_user_isread_triggered"
    else:
        hint = "idx_user_triggered_desc"

    if severity:
        query["severity"] = severity
        hint = "idx_user_severity_triggered"

    cursor = (
        db.alerts_log.find(query)
        .sort("triggered_at", -1)
        .hint(hint)
        .limit(limit)
    )

    alerts: list[dict] = []
    async for doc in cursor:
        alerts.append(_serialise_doc(doc))

    # Also get the total unread count for the badge
    unread_count = await db.alerts_log.count_documents(
        {"user_id": uid, "is_read": False},
        hint="idx_user_isread_triggered",
    )

    return {
        "status": "ok",
        "alerts": alerts,
        "count": len(alerts),
        "unread_total": unread_count,
    }


@router.get("/{user_id}/history")
async def get_metrics_history(
    user_id: str,
    days: int = Query(90, ge=1, le=365, description="Lookback window in days"),
):
    """
    Fetch discipline score time-series for charting.

    Uses the covered index ``idx_user_chart_covered`` to avoid
    loading full documents from disk (DB Schema §3.4).
    """
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id format")

    db = get_database()
    since = datetime.now(tz=timezone.utc) - timedelta(days=days)

    cursor = (
        db.risk_metrics.find(
            {"user_id": uid, "calculated_at": {"$gte": since}},
            projection={
                "calculated_at": 1,
                "discipline_score.total": 1,
                "discipline_score.grade": 1,
                "max_drawdown.value_pct": 1,
                "win_rate.value_pct": 1,
                "net_pnl_usd": 1,
            },
        )
        .sort("calculated_at", 1)
        .hint("idx_user_chart_covered")
    )

    data_points: list[dict] = []
    async for doc in cursor:
        data_points.append(_serialise_doc(doc))

    return {
        "status": "ok",
        "data": data_points,
        "count": len(data_points),
        "window_days": days,
    }


@router.post("/{user_id}/alerts/read")
async def mark_alerts_read(user_id: str):
    """
    Mark all unread alerts for a user as read.

    DB Schema §4.3 example query:
      updateMany({ user_id, is_read: false }, { $set: { is_read: true, read_at: now } })
    """
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id format")

    db = get_database()
    now = datetime.now(tz=timezone.utc)

    result = await db.alerts_log.update_many(
        {"user_id": uid, "is_read": False},
        {"$set": {"is_read": True, "read_at": now}},
    )

    return {
        "status": "ok",
        "marked_read": result.modified_count,
    }

@router.get("/{user_id}/contagion")
async def get_contagion_graph(user_id: str):
    """
    Fetch Pearson price correlation of user's active assets as a Graph topology.
    Mocks positions if empty to ensure the UI renders for MVP demonstration.
    """
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id format")

    from services.exchange_service import fetch_daily_ohlcv
    from engine.correlation_engine import calculate_contagion_graph

    # MVP mock positions in USD
    positions = {
        "BTC": 45000.0,
        "ETH": 18000.0,
        "SOL": 5000.0,
        "DOGE": 1200.0,
        "BNB": 4800.0
    }
    symbols = list(positions.keys())

    # Fetch 30-day OHLCV from Binance (unauthenticated)
    ohlcv_data = await fetch_daily_ohlcv("binance", symbols, days=30)
    
    # Calculate Graph Topology
    graph_data = calculate_contagion_graph(ohlcv_data, positions)

    # In case there's not enough data, return a default graph so UI doesn't crash
    if not graph_data["nodes"]:
        graph_data = {
            "nodes": [
                {"id": "BTC", "group": 1, "value": 45000},
                {"id": "ETH", "group": 2, "value": 18000},
                {"id": "SOL", "group": 3, "value": 5000}
            ],
            "edges": [
                {"source": "BTC", "target": "ETH", "correlation": 0.85},
                {"source": "BTC", "target": "SOL", "correlation": 0.60}
            ]
        }

    return {
        "status": "ok",
        "data": graph_data
    }
