from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from api.dashboard import (
    DISPLAY_MODE_LABELS,
    _get_latest_metrics_doc,
    _load_live_positions_snapshot,
    _load_live_holdings_snapshot,
    _normalise_display_mode,
    _parse_user_object_id,
    _serialise_doc,
)
from database import get_database
from engine.correlation_engine import calculate_contagion_graph
from engine.quant_engine import _compute_additional_metrics
from engine.risk_engine import calculate_risk_overview
from services.exchange_service import fetch_daily_ohlcv

router = APIRouter(prefix="/api/v1/risk-analysis", tags=["risk-analysis"])


def _optional_float(value: Any) -> float | None:
    try:
        if value in [None, ""]:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _dedupe_warnings(*warning_groups: list[str]) -> list[str]:
    seen: set[str] = set()
    merged: list[str] = []
    for group in warning_groups:
        for warning in group:
            if not warning or warning in seen:
                continue
            seen.add(warning)
            merged.append(warning)
    return merged


def _safe_int(value: Any) -> int:
    try:
        if value in [None, ""]:
            return 0
        return int(value)
    except (TypeError, ValueError):
        return 0


async def _preferred_trade_history_query(
    user_id: Any,
    *,
    since: datetime,
    scope: str,
) -> dict[str, Any]:
    db = get_database()
    base_query: dict[str, Any] = {"user_id": user_id, "closed_at": {"$gte": since}}
    if scope != "all":
        base_query["exchange_id"] = scope

    preferred_query = {**base_query, "record_type": "closed_position"}
    if await db.trade_history.find_one(preferred_query, projection={"_id": 1}):
        return preferred_query
    return base_query


def _to_profit_factor_summary(
    *,
    profit_factor: float | None,
    trade_count: int,
    losses: int,
    net_pnl_usd: float | None,
) -> tuple[float | None, str | None]:
    if trade_count > 0 and losses == 0 and (net_pnl_usd or 0.0) > 0:
        return None, "∞"
    return profit_factor, None


async def _compute_scope_quant_fallback(
    user_id: Any,
    *,
    scope: str,
    window_days: int,
) -> dict[str, Any]:
    db = get_database()
    since = datetime.now(tz=timezone.utc) - timedelta(days=window_days)
    query = await _preferred_trade_history_query(user_id, since=since, scope=scope)

    trades = await db.trade_history.find(query).sort("closed_at", -1).to_list(length=5000)
    if not trades:
        return {
            "available": False,
            "trade_count": 0,
            "profit_factor": None,
            "profit_factor_display": None,
            "sharpe_ratio": None,
        }

    additional = _compute_additional_metrics(trades)
    losses = sum(
        1
        for trade in trades
        if (_optional_float(trade.get("realized_pnl_usd")) or 0.0) < 0
    )
    net_pnl_usd = _optional_float(additional.get("net_pnl_usd"))
    profit_factor, profit_factor_display = _to_profit_factor_summary(
        profit_factor=_optional_float(additional.get("profit_factor")),
        trade_count=len(trades),
        losses=losses,
        net_pnl_usd=net_pnl_usd,
    )
    return {
        "available": True,
        "trade_count": len(trades),
        "profit_factor": profit_factor,
        "profit_factor_display": profit_factor_display,
        "sharpe_ratio": _optional_float(additional.get("sharpe_ratio")),
    }


async def _build_quant_summary(
    metrics_doc: dict[str, Any] | None,
    *,
    user_id: Any,
    scope: str,
    mode: str,
) -> dict[str, Any]:
    scope_label = {"all": "All Exchanges", "binance": "Binance", "okx": "OKX"}.get(scope, scope)
    if mode == "spot":
        return {
            "available": False,
            "scope_alignment": "mode_limited",
            "profit_factor": None,
            "profit_factor_display": None,
            "sharpe_ratio": None,
            "window_days": 0,
            "trade_count": 0,
            "calculated_at": None,
            "insight": "Behavioral quant metrics are unavailable in Spot mode because the current engine is derived from closed futures-position history.",
        }
    if not metrics_doc:
        return {
            "available": False,
            "scope_alignment": "unavailable",
            "profit_factor": None,
            "profit_factor_display": None,
            "sharpe_ratio": None,
            "window_days": 0,
            "trade_count": 0,
            "calculated_at": None,
            "insight": "Sharpe ratio is unavailable until the Behavioral Quant Engine has produced at least one metrics snapshot.",
        }

    metrics = _serialise_doc(metrics_doc)
    window_days = _safe_int(metrics.get("window_days")) or 30
    if scope == "all":
        win_rate = metrics.get("win_rate") if isinstance(metrics.get("win_rate"), dict) else {}
        profit_factor, profit_factor_display = _to_profit_factor_summary(
            profit_factor=_optional_float(metrics.get("profit_factor")),
            trade_count=_safe_int(metrics.get("trade_count")),
            losses=_safe_int(win_rate.get("losses")),
            net_pnl_usd=_optional_float(metrics.get("net_pnl_usd")),
        )
        sharpe_ratio = _optional_float(metrics.get("sharpe_ratio"))
        return {
            "available": profit_factor is not None or profit_factor_display is not None or sharpe_ratio is not None,
            "scope_alignment": "matched",
            "profit_factor": profit_factor,
            "profit_factor_display": profit_factor_display,
            "sharpe_ratio": sharpe_ratio,
            "window_days": window_days,
            "trade_count": _safe_int(metrics.get("trade_count")),
            "calculated_at": metrics.get("calculated_at"),
            "insight": (
                "Profit factor is shown as infinite because there were no losing trades in the latest quant window."
                if profit_factor_display == "∞"
                else "Profit factor and Sharpe ratio are sourced from the latest Behavioral Quant Engine snapshot for the full portfolio."
            ),
        }

    by_exchange = metrics.get("by_exchange")
    exchange_rows = by_exchange if isinstance(by_exchange, list) else []
    scoped_row = next(
        (
            row for row in exchange_rows
            if isinstance(row, dict) and str(row.get("exchange_id", "")).strip().lower() == scope
        ),
        None,
    )
    if not isinstance(scoped_row, dict):
        fallback = await _compute_scope_quant_fallback(user_id, scope=scope, window_days=window_days)
        return {
            "available": fallback["available"],
            "scope_alignment": "matched" if fallback["available"] else "unavailable",
            "profit_factor": fallback["profit_factor"],
            "profit_factor_display": fallback["profit_factor_display"],
            "sharpe_ratio": fallback["sharpe_ratio"],
            "window_days": window_days,
            "trade_count": fallback["trade_count"],
            "calculated_at": metrics.get("calculated_at"),
            "insight": (
                f"No closed positions were found for {scope_label} in the latest {window_days}-day quant window."
                if not fallback["available"]
                else (
                    f"Profit factor is shown as infinite because {scope_label} had no losing trades in the latest quant window."
                    if fallback["profit_factor_display"] == "∞"
                    else f"Profit factor and Sharpe ratio were derived from recent {scope_label} closed positions because the latest snapshot predates exchange-specific quant fields."
                )
            ),
        }

    scoped_trade_count = _safe_int(scoped_row.get("trade_count"))
    profit_factor = _optional_float(scoped_row.get("profit_factor"))
    sharpe_ratio = _optional_float(scoped_row.get("sharpe_ratio"))
    if profit_factor is None or sharpe_ratio is None:
        fallback = await _compute_scope_quant_fallback(user_id, scope=scope, window_days=window_days)
        return {
            "available": fallback["available"],
            "scope_alignment": "matched",
            "profit_factor": fallback["profit_factor"],
            "profit_factor_display": fallback["profit_factor_display"],
            "sharpe_ratio": fallback["sharpe_ratio"],
            "window_days": window_days,
            "trade_count": fallback["trade_count"],
            "calculated_at": metrics.get("calculated_at"),
            "insight": (
                f"No closed positions were found for {scope_label} in the latest {window_days}-day quant window."
                if not fallback["available"]
                else (
                    f"Profit factor is shown as infinite because {scope_label} had no losing trades in the latest quant window."
                    if fallback["profit_factor_display"] == "∞"
                    else f"Profit factor and Sharpe ratio were derived from recent {scope_label} closed positions because the latest snapshot predates exchange-specific quant fields."
                )
            ),
        }

    return {
        "available": profit_factor is not None or sharpe_ratio is not None,
        "scope_alignment": "matched",
        "profit_factor": profit_factor,
        "profit_factor_display": None,
        "sharpe_ratio": sharpe_ratio,
        "window_days": window_days,
        "trade_count": scoped_trade_count,
        "calculated_at": metrics.get("calculated_at"),
        "insight": (
            f"Profit factor and Sharpe ratio are sourced from the latest {scope_label} closed-position breakdown."
        ),
    }


@router.get("/{user_id}/overview")
async def get_risk_analysis_overview(
    user_id: str,
    scope: str = Query("all", description="Scope filter: all, binance, okx"),
    mode: str = Query("all", description="Display mode: all, spot, future"),
):
    uid = _parse_user_object_id(user_id)
    scope = scope.strip().lower()
    if scope not in ["all", "binance", "okx"]:
        raise HTTPException(status_code=400, detail="Invalid scope parameter. Must be all, binance, or okx.")
    display_mode = _normalise_display_mode(mode)

    metrics_doc = await _get_latest_metrics_doc(uid)
    quant_summary = await _build_quant_summary(metrics_doc, user_id=uid, scope=scope, mode=display_mode)
    holdings_snapshot = await _load_live_holdings_snapshot(uid, scope=scope, mode=display_mode)
    positions_snapshot = await _load_live_positions_snapshot(uid, scope=scope, mode=display_mode)

    holdings = holdings_snapshot.get("holdings", {}) or {}
    positions = positions_snapshot.get("positions", []) or []
    has_configured_connection = holdings_snapshot.get("has_configured_connection", False)
    scope_label = {"all": "All Exchanges", "binance": "Binance", "okx": "OKX"}[scope]
    mode_label = DISPLAY_MODE_LABELS[display_mode]

    warnings = _dedupe_warnings(
        holdings_snapshot.get("warnings", []),
        positions_snapshot.get("warnings", []),
    )

    if not has_configured_connection:
        return _build_empty_response(
            scope=scope,
            scope_label=scope_label,
            mode=display_mode,
            mode_label=mode_label,
            source_state="no_connection",
            warnings=warnings,
            message="No active Binance or OKX connection is available for this risk analysis scope.",
            holdings=holdings,
            positions=positions,
            quant_summary=quant_summary,
        )

    if not holdings and not positions:
        return _build_empty_response(
            scope=scope,
            scope_label=scope_label,
            mode=display_mode,
            mode_label=mode_label,
            source_state="no_data",
            warnings=warnings,
            message="No live holdings or open positions are currently available for this scope.",
            holdings=holdings,
            positions=positions,
            quant_summary=quant_summary,
        )

    symbols = list(holdings.keys())
    market_data_source = "binance" if scope == "all" else scope
    market_data_source_effective = market_data_source

    meta = {"used_fallback": False}
    contagion_graph = calculate_contagion_graph({}, {}, window_days=30)
    if len(symbols) >= 2:
        ohlcv_data = await fetch_daily_ohlcv(
            market_data_source,
            symbols,
            days=45,
            out_warnings=warnings,
            out_meta=meta,
        )
        contagion_graph = calculate_contagion_graph(ohlcv_data, holdings, window_days=30)
        if meta.get("used_fallback"):
            market_data_source_effective = "binance_fallback"
    else:
        warnings = _dedupe_warnings(
            warnings,
            ["Contagion analysis is limited because fewer than two meaningful assets are available in this scope."],
        )

    risk_data = calculate_risk_overview(
        positions=positions,
        holdings=holdings,
        contagion_graph=contagion_graph,
        warnings=warnings,
    )

    if warnings:
        source_state = "partial"
        message = "Risk analysis loaded with warnings. Some exchange or market-data inputs were incomplete."
    elif positions or holdings:
        source_state = "live"
        if display_mode == "spot":
            message = "Risk analysis reflects the current scoped live spot-holdings snapshot."
        elif positions:
            message = "Risk analysis reflects the current scoped live portfolio snapshot."
        else:
            message = "Risk analysis reflects the current scoped live exposure snapshot."
    else:
        source_state = "limited"
        message = "Risk analysis is available, but there are no live futures positions in this scope."

    return {
        "status": "ok",
        "source_state": source_state,
        "scope_label": scope_label,
        "scope": scope,
        "mode": display_mode,
        "mode_label": mode_label,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "message": message,
        "warnings": warnings,
        "source_details": {
            "has_configured_connection": has_configured_connection,
            "holdings_count": len(holdings),
            "position_count": len(positions),
            "display_mode_requested": display_mode,
            "market_data_source_requested": market_data_source,
            "market_data_source_effective": market_data_source_effective,
        },
        "quant_summary": quant_summary,
        **risk_data,
    }


def _build_empty_response(
    *,
    scope: str,
    scope_label: str,
    mode: str,
    mode_label: str,
    source_state: str,
    warnings: list[str],
    message: str,
    holdings: dict[str, float],
    positions: list[dict[str, Any]],
    quant_summary: dict[str, Any],
) -> dict[str, Any]:
    return {
        "status": "ok",
        "source_state": source_state,
        "scope_label": scope_label,
        "scope": scope,
        "mode": mode,
        "mode_label": mode_label,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "message": message,
        "warnings": warnings,
        "source_details": {
            "has_configured_connection": source_state != "no_connection",
            "holdings_count": len(holdings),
            "position_count": len(positions),
            "display_mode_requested": mode,
            "market_data_source_requested": "binance" if scope == "all" else scope,
            "market_data_source_effective": None,
        },
        "quant_summary": quant_summary,
        "risk_score_total": 0.0,
        "risk_components": {
            "concentration_score": 0.0,
            "leverage_score": 0.0,
            "drawdown_score": 0.0,
            "contagion_score": 0.0,
        },
        "top_risk_contributors": [],
        "concentration_summary": {
            "top_asset": "None",
            "top_asset_value": 0.0,
            "top_asset_pct": 0.0,
            "largest_cluster": None,
            "largest_cluster_pct": 0.0,
            "dominant_exchange": None,
            "dominant_exchange_pct": 0.0,
            "insight": message,
        },
        "leverage_summary": {
            "effective_leverage": 0.0,
            "average_leverage": 0.0,
            "max_leverage": 0.0,
            "total_notional": 0.0,
            "insight": message,
        },
        "drawdown_summary": {
            "current_drawdown_pct": 0.0,
            "total_unrealized_pnl": 0.0,
            "worst_position_symbol": None,
            "worst_position_pnl": 0.0,
            "insight": message,
        },
        "contagion_summary": {
            "available": False,
            "source_state": "insufficient_data",
            "contagion_risk_score": 0.0,
            "contagion_risk_delta_7d": 0.0,
            "systemic_asset": None,
            "top_risk_pair": None,
            "largest_cluster": None,
            "network_density": 0.0,
            "insight": message,
        },
        "scenario_results": [],
        "position_risk_rows": [],
        "attention_items": [
            {
                "severity": "moderate",
                "title": "Risk analysis needs more live input",
                "detail": message,
                "source": source_state,
            }
        ],
    }
