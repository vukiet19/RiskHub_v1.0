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
from engine.quant_engine import run_quant_engine
from security import EncryptionConfigError
from services.exchange_key_service import (
    decrypt_exchange_key_document,
    get_active_exchange_key,
    get_user_exchange_keys,
    sanitize_exchange_key_document,
    update_exchange_key_sync_status,
)
from services.exchange_service import (
    fetch_account_overview,
    fetch_and_sync_trades,
    fetch_daily_ohlcv,
    fetch_open_positions,
    fetch_spot_balances,
)

logger = logging.getLogger("riskhub.api.dashboard")

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])

STABLE_ASSETS = {
    "USD", "USDT", "USDC", "BUSD", "FDUSD", "TUSD", "USDP", "DAI",
}
QUOTE_SUFFIXES = tuple(sorted(STABLE_ASSETS, key=len, reverse=True))


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


def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _extract_base_asset(symbol: str) -> str:
    clean = symbol.split(":")[0]
    if "/" in clean:
        return clean.split("/")[0]
    for suffix in QUOTE_SUFFIXES:
        if clean.endswith(suffix) and len(clean) > len(suffix):
            return clean[: -len(suffix)]
    return clean


def _latest_close(candles: list[list[float]]) -> Optional[float]:
    if not candles:
        return None
    last = candles[-1]
    if len(last) < 5:
        return None
    return _safe_float(last[4])


async def _get_live_exchange_context(user_id: ObjectId) -> dict[str, Any]:
    """
    Return active exchange credentials plus connection warnings that are
    usable by server-side dashboard loaders.
    """
    try:
        key_docs = await get_user_exchange_keys(user_id)
    except LookupError:
        return {
            "credentials": [],
            "warnings": [],
            "has_configured_connection": False,
        }

    credentials: list[dict[str, Any]] = []
    warnings: list[str] = []
    has_configured_connection = False

    for key_doc in key_docs:
        if not key_doc.get("is_active", True):
            continue

        has_configured_connection = True
        exchange_id = key_doc.get("exchange_id")
        label = key_doc.get("label") or exchange_id
        try:
            decrypted = decrypt_exchange_key_document(key_doc)
        except EncryptionConfigError as e:
            logger.warning(
                "Skipping live dashboard fetch for %s: %s",
                exchange_id,
                e,
            )
            warnings.append(
                f"Live data is unavailable for {label} because server decryption is not configured."
            )
            continue
        except Exception as e:
            logger.warning(
                "Skipping live dashboard fetch for %s: could not decrypt credentials (%s).",
                exchange_id,
                e,
            )
            warnings.append(
                f"Live data is unavailable for {label} because stored credentials could not be read."
            )
            continue

        credentials.append(
            {
                "exchange_id": exchange_id,
                "label": key_doc.get("label"),
                "environment": key_doc.get("environment", "mainnet"),
                "market_type": key_doc.get("market_type", "mixed"),
                "api_key": decrypted["api_key"],
                "api_secret": decrypted["api_secret"],
                "passphrase": decrypted.get("passphrase"),
                "testnet": decrypted["testnet"],
            }
        )

    return {
        "credentials": credentials,
        "warnings": warnings,
        "has_configured_connection": has_configured_connection,
    }


def _normalise_position_snapshot(position: dict[str, Any], exchange_id: str) -> dict[str, Any]:
    return {
        "symbol": position.get("symbol") or "UNKNOWN",
        "side": str(position.get("side") or "long"),
        "leverage": int(_safe_float(position.get("leverage")) or 1),
        "unrealized_pnl": str(round(_safe_float(position.get("unrealized_pnl")), 2)),
        "mark_price": str(round(_safe_float(position.get("mark_price")), 6)),
        "entry_price": str(round(_safe_float(position.get("entry_price")), 6)),
        "exchange_id": exchange_id,
    }


async def _load_live_holdings_snapshot(user_id: ObjectId) -> dict[str, Any]:
    """
    Best-effort live holdings loader using server-side exchange access.
    Returns holdings plus connection-state metadata for dashboard messaging.
    """
    context = await _get_live_exchange_context(user_id)
    credentials = context["credentials"]
    warnings = list(context["warnings"])
    if not credentials:
        return {
            "holdings": {},
            "warnings": warnings,
            "has_configured_connection": context["has_configured_connection"],
        }

    holdings: dict[str, float] = {}

    for credential in credentials:
        exchange_id = credential["exchange_id"]
        api_key = credential["api_key"]
        api_secret = credential["api_secret"]
        passphrase = credential.get("passphrase")
        market_type = credential.get("market_type", "mixed")
        testnet = bool(credential.get("testnet"))

        if market_type in {"spot", "mixed"}:
            try:
                balances = await fetch_spot_balances(
                    exchange_id=exchange_id,
                    api_key=api_key,
                    api_secret=api_secret,
                    passphrase=passphrase,
                    testnet=testnet,
                )
                assets = [
                    asset
                    for asset in balances.get("assets", [])
                    if asset.get("asset") not in STABLE_ASSETS and _safe_float(asset.get("total")) > 0
                ]

                asset_symbols = [asset["asset"] for asset in assets]
                spot_ohlcv = (
                    await fetch_daily_ohlcv(exchange_id, asset_symbols, days=8)
                    if asset_symbols else {}
                )

                for asset in assets:
                    symbol = asset["asset"]
                    qty = _safe_float(asset.get("total"))
                    last_close = _latest_close(spot_ohlcv.get(symbol, []))
                    if qty <= 0 or last_close is None or last_close <= 0:
                        continue
                    holdings[symbol] = holdings.get(symbol, 0.0) + round(qty * last_close, 2)
            except Exception as e:
                logger.warning("Failed to fetch live spot balances for %s: %s", exchange_id, e)
                warnings.append(
                    f"Spot balances are currently unavailable for {credential.get('label') or exchange_id}."
                )

        if market_type in {"futures", "mixed"}:
            try:
                positions = await fetch_open_positions(
                    exchange_id=exchange_id,
                    api_key=api_key,
                    api_secret=api_secret,
                    passphrase=passphrase,
                    testnet=testnet,
                )
                for position in positions:
                    base_asset = _extract_base_asset(position.get("symbol", ""))
                    contracts = _safe_float(position.get("contracts"))
                    mark_price = _safe_float(position.get("mark_price"))
                    notional_value = abs(contracts * mark_price)
                    if (
                        not base_asset
                        or base_asset in STABLE_ASSETS
                        or notional_value <= 0
                    ):
                        continue
                    holdings[base_asset] = holdings.get(base_asset, 0.0) + round(notional_value, 2)
            except Exception as e:
                logger.warning("Failed to fetch live futures positions for %s: %s", exchange_id, e)
                warnings.append(
                    f"Futures positions are currently unavailable for {credential.get('label') or exchange_id}."
                )

    return {
        "holdings": {
            asset: round(value, 2)
            for asset, value in holdings.items()
            if value > 0
        },
        "warnings": warnings,
        "has_configured_connection": context["has_configured_connection"],
    }


# ── Endpoints ────────────────────────────────────────────────────────────

async def _load_live_positions_snapshot(user_id: ObjectId) -> dict[str, Any]:
    """
    Best-effort live open positions snapshot using server-side exchange access.
    Returns positions plus connection-state metadata for dashboard messaging.
    """
    context = await _get_live_exchange_context(user_id)
    credentials = context["credentials"]
    warnings = list(context["warnings"])
    if not credentials:
        return {
            "positions": [],
            "warnings": warnings,
            "has_configured_connection": context["has_configured_connection"],
        }

    positions: list[dict[str, Any]] = []

    for credential in credentials:
        exchange_id = credential["exchange_id"]
        api_key = credential["api_key"]
        api_secret = credential["api_secret"]
        passphrase = credential.get("passphrase")
        market_type = credential.get("market_type", "mixed")
        testnet = bool(credential.get("testnet"))

        if market_type == "spot":
            continue

        try:
            exchange_positions = await fetch_open_positions(
                exchange_id=exchange_id,
                api_key=api_key,
                api_secret=api_secret,
                passphrase=passphrase,
                testnet=testnet,
            )
            positions.extend(
                _normalise_position_snapshot(position, exchange_id)
                for position in exchange_positions
            )
        except Exception as e:
            logger.warning("Failed to fetch live open positions for %s: %s", exchange_id, e)
            warnings.append(
                f"Live positions are currently unavailable for {credential.get('label') or exchange_id}."
            )

    positions.sort(
        key=lambda position: abs(_safe_float(position.get("unrealized_pnl"))),
        reverse=True,
    )
    return {
        "positions": positions,
        "warnings": warnings,
        "has_configured_connection": context["has_configured_connection"],
    }


def _parse_user_object_id(user_id: str) -> ObjectId:
    try:
        return ObjectId(user_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid user_id format") from e


async def _get_latest_metrics_doc(user_id: ObjectId) -> Optional[dict[str, Any]]:
    db = get_database()
    return await db.risk_metrics.find_one(
        {"user_id": user_id},
        sort=[("calculated_at", -1)],
        hint="idx_user_calculated_desc",
    )


async def _build_dashboard_overview(user_id: ObjectId) -> dict[str, Any]:
    key_docs = await get_user_exchange_keys(user_id)
    metrics_doc = await _get_latest_metrics_doc(user_id)

    live_overviews: list[dict[str, Any]] = []
    warnings: list[str] = []
    live_snapshot_at: Optional[datetime] = None

    for key_doc in key_docs:
        if not key_doc.get("is_active", True):
            continue
        try:
            credential = decrypt_exchange_key_document(key_doc)
            live_overview = await fetch_account_overview(
                exchange_id=credential["exchange_id"],
                api_key=credential["api_key"],
                api_secret=credential["api_secret"],
                passphrase=credential.get("passphrase"),
                testnet=credential["testnet"],
                market_type=credential.get("market_type", "mixed"),
            )
            live_overviews.append(live_overview)
            live_snapshot_at = datetime.now(tz=timezone.utc)
            warnings.extend(live_overview.get("warnings", []))
        except EncryptionConfigError as e:
            logger.warning(
                "Skipping live overview for %s/%s: %s",
                key_doc.get("exchange_id"),
                key_doc.get("environment"),
                e,
            )
            warnings.append("Live account data is unavailable because server decryption is not configured.")
        except Exception as e:
            logger.warning(
                "Skipping live overview for %s/%s: %s",
                key_doc.get("exchange_id"),
                key_doc.get("environment"),
                e,
            )
            warnings.append(
                f"Live account data is currently unavailable for {key_doc.get('label') or key_doc.get('exchange_id')}."
            )

    total_portfolio_value = round(
        sum(_safe_float(item.get("total_portfolio_value_usd")) for item in live_overviews),
        2,
    )
    total_unrealized_pnl = round(
        sum(_safe_float(item.get("total_unrealized_pnl_usd")) for item in live_overviews),
        2,
    )

    metrics_calculated_at = (
        metrics_doc.get("calculated_at")
        if metrics_doc and isinstance(metrics_doc.get("calculated_at"), datetime)
        else None
    )
    last_sync_candidates = [
        key_doc.get("last_sync_at")
        for key_doc in key_docs
        if isinstance(key_doc.get("last_sync_at"), datetime)
    ]
    if metrics_calculated_at:
        last_sync_candidates.append(metrics_calculated_at)
    last_refresh_at = max(last_sync_candidates) if last_sync_candidates else None

    freshness_state = "needs_connection"
    if live_overviews:
        freshness_state = "live"
    elif last_refresh_at:
        freshness_state = "stale"
    elif key_docs:
        freshness_state = "configured"

    return {
        "status": "ok",
        "total_portfolio_value": total_portfolio_value,
        "total_unrealized_pnl": total_unrealized_pnl,
        "net_pnl_usd": round(_safe_float(metrics_doc.get("net_pnl_usd")) if metrics_doc else 0.0, 2),
        "discipline_score": (
            int(metrics_doc.get("discipline_score", {}).get("total", 0))
            if metrics_doc else 0
        ),
        "discipline_grade": (
            metrics_doc.get("discipline_score", {}).get("grade", "N/A")
            if metrics_doc else "N/A"
        ),
        "max_drawdown_pct": round(
            _safe_float(metrics_doc.get("max_drawdown", {}).get("value_pct")) if metrics_doc else 0.0,
            2,
        ),
        "exchange_connections": [
            sanitize_exchange_key_document(key_doc)
            for key_doc in key_docs
        ],
        "has_configured_exchange_connection": any(
            key_doc.get("is_active", True)
            for key_doc in key_docs
        ),
        "last_refresh_at": last_refresh_at.isoformat() if last_refresh_at else None,
        "data_freshness": {
            "state": freshness_state,
            "live_account_snapshot_at": (
                live_snapshot_at.isoformat() if live_snapshot_at else None
            ),
            "metrics_calculated_at": (
                metrics_calculated_at.isoformat() if metrics_calculated_at else None
            ),
        },
        "has_live_exchange_connection": bool(live_overviews),
        "warnings": warnings,
    }


def _determine_sync_status_for_error(error: Exception) -> str:
    if "rate limit" in str(error).lower():
        return "rate_limited"
    return "error"


async def _refresh_dashboard_from_stored_key(user_id: ObjectId) -> dict[str, Any]:
    started_at = datetime.now(tz=timezone.utc)
    key_doc = await get_active_exchange_key(
        user_id,
        exchange_id="binance",
        environment="testnet",
        market_type="futures",
    )
    if key_doc is None:
        key_doc = await get_active_exchange_key(
            user_id,
            exchange_id="binance",
            environment="testnet",
        )
    if key_doc is None:
        raise HTTPException(
            status_code=404,
            detail="No active Binance Testnet connection found for this user.",
        )

    try:
        credential = decrypt_exchange_key_document(key_doc)
        live_overview = await fetch_account_overview(
            exchange_id=credential["exchange_id"],
            api_key=credential["api_key"],
            api_secret=credential["api_secret"],
            passphrase=credential.get("passphrase"),
            testnet=credential["testnet"],
            market_type=credential.get("market_type", "futures"),
        )
        trade_sync = await fetch_and_sync_trades(
            user_id=user_id,
            exchange_id=credential["exchange_id"],
            api_key=credential["api_key"],
            api_secret=credential["api_secret"],
            passphrase=credential.get("passphrase"),
            testnet=credential["testnet"],
        )
        engine_result = await run_quant_engine(user_id)
        finished_at = datetime.now(tz=timezone.utc)

        warnings = list(live_overview.get("warnings", []))
        if engine_result.get("status") == "no_data":
            warnings.append(engine_result.get("message", "No trades were available for risk metrics."))

        updated_key = await update_exchange_key_sync_status(
            user_id,
            exchange_id=credential["exchange_id"],
            environment=credential.get("environment", "testnet"),
            market_type=credential.get("market_type", "futures"),
            last_sync_status="ok",
            last_sync_error=None,
            last_sync_at=finished_at,
        )

        return {
            "status": "partial" if warnings else "ok",
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "exchange_connection": sanitize_exchange_key_document(updated_key or key_doc),
            "trade_sync": trade_sync,
            "positions_count": int(live_overview.get("positions_count", 0)),
            "balances_count": int(live_overview.get("balances_count", 0)),
            "account_overview": {
                "total_portfolio_value": round(
                    _safe_float(live_overview.get("total_portfolio_value_usd")),
                    2,
                ),
                "total_unrealized_pnl": round(
                    _safe_float(live_overview.get("total_unrealized_pnl_usd")),
                    2,
                ),
            },
            "engine_status": engine_result.get("status", "error"),
            "warnings": warnings,
        }
    except EncryptionConfigError as e:
        await update_exchange_key_sync_status(
            user_id,
            exchange_id=key_doc.get("exchange_id", "binance"),
            environment=key_doc.get("environment", "testnet"),
            market_type=key_doc.get("market_type", "futures"),
            last_sync_status="error",
            last_sync_error="Server decryption is not configured.",
            last_sync_at=datetime.now(tz=timezone.utc),
        )
        raise HTTPException(
            status_code=503,
            detail="Server decryption is not configured.",
        ) from e
    except ValueError as e:
        await update_exchange_key_sync_status(
            user_id,
            exchange_id=key_doc.get("exchange_id", "binance"),
            environment=key_doc.get("environment", "testnet"),
            market_type=key_doc.get("market_type", "futures"),
            last_sync_status="error",
            last_sync_error=str(e),
            last_sync_at=datetime.now(tz=timezone.utc),
        )
        raise HTTPException(status_code=400, detail=str(e)) from e
    except HTTPException:
        raise
    except Exception as e:
        await update_exchange_key_sync_status(
            user_id,
            exchange_id=key_doc.get("exchange_id", "binance"),
            environment=key_doc.get("environment", "testnet"),
            market_type=key_doc.get("market_type", "futures"),
            last_sync_status=_determine_sync_status_for_error(e),
            last_sync_error=str(e),
            last_sync_at=datetime.now(tz=timezone.utc),
        )
        logger.exception("Dashboard refresh failed for user %s", user_id)
        raise HTTPException(
            status_code=502,
            detail="Dashboard refresh failed while reading Binance Testnet data.",
        ) from e


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


@router.get("/{user_id}/positions")
async def get_live_positions(user_id: str):
    """
    Fetch a live open-positions snapshot for the dashboard using
    server-side exchange access only.
    """
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id format")

    snapshot = await _load_live_positions_snapshot(uid)
    positions = snapshot["positions"]

    source_state = "live"
    message: Optional[str] = None
    if not snapshot["has_configured_connection"]:
        source_state = "no_connection"
        message = "Connect Binance Testnet to load live positions."
    elif snapshot["warnings"] and not positions:
        source_state = "error"
        message = snapshot["warnings"][0]
    elif not positions:
        source_state = "no_open_positions"
        message = "No open futures positions were found on Binance Testnet."

    return {
        "status": "ok",
        "positions": positions,
        "count": len(positions),
        "has_configured_connection": snapshot["has_configured_connection"],
        "source_state": source_state,
        "message": message,
        "warnings": snapshot["warnings"],
    }


@router.get("/{user_id}/overview")
async def get_dashboard_overview(user_id: str):
    """
    Fetch an aggregated dashboard overview driven by backend-managed data.
    """
    uid = _parse_user_object_id(user_id)

    try:
        return await _build_dashboard_overview(uid)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


@router.post("/{user_id}/refresh")
async def refresh_dashboard(user_id: str):
    """
    Refresh dashboard-ready data using the stored active Binance Testnet key.
    """
    uid = _parse_user_object_id(user_id)

    try:
        return await _refresh_dashboard_from_stored_key(uid)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e


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

@router.get("/{user_id}/contagion-legacy")
async def get_contagion_graph_legacy(
    user_id: str,
    demo: bool = Query(False, description="If true, use demo holdings when live holdings are unavailable"),
):
    """
    Portfolio Contagion Map endpoint.

    Fetches real user holdings from trade_history, computes dependency
    structure via rolling correlation, and returns the full contagion
    contract (regime, summary, nodes, edges).

    Falls back to demo positions only when the user has zero holdings
    in the database — not in the normal response path.
    """
    return await get_contagion_graph(user_id=user_id, demo=demo)

    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id format")

    from services.exchange_service import fetch_daily_ohlcv
    from engine.correlation_engine import calculate_contagion_graph

    db = get_database()

    # ── 1. Try to load real user holdings from trade_history ──────────
    positions: dict[str, float] = {}
    try:
        pipeline = [
            {"$match": {"user_id": uid}},
            {"$group": {
                "_id": "$base_asset",
                "total_notional": {"$sum": {"$toDouble": "$notional_value_usd"}},
            }},
            {"$match": {"total_notional": {"$gt": 0}}},
        ]
        async for doc in db.trade_history.aggregate(pipeline):
            asset = doc["_id"]
            if asset and asset != "USDT":
                positions[asset] = round(doc["total_notional"], 2)
    except Exception as e:
        logger.warning("Failed to load user positions: %s", e)

    # ── 2. Fallback: demo positions if user has no holdings ──────────
    using_demo = False
    if len(positions) < 2:
        logger.info("User %s has fewer than 2 holdings, using demo positions for contagion map", user_id)
        positions = {
            "BTC": 45000.0,
            "ETH": 18000.0,
            "SOL": 5000.0,
            "DOGE": 1200.0,
            "BNB": 4800.0,
        }
        using_demo = True

    symbols = list(positions.keys())

    # ── 3. Fetch 30-day OHLCV from Binance (unauthenticated) ────────
    ohlcv_data = await fetch_daily_ohlcv("binance", symbols, days=30)

    # ── 4. Calculate full contagion contract ─────────────────────────
    graph_data = calculate_contagion_graph(ohlcv_data, positions, window_days=30)

    if using_demo:
        graph_data["_demo"] = True

    return {
        "status": "ok",
        "data": graph_data,
    }


@router.get("/{user_id}/contagion")
async def get_contagion_graph(
    user_id: str,
    demo: bool = Query(False, description="If true, use demo holdings when live holdings are unavailable"),
):
    """
    Portfolio Contagion Map endpoint.

    Normal responses use live user holdings if the server can access
    exchange keys. Demo data is only injected when the caller explicitly
    opts into ?demo=true.
    """
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user_id format")

    from engine.correlation_engine import calculate_contagion_graph
    from services.exchange_service import fetch_daily_ohlcv

    holdings_snapshot = await _load_live_holdings_snapshot(uid)
    positions = holdings_snapshot["holdings"]
    warnings = holdings_snapshot["warnings"]
    has_configured_connection = holdings_snapshot["has_configured_connection"]

    using_demo = False
    if len(positions) < 2 and demo:
        logger.info(
            "User %s has fewer than 2 live holdings, using demo positions because demo=true.",
            user_id,
        )
        positions = {
            "BTC": 45000.0,
            "ETH": 18000.0,
            "SOL": 5000.0,
            "DOGE": 1200.0,
            "BNB": 4800.0,
        }
        using_demo = True

    if len(positions) < 2:
        if not has_configured_connection:
            source_state = "no_connection"
            message = "Connect Binance Testnet and refresh to generate a live contagion map."
        elif warnings:
            source_state = "error"
            message = warnings[0]
        else:
            source_state = "insufficient_holdings"
            message = "Contagion mapping needs at least two meaningful non-stable holdings."

        return {
            "status": "ok",
            "source_state": source_state,
            "message": message,
            "warnings": warnings,
            "data": calculate_contagion_graph({}, {}, window_days=30),
        }

    symbols = list(positions.keys())
    ohlcv_data = await fetch_daily_ohlcv("binance", symbols, days=45)
    graph_data = calculate_contagion_graph(ohlcv_data, positions, window_days=30)

    if using_demo:
        graph_data["_demo"] = True

    return {
        "status": "ok",
        "source_state": "demo" if using_demo else "live",
        "message": warnings[0] if warnings else None,
        "warnings": warnings,
        "data": graph_data,
    }
