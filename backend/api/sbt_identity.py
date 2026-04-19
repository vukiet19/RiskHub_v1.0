from __future__ import annotations

import asyncio
import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from api.dashboard import (
    _build_dashboard_overview,
    _get_latest_metrics_doc,
    _parse_user_object_id,
    _serialise_doc,
)
from api.risk_analysis import get_risk_analysis_overview
from database import get_database
from models.risk_identity_profile import (
    EligibilitySnapshot,
    LeverageSnapshot,
    RiskIdentityProfileDocument,
)

router = APIRouter(prefix="/api/v1/sbt-identity", tags=["sbt-identity"])


class SaveRiskProfileRequest(BaseModel):
    wallet_address: Optional[str] = Field(default=None)


def _optional_float(value: Any) -> float | None:
    try:
        if value in [None, ""]:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        if value in [None, ""]:
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def _to_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        if isinstance(item, str):
            clean = item.strip()
            if clean:
                out.append(clean)
    return out


def _dedupe_strings(*groups: list[str]) -> list[str]:
    seen: set[str] = set()
    merged: list[str] = []
    for group in groups:
        for item in group:
            clean = item.strip()
            if not clean or clean in seen:
                continue
            seen.add(clean)
            merged.append(clean)
    return merged


def _normalise_wallet(value: str | None) -> str | None:
    if not value:
        return None
    clean = value.strip()
    return clean or None


def _to_iso_datetime(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    if isinstance(value, str) and value.strip():
        return value
    return None


def _parse_iso_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    clean = value.strip()
    if not clean:
        return None
    try:
        parsed = datetime.fromisoformat(clean.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _derive_risk_level(total_risk_score: float | None) -> str:
    if total_risk_score is None:
        return "Unrated"
    if total_risk_score >= 75:
        return "Critical"
    if total_risk_score >= 55:
        return "Elevated"
    if total_risk_score >= 30:
        return "Moderate"
    return "Low"


def _derive_identity_tier(
    discipline_score: float | None,
    risk_score: float | None,
    flagged_count: int,
    preview_allowed: bool,
) -> str:
    if not preview_allowed or discipline_score is None:
        return "Pending"
    if discipline_score >= 85 and (risk_score if risk_score is not None else 100.0) <= 35 and flagged_count == 0:
        return "Verified"
    if discipline_score >= 70 and (risk_score if risk_score is not None else 100.0) <= 55:
        return "Qualified"
    if discipline_score >= 55 and (risk_score if risk_score is not None else 100.0) <= 75:
        return "Conditional"
    return "Restricted"


def _build_behavior_flags_summary(active_flags: list[str], alerts: list[dict[str, Any]]) -> list[str]:
    def _match(pattern: re.Pattern[str]) -> bool:
        if any(pattern.search(flag) for flag in active_flags):
            return True
        for alert in alerts:
            blob = " ".join(
                [
                    str(alert.get("rule_id") or ""),
                    str(alert.get("rule_name") or ""),
                    str(alert.get("title") or ""),
                    str(alert.get("message") or ""),
                ]
            )
            if pattern.search(blob):
                return True
        return False

    has_behavior_data = bool(active_flags) or len(alerts) > 0
    if not has_behavior_data:
        return ["Behavioral flag detail is unavailable in the current snapshot."]

    flagged: list[str] = []
    if _match(re.compile(r"revenge|rq-?001", re.IGNORECASE)):
        flagged.append("Revenge trading")
    if _match(re.compile(r"overtrading|trade frequency|rq-?002", re.IGNORECASE)):
        flagged.append("Overtrading")
    if _match(re.compile(r"excessive leverage|high leverage|over_20x|rq-?003", re.IGNORECASE)):
        flagged.append("Excessive leverage")

    if not flagged:
        return ["No active behavior flags"]
    return flagged


def _evaluate_eligibility(
    *,
    has_connection: bool,
    source_state: str,
    freshness_state: str,
    discipline_score: float | None,
    has_activity: bool,
) -> dict[str, Any]:
    met: list[str] = []
    missing: list[str] = []
    blockers: list[str] = []

    if has_connection:
        met.append("At least one active exchange connection is available.")
    else:
        missing.append("Connect at least one exchange account to load a profile.")

    if source_state not in {"error", "no_connection"}:
        met.append("RiskHub can read a usable profile snapshot.")
    else:
        missing.append("RiskHub cannot read a usable profile snapshot yet.")

    if discipline_score is not None:
        met.append("A discipline score is available.")
    else:
        missing.append("RiskHub still needs a discipline score for this profile.")

    if has_activity:
        met.append("There is enough activity or live exposure to form a profile.")
    else:
        missing.append("More activity or live exposure is needed.")

    if source_state == "partial":
        blockers.append("Some profile inputs are partial, so demo issuance remains blocked.")
    if freshness_state in {"limited", "unavailable"}:
        blockers.append("Snapshot freshness is too limited for full demo issuance.")

    preview_allowed = (
        has_connection
        and source_state not in {"error", "no_connection"}
        and discipline_score is not None
        and has_activity
    )
    eligible = preview_allowed and len(blockers) == 0
    reason = (
        "Your profile is ready for a demo identity issue."
        if eligible
        else (blockers[0] if blockers else (missing[0] if missing else "Profile is not ready yet."))
    )
    return {
        "status": "eligible" if eligible else "ineligible",
        "reason": reason,
        "preview_allowed": preview_allowed,
        "met": met,
        "missing": missing,
        "blockers": blockers,
    }


def _derive_profile_status(source_state: str, warnings: list[str]) -> str:
    if source_state in {"error", "no_connection"}:
        return source_state
    if source_state in {"partial", "limited", "no_data", "configured", "stale", "needs_connection"}:
        return "partial"
    if warnings:
        return "partial"
    return "ready"


def _stable_profile_hash(payload: dict[str, Any]) -> str:
    serialised = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(serialised.encode("utf-8")).hexdigest()


async def _load_recent_alerts(user_id: ObjectId, limit: int = 20) -> list[dict[str, Any]]:
    db = get_database()
    docs = await db.alerts_log.find(
        {"user_id": user_id},
        projection={
            "rule_id": 1,
            "rule_name": 1,
            "title": 1,
            "message": 1,
            "severity": 1,
            "triggered_at": 1,
        },
    ).sort("triggered_at", -1).to_list(length=limit)
    return [_serialise_doc(doc) for doc in docs]


async def _get_latest_saved_profile_doc(user_id: ObjectId) -> dict[str, Any] | None:
    db = get_database()
    return await db.risk_identity_profiles.find_one(
        {"$or": [{"user_id": user_id}, {"user_id": str(user_id)}]},
        sort=[("version", -1)],
    )


async def _get_saved_profile_doc_by_profile_id(user_id: ObjectId, profile_id: str) -> dict[str, Any] | None:
    db = get_database()
    return await db.risk_identity_profiles.find_one(
        {
            "profile_id": profile_id,
            "$or": [{"user_id": user_id}, {"user_id": str(user_id)}],
        }
    )


async def _get_saved_profile_history_docs(user_id: ObjectId, *, limit: int = 20) -> list[dict[str, Any]]:
    db = get_database()
    return await db.risk_identity_profiles.find(
        {"$or": [{"user_id": user_id}, {"user_id": str(user_id)}]}
    ).sort("version", -1).to_list(length=limit)


async def _get_previous_saved_profile_doc(user_id: ObjectId, *, before_version: int) -> dict[str, Any] | None:
    db = get_database()
    return await db.risk_identity_profiles.find_one(
        {
            "version": {"$lt": before_version},
            "$or": [{"user_id": user_id}, {"user_id": str(user_id)}],
        },
        sort=[("version", -1)],
    )


async def _build_current_profile(user_id: ObjectId, *, wallet_address: str | None = None) -> dict[str, Any]:
    warnings: list[str] = []

    overview_result, metrics_doc_result, risk_result, alerts_result = await asyncio.gather(
        _build_dashboard_overview(user_id),
        _get_latest_metrics_doc(user_id),
        get_risk_analysis_overview(str(user_id), scope="all", mode="future"),
        _load_recent_alerts(user_id),
        return_exceptions=True,
    )

    overview: dict[str, Any]
    if isinstance(overview_result, Exception):
        overview = {
            "has_configured_exchange_connection": False,
            "exchange_connections": [],
            "warnings": [],
            "last_refresh_at": None,
            "data_freshness": {"state": "unknown"},
        }
        warnings.append(f"Dashboard overview is unavailable: {overview_result}")
    else:
        overview = overview_result

    metrics_doc = None if isinstance(metrics_doc_result, Exception) else metrics_doc_result
    if isinstance(metrics_doc_result, Exception):
        warnings.append(f"Metrics snapshot is unavailable: {metrics_doc_result}")

    if isinstance(risk_result, Exception):
        risk_payload: dict[str, Any] = {
            "source_state": "error",
            "generated_at": None,
            "warnings": [f"Risk analysis is unavailable: {risk_result}"],
            "risk_score_total": None,
            "risk_components": {},
            "concentration_summary": {},
            "leverage_summary": {},
            "quant_summary": {},
            "source_details": {},
            "top_risk_contributors": [],
        }
    else:
        risk_payload = risk_result

    alerts = [] if isinstance(alerts_result, Exception) else alerts_result
    if isinstance(alerts_result, Exception):
        warnings.append(f"Alert feed is unavailable: {alerts_result}")

    metrics = _serialise_doc(metrics_doc) if metrics_doc else {}
    risk = risk_payload if isinstance(risk_payload, dict) else {}

    exchange_connections = overview.get("exchange_connections") if isinstance(overview.get("exchange_connections"), list) else []
    configured_exchanges = len(exchange_connections)
    active_exchanges = sum(
        1 for connection in exchange_connections
        if isinstance(connection, dict) and connection.get("is_active")
    )
    has_connection = bool(overview.get("has_configured_exchange_connection")) or active_exchanges > 0

    discipline_score = _optional_float(((metrics.get("discipline_score") or {}).get("total"))) or _optional_float(overview.get("discipline_score"))
    discipline_grade = str((metrics.get("discipline_score") or {}).get("grade") or overview.get("discipline_grade") or "Unrated")

    risk_score = _optional_float(risk.get("risk_score_total"))
    risk_level = _derive_risk_level(risk_score)
    source_state = str(risk.get("source_state") or ("no_connection" if not has_connection else "error")).strip().lower()
    freshness_state = str(((overview.get("data_freshness") or {}).get("state") or "unknown")).strip().lower()

    trade_activity_count = _safe_int(metrics.get("trade_count"), default=0)
    if trade_activity_count <= 0:
        trade_activity_count = _safe_int((risk.get("quant_summary") or {}).get("trade_count"), default=0)
    position_count = _safe_int((risk.get("source_details") or {}).get("position_count"), default=0)
    holdings_count = _safe_int((risk.get("source_details") or {}).get("holdings_count"), default=0)
    has_activity = (
        trade_activity_count > 0
        or position_count > 0
        or holdings_count > 0
        or len(risk.get("top_risk_contributors") if isinstance(risk.get("top_risk_contributors"), list) else []) > 0
    )

    active_rule_flags = _to_string_list(metrics.get("active_rule_flags"))
    behavior_flags_summary = _build_behavior_flags_summary(active_rule_flags, alerts)
    flagged_behavior_count = sum(1 for flag in behavior_flags_summary if flag not in {"No active behavior flags", "Behavioral flag detail is unavailable in the current snapshot."})

    eligibility = _evaluate_eligibility(
        has_connection=has_connection,
        source_state=source_state,
        freshness_state=freshness_state,
        discipline_score=discipline_score,
        has_activity=has_activity,
    )
    identity_tier = _derive_identity_tier(
        discipline_score=discipline_score,
        risk_score=risk_score,
        flagged_count=flagged_behavior_count,
        preview_allowed=bool(eligibility.get("preview_allowed")),
    )

    max_drawdown_pct = _optional_float((metrics.get("max_drawdown") or {}).get("value_pct"))
    if max_drawdown_pct is None:
        max_drawdown_pct = _optional_float(overview.get("max_drawdown_pct"))

    leverage_average = _optional_float((metrics.get("leverage") or {}).get("average"))
    if leverage_average is None:
        leverage_average = _optional_float((risk.get("leverage_summary") or {}).get("average_leverage"))
    leverage_maximum = _optional_float((metrics.get("leverage") or {}).get("max_used"))
    if leverage_maximum is None:
        leverage_maximum = _optional_float((risk.get("leverage_summary") or {}).get("max_leverage"))

    contagion_score = _optional_float((risk.get("risk_components") or {}).get("contagion_score"))
    if contagion_score is None:
        contagion_score = _optional_float((risk.get("contagion_summary") or {}).get("contagion_risk_score"))

    concentration_summary = risk.get("concentration_summary") if isinstance(risk.get("concentration_summary"), dict) else {}
    top_asset = concentration_summary.get("top_asset")
    if not isinstance(top_asset, str) or not top_asset.strip():
        top_asset = None
    top_asset_concentration_pct = _optional_float(concentration_summary.get("top_asset_pct"))

    source_snapshot_at = (
        _to_iso_datetime(risk.get("generated_at"))
        or _to_iso_datetime(metrics.get("calculated_at"))
        or _to_iso_datetime(overview.get("last_refresh_at"))
    )

    merged_warnings = _dedupe_strings(
        _to_string_list(overview.get("warnings")),
        _to_string_list(risk.get("warnings")),
        warnings,
    )
    profile_status = _derive_profile_status(source_state=source_state, warnings=merged_warnings)

    hash_payload = {
        "user_id": str(user_id),
        "wallet_address": _normalise_wallet(wallet_address),
        "source_snapshot_at": source_snapshot_at,
        "identity_tier": identity_tier,
        "risk_level": risk_level,
        "discipline_score": discipline_score,
        "discipline_grade": discipline_grade,
        "total_risk_score": risk_score,
        "max_drawdown_pct": max_drawdown_pct,
        "leverage_average": leverage_average,
        "leverage_maximum": leverage_maximum,
        "contagion_score": contagion_score,
        "top_asset": top_asset,
        "top_asset_concentration_pct": top_asset_concentration_pct,
        "active_exchanges": active_exchanges,
        "configured_exchanges": configured_exchanges,
        "trade_activity_count": trade_activity_count,
        "position_count": position_count,
        "behavior_flags_summary": sorted(behavior_flags_summary),
        "source_state": source_state,
        "profile_status": profile_status,
        "warnings": sorted(merged_warnings),
        "metrics_payload_hash": metrics.get("sbt_payload_hash"),
    }
    profile_hash = _stable_profile_hash(hash_payload)

    return {
        "profile_id": f"current_{profile_hash[:12]}",
        "user_id": str(user_id),
        "wallet_address": _normalise_wallet(wallet_address),
        "saved_at": None,
        "version": None,
        "source_snapshot_at": source_snapshot_at,
        "identity_tier": identity_tier,
        "risk_level": risk_level,
        "discipline_score": discipline_score,
        "discipline_grade": discipline_grade,
        "total_risk_score": risk_score,
        "max_drawdown_pct": max_drawdown_pct,
        "leverage": {
            "average": leverage_average,
            "maximum": leverage_maximum,
        },
        "contagion_score": contagion_score,
        "top_asset": top_asset,
        "top_asset_concentration_pct": top_asset_concentration_pct,
        "active_exchanges": active_exchanges,
        "configured_exchanges": configured_exchanges,
        "trade_activity_count": trade_activity_count,
        "position_count": position_count,
        "behavior_flags_summary": behavior_flags_summary,
        "source_state": source_state,
        "profile_status": profile_status,
        "warnings": merged_warnings,
        "profile_hash": profile_hash,
        "eligibility": eligibility,
        "metadata": {
            "metrics_payload_hash": metrics.get("sbt_payload_hash"),
            "sbt_ready": bool(metrics.get("sbt_ready", False)),
            "freshness_state": freshness_state,
        },
    }


def _format_compare_value(value: Any) -> str:
    if value in [None, ""]:
        return "--"
    if isinstance(value, float):
        return f"{value:.2f}"
    if isinstance(value, list):
        if len(value) == 0:
            return "--"
        return ", ".join(str(item) for item in value)
    return str(value)


def _build_compare_row(
    *,
    key: str,
    label: str,
    base_value: Any,
    target_value: Any,
    tolerance: float = 0.0,
) -> dict[str, Any]:
    if base_value is None and target_value is None:
        return {
            "key": key,
            "label": label,
            "saved": "--",
            "current": "--",
            "base": "--",
            "target": "--",
            "change_state": "unavailable",
            "delta": None,
        }

    delta: float | None = None
    if isinstance(base_value, (int, float)) and isinstance(target_value, (int, float)):
        delta = float(target_value) - float(base_value)
        changed = abs(delta) > tolerance
    elif isinstance(base_value, list) and isinstance(target_value, list):
        changed = sorted(str(v) for v in base_value) != sorted(str(v) for v in target_value)
    else:
        changed = str(base_value) != str(target_value)

    return {
        "key": key,
        "label": label,
        "saved": _format_compare_value(base_value),
        "current": _format_compare_value(target_value),
        "base": _format_compare_value(base_value),
        "target": _format_compare_value(target_value),
        "change_state": "changed" if changed else "same",
        "delta": delta,
    }


def _build_compare_rows(base_profile: dict[str, Any], target_profile: dict[str, Any]) -> list[dict[str, Any]]:
    base_leverage = base_profile.get("leverage") if isinstance(base_profile.get("leverage"), dict) else {}
    target_leverage = target_profile.get("leverage") if isinstance(target_profile.get("leverage"), dict) else {}

    base_top = (
        f"{base_profile.get('top_asset') or '--'} ({_format_compare_value(base_profile.get('top_asset_concentration_pct'))}%)"
        if base_profile.get("top_asset")
        else "--"
    )
    target_top = (
        f"{target_profile.get('top_asset') or '--'} ({_format_compare_value(target_profile.get('top_asset_concentration_pct'))}%)"
        if target_profile.get("top_asset")
        else "--"
    )

    return [
        _build_compare_row(
            key="discipline_score",
            label="Discipline Score",
            base_value=_optional_float(base_profile.get("discipline_score")),
            target_value=_optional_float(target_profile.get("discipline_score")),
            tolerance=0.05,
        ),
        _build_compare_row(
            key="risk_level",
            label="Risk Level",
            base_value=base_profile.get("risk_level"),
            target_value=target_profile.get("risk_level"),
        ),
        _build_compare_row(
            key="identity_tier",
            label="Identity Tier",
            base_value=base_profile.get("identity_tier"),
            target_value=target_profile.get("identity_tier"),
        ),
        _build_compare_row(
            key="max_drawdown_pct",
            label="Max Drawdown %",
            base_value=_optional_float(base_profile.get("max_drawdown_pct")),
            target_value=_optional_float(target_profile.get("max_drawdown_pct")),
            tolerance=0.01,
        ),
        _build_compare_row(
            key="leverage_average",
            label="Average Leverage",
            base_value=_optional_float(base_leverage.get("average")),
            target_value=_optional_float(target_leverage.get("average")),
            tolerance=0.01,
        ),
        _build_compare_row(
            key="contagion_score",
            label="Contagion Score",
            base_value=_optional_float(base_profile.get("contagion_score")),
            target_value=_optional_float(target_profile.get("contagion_score")),
            tolerance=0.01,
        ),
        _build_compare_row(
            key="top_concentration",
            label="Top Concentration",
            base_value=base_top,
            target_value=target_top,
        ),
        _build_compare_row(
            key="behavior_flags",
            label="Behavior Flags",
            base_value=_to_string_list(base_profile.get("behavior_flags_summary")),
            target_value=_to_string_list(target_profile.get("behavior_flags_summary")),
        ),
        _build_compare_row(
            key="warnings",
            label="Warnings",
            base_value=_to_string_list(base_profile.get("warnings")),
            target_value=_to_string_list(target_profile.get("warnings")),
        ),
        _build_compare_row(
            key="source_snapshot_at",
            label="Snapshot Time",
            base_value=base_profile.get("source_snapshot_at"),
            target_value=target_profile.get("source_snapshot_at"),
        ),
    ]


@router.get("/{user_id}/profile/current")
async def get_current_risk_profile(user_id: str):
    uid = _parse_user_object_id(user_id)
    profile = await _build_current_profile(uid)
    return {
        "status": "ok",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "profile": profile,
    }


@router.get("/{user_id}/profile/saved")
async def get_saved_risk_profile(user_id: str):
    uid = _parse_user_object_id(user_id)
    saved_doc = await _get_latest_saved_profile_doc(uid)
    if not saved_doc:
        return {
            "status": "ok",
            "exists": False,
            "profile": None,
            "message": "No saved profile yet. Save your current risk profile to create a reusable identity record.",
        }
    return {
        "status": "ok",
        "exists": True,
        "profile": _serialise_doc(saved_doc),
        "message": "Latest saved risk profile loaded.",
    }


@router.get("/{user_id}/profile/history")
async def get_saved_risk_profile_history(
    user_id: str,
    limit: int = Query(20, ge=1, le=100),
):
    uid = _parse_user_object_id(user_id)
    history_docs = await _get_saved_profile_history_docs(uid, limit=limit)
    serialised = [_serialise_doc(doc) for doc in history_docs]
    return {
        "status": "ok",
        "count": len(serialised),
        "profiles": serialised,
        "latest_profile_id": serialised[0].get("profile_id") if serialised else None,
        "message": (
            "Saved profile history loaded."
            if serialised
            else "No saved profile history yet. Save a profile to start version continuity."
        ),
    }


@router.get("/{user_id}/profile/saved/{profile_id}")
async def get_saved_risk_profile_by_id(user_id: str, profile_id: str):
    uid = _parse_user_object_id(user_id)
    saved_doc = await _get_saved_profile_doc_by_profile_id(uid, profile_id)
    if not saved_doc:
        raise HTTPException(status_code=404, detail="Saved risk profile not found for this user.")
    return {
        "status": "ok",
        "profile": _serialise_doc(saved_doc),
        "message": "Saved profile version loaded.",
    }


@router.post("/{user_id}/profile/save")
async def save_risk_profile(user_id: str, request: SaveRiskProfileRequest):
    uid = _parse_user_object_id(user_id)
    current_profile = await _build_current_profile(uid, wallet_address=request.wallet_address)

    db = get_database()
    latest_saved = await _get_latest_saved_profile_doc(uid)
    next_version = _safe_int(latest_saved.get("version"), default=0) + 1 if latest_saved else 1
    profile_id = f"rpid_{str(uid)[-6:]}_{next_version:04d}"
    saved_at = datetime.now(timezone.utc)

    eligibility = current_profile.get("eligibility") if isinstance(current_profile.get("eligibility"), dict) else {}
    leverage = current_profile.get("leverage") if isinstance(current_profile.get("leverage"), dict) else {}

    document = RiskIdentityProfileDocument(
        profile_id=profile_id,
        user_id=uid,
        wallet_address=_normalise_wallet(request.wallet_address) or _normalise_wallet(current_profile.get("wallet_address")),
        saved_at=saved_at,
        version=next_version,
        source_snapshot_at=_parse_iso_datetime(current_profile.get("source_snapshot_at")),
        identity_tier=str(current_profile.get("identity_tier") or "Pending"),
        risk_level=str(current_profile.get("risk_level") or "Unrated"),
        discipline_score=_optional_float(current_profile.get("discipline_score")),
        discipline_grade=str(current_profile.get("discipline_grade") or "Unrated"),
        total_risk_score=_optional_float(current_profile.get("total_risk_score")),
        max_drawdown_pct=_optional_float(current_profile.get("max_drawdown_pct")),
        leverage=LeverageSnapshot(
            average=_optional_float(leverage.get("average")),
            maximum=_optional_float(leverage.get("maximum")),
        ),
        contagion_score=_optional_float(current_profile.get("contagion_score")),
        top_asset=str(current_profile.get("top_asset")).strip() if current_profile.get("top_asset") else None,
        top_asset_concentration_pct=_optional_float(current_profile.get("top_asset_concentration_pct")),
        active_exchanges=_safe_int(current_profile.get("active_exchanges"), default=0),
        configured_exchanges=_safe_int(current_profile.get("configured_exchanges"), default=0),
        trade_activity_count=_safe_int(current_profile.get("trade_activity_count"), default=0),
        position_count=_safe_int(current_profile.get("position_count"), default=0),
        behavior_flags_summary=_to_string_list(current_profile.get("behavior_flags_summary")),
        source_state=str(current_profile.get("source_state") or "unknown"),
        profile_status=str(current_profile.get("profile_status") or "partial"),
        warnings=_to_string_list(current_profile.get("warnings")),
        profile_hash=str(current_profile.get("profile_hash") or ""),
        eligibility=EligibilitySnapshot(
            status="eligible" if eligibility.get("status") == "eligible" else "ineligible",
            reason=str(eligibility.get("reason") or "Eligibility was not evaluated."),
            preview_allowed=bool(eligibility.get("preview_allowed")),
            met=_to_string_list(eligibility.get("met")),
            missing=_to_string_list(eligibility.get("missing")),
            blockers=_to_string_list(eligibility.get("blockers")),
        ),
        metadata=current_profile.get("metadata") if isinstance(current_profile.get("metadata"), dict) else {},
    )

    insert_payload = document.model_dump(by_alias=True)
    await db.risk_identity_profiles.insert_one(insert_payload)

    saved_doc = await _get_latest_saved_profile_doc(uid)
    if not saved_doc:
        raise HTTPException(status_code=500, detail="Risk profile save completed but could not be reloaded.")

    return {
        "status": "ok",
        "message": "Risk profile snapshot saved.",
        "profile": _serialise_doc(saved_doc),
    }


@router.get("/{user_id}/profile/compare")
async def compare_saved_with_latest(
    user_id: str,
    base_profile_id: str | None = Query(default=None),
    target: str = Query(default="latest_snapshot"),
    target_profile_id: str | None = Query(default=None),
):
    uid = _parse_user_object_id(user_id)
    latest_saved_doc = await _get_latest_saved_profile_doc(uid)

    if not latest_saved_doc:
        current_profile = await _build_current_profile(uid)
        return {
            "status": "ok",
            "has_saved_profile": False,
            "comparison_state": "no_saved_profile",
            "message": "No saved profile exists yet. Save your current profile before comparing.",
            "current_profile": current_profile,
            "saved_profile": None,
            "base_profile": None,
            "target_profile": current_profile,
            "base_label": "Saved profile",
            "target_label": "Latest live snapshot",
            "matches_saved_hash": False,
            "changed_fields": 0,
            "changes": [],
        }

    if base_profile_id:
        base_doc = await _get_saved_profile_doc_by_profile_id(uid, base_profile_id)
        if not base_doc:
            raise HTTPException(status_code=404, detail="Base saved profile was not found.")
    else:
        base_doc = latest_saved_doc

    base_profile = _serialise_doc(base_doc)
    base_label = f"Saved version v{base_profile.get('version') or '?'}"

    target_key = (target or "latest_snapshot").strip().lower()
    if target_key == "latest":
        target_key = "latest_snapshot"

    target_profile: dict[str, Any] | None = None
    target_label = "Latest live snapshot"

    if target_key == "latest_snapshot":
        target_profile = await _build_current_profile(uid)
        target_label = "Latest live snapshot"
    elif target_key == "latest_saved":
        target_profile = _serialise_doc(latest_saved_doc)
        target_label = f"Latest saved version v{target_profile.get('version') or '?'}"
    elif target_key == "previous_saved":
        base_version = _safe_int(base_profile.get("version"), default=0)
        previous_doc = await _get_previous_saved_profile_doc(uid, before_version=base_version)
        if not previous_doc:
            return {
                "status": "ok",
                "has_saved_profile": True,
                "comparison_state": "cannot_compare",
                "message": "No previous saved version exists before the selected profile.",
                "current_profile": None,
                "saved_profile": base_profile,
                "base_profile": base_profile,
                "target_profile": None,
                "base_label": base_label,
                "target_label": "Previous saved version",
                "matches_saved_hash": False,
                "changed_fields": 0,
                "changes": [],
            }
        target_profile = _serialise_doc(previous_doc)
        target_label = f"Previous saved version v{target_profile.get('version') or '?'}"
    elif target_key in {"saved_profile", "saved"}:
        if not target_profile_id:
            raise HTTPException(status_code=400, detail="target_profile_id is required when target=saved_profile.")
        target_doc = await _get_saved_profile_doc_by_profile_id(uid, target_profile_id)
        if not target_doc:
            raise HTTPException(status_code=404, detail="Target saved profile was not found.")
        target_profile = _serialise_doc(target_doc)
        target_label = f"Saved version v{target_profile.get('version') or '?'}"
    else:
        raise HTTPException(
            status_code=400,
            detail="Invalid target. Use latest_snapshot, latest_saved, previous_saved, or saved_profile.",
        )

    if not target_profile:
        raise HTTPException(status_code=500, detail="Comparison target could not be resolved.")

    matches_hash = str(base_profile.get("profile_hash") or "") == str(target_profile.get("profile_hash") or "")
    comparison_state = "changed_since_save"
    message = "The compared profiles differ."

    if target_key == "latest_snapshot":
        profile_status = str(target_profile.get("profile_status") or "partial")
        if profile_status in {"error", "no_connection"}:
            comparison_state = "cannot_compare"
            message = "Latest snapshot is unavailable, so comparison cannot be trusted yet."
        elif profile_status == "partial":
            comparison_state = "incomplete_snapshot"
            message = "Latest snapshot is partial. Comparison is shown, but treat it as provisional."
        elif matches_hash:
            comparison_state = "up_to_date"
            message = "Selected saved version matches the latest RiskHub snapshot."
        else:
            comparison_state = "changed_since_save"
            message = "Latest snapshot has changed since the selected saved version."
    else:
        if matches_hash:
            comparison_state = "up_to_date"
            message = f"{base_label} matches {target_label}."
        else:
            comparison_state = "changed_since_save"
            message = f"{base_label} differs from {target_label}."

    changes = _build_compare_rows(base_profile, target_profile)
    changed_fields = sum(1 for row in changes if row.get("change_state") == "changed")

    return {
        "status": "ok",
        "has_saved_profile": True,
        "comparison_state": comparison_state,
        "message": message,
        "current_profile": target_profile if target_key == "latest_snapshot" else None,
        "saved_profile": base_profile,
        "base_profile": base_profile,
        "target_profile": target_profile,
        "base_profile_id": base_profile.get("profile_id"),
        "target_profile_id": target_profile.get("profile_id"),
        "base_label": base_label,
        "target_label": target_label,
        "target_kind": target_key,
        "matches_saved_hash": matches_hash,
        "changed_fields": changed_fields,
        "changes": changes,
    }
