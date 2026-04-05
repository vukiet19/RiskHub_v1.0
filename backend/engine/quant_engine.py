"""
RiskHub — Behavioral Quant Engine
===================================
PRD v1.0  §6.2   (Behavioral Rules Engine – Rule Definitions)
PRD v1.0  §6.2.3 (Calculated Metrics)
DB Schema §3.2   (risk_metrics document)
DB Schema §4.2   (alerts_log document)
DB Schema §6.1   (hint() on Quant Engine queries)

Pipeline executed on every sync cycle (or manually via API):
  1. Fetch last 30 days of closed trades from ``trade_history``
  2. Compute metrics  (Max Drawdown, Win Rate, Avg Leverage, TDS)
  3. Evaluate 5 MVP behavioral rules  (RQ-001 … RQ-005)
  4. Persist a ``risk_metrics`` snapshot  (append-only)
  5. Persist ``alerts_log`` records for any triggered rules
     (with 30-min rate-limit guard per DB Schema §4.4)
"""

from __future__ import annotations

import logging
import statistics
import time
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional

from bson import ObjectId, Decimal128

from database import get_database
from models.base import to_mongo_decimal

logger = logging.getLogger("riskhub.engine")

# ── Thresholds (PRD §6.2.2) ─────────────────────────────────────────────
REVENGE_LOSS_PCT_THRESHOLD = Decimal("5")      # loss > 5 % equity
REVENGE_WINDOW_MINUTES = 10                     # new pos within 10 min
REVENGE_MIN_LEVERAGE = 15                       # leverage >= 15×

OVERTRADING_COUNT = 10                          # > 10 trades
OVERTRADING_WINDOW_MINUTES = 60                 # within 60 min

EXCESSIVE_LEVERAGE_THRESHOLD = 50               # leverage > 50×

MAX_DRAWDOWN_BREACH_PCT = Decimal("20")         # portfolio dd > 20 %

CONCENTRATION_RISK_PCT = Decimal("60")          # single asset > 60 %

RATE_LIMIT_WINDOW_MINUTES = 30                  # alert cooldown


# ═════════════════════════════════════════════════════════════════════════
#  DATA FETCHING
# ═════════════════════════════════════════════════════════════════════════

async def _fetch_trades(
    user_id: ObjectId,
    window_days: int = 30,
) -> list[dict[str, Any]]:
    """
    Fetch the last ``window_days`` of closed trades for a user, sorted
    by ``closed_at`` descending.

    Uses hint(``idx_user_exchange_closedat_desc``) per DB Schema §6.1.
    """
    db = get_database()
    since = datetime.now(tz=timezone.utc) - timedelta(days=window_days)

    cursor = (
        db.trade_history.find(
            {"user_id": user_id, "closed_at": {"$gte": since}},
        )
        .sort("closed_at", -1)
        .hint("idx_user_exchange_closedat_desc")
    )

    trades: list[dict] = []
    async for doc in cursor:
        trades.append(doc)

    return trades


async def _fetch_previous_score(user_id: ObjectId) -> Optional[int]:
    """Fetch the most recent discipline score for trend calculation."""
    db = get_database()
    prev = await db.risk_metrics.find_one(
        {"user_id": user_id},
        sort=[("calculated_at", -1)],
        projection={"discipline_score.total": 1},
    )
    if prev and "discipline_score" in prev:
        return prev["discipline_score"].get("total")
    return None


# ═════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═════════════════════════════════════════════════════════════════════════

def _to_dec(value: Any) -> Decimal:
    """Coerce any value to Decimal (handles Decimal128, str, float, None)."""
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    if isinstance(value, Decimal128):
        return value.to_decimal()
    return Decimal(str(value))


def _grade(score: int) -> str:
    """Map 0-100 to a letter grade per PRD §6.2.3."""
    if score >= 95:
        return "A+"
    if score >= 90:
        return "A"
    if score >= 85:
        return "A-"
    if score >= 80:
        return "B+"
    if score >= 75:
        return "B"
    if score >= 70:
        return "B-"
    if score >= 65:
        return "C+"
    if score >= 60:
        return "C"
    if score >= 55:
        return "C-"
    if score >= 50:
        return "D+"
    if score >= 40:
        return "D"
    return "F"


# ═════════════════════════════════════════════════════════════════════════
#  METRIC CALCULATIONS
# ═════════════════════════════════════════════════════════════════════════

def _compute_max_drawdown(
    trades: list[dict],
) -> dict[str, Any]:
    """
    Peak-to-trough drawdown over the equity curve built from cumulative
    realised PnL of closed trades.

    PRD §6.2.3:
        ((Peak − Trough) / Peak) × 100
    """
    if not trades:
        return {
            "value_pct": Decimal("0"),
            "value_usd": Decimal("0"),
            "peak_equity_usd": Decimal("0"),
            "trough_equity_usd": Decimal("0"),
            "peak_at": None,
            "trough_at": None,
        }

    # Sort oldest → newest for equity curve
    sorted_trades = sorted(trades, key=lambda t: t["closed_at"])

    equity = Decimal("0")
    peak = Decimal("0")
    peak_at: datetime | None = None
    trough = Decimal("0")
    trough_at: datetime | None = None
    max_dd = Decimal("0")
    max_dd_usd = Decimal("0")
    dd_peak = Decimal("0")
    dd_peak_at: datetime | None = None
    dd_trough = Decimal("0")
    dd_trough_at: datetime | None = None

    for t in sorted_trades:
        pnl = _to_dec(t.get("realized_pnl_usd"))
        equity += pnl
        ts = t["closed_at"]

        if equity >= peak:
            peak = equity
            peak_at = ts

        drawdown_usd = peak - equity
        if peak > 0:
            drawdown_pct = (drawdown_usd / peak) * 100
        else:
            drawdown_pct = Decimal("0")

        if drawdown_pct > max_dd:
            max_dd = drawdown_pct
            max_dd_usd = drawdown_usd
            dd_peak = peak
            dd_peak_at = peak_at
            dd_trough = equity
            dd_trough_at = ts

    return {
        "value_pct": max_dd.quantize(Decimal("0.01")),
        "value_usd": (-max_dd_usd).quantize(Decimal("0.01")),
        "peak_equity_usd": dd_peak.quantize(Decimal("0.01")),
        "trough_equity_usd": dd_trough.quantize(Decimal("0.01")),
        "peak_at": dd_peak_at,
        "trough_at": dd_trough_at,
    }


def _compute_win_rate(trades: list[dict]) -> dict[str, Any]:
    """Win Rate = profitable closed trades / total closed trades × 100."""
    if not trades:
        return {"value_pct": Decimal("0"), "wins": 0, "losses": 0, "breakeven": 0}

    wins = sum(1 for t in trades if t.get("is_win") is True)
    losses = sum(
        1 for t in trades
        if t.get("pnl_category") == "loss"
        or (not t.get("is_win") and t.get("pnl_category") != "breakeven")
    )
    breakeven = len(trades) - wins - losses
    total = len(trades)
    pct = Decimal(str(wins)) / Decimal(str(total)) * 100 if total > 0 else Decimal("0")

    return {
        "value_pct": pct.quantize(Decimal("0.01")),
        "wins": wins,
        "losses": losses,
        "breakeven": breakeven,
    }


def _compute_leverage_stats(trades: list[dict]) -> dict[str, Any]:
    """Leverage metrics across all Futures trades in the window."""
    futures_levs = [
        t["leverage"] for t in trades
        if t.get("account_type") == "futures" and t.get("leverage", 1) > 1
    ]
    if not futures_levs:
        return {
            "average": Decimal("0"),
            "median": Decimal("0"),
            "max_used": 0,
            "std_dev": Decimal("0"),
            "over_20x_pct": Decimal("0"),
        }

    avg = Decimal(str(statistics.mean(futures_levs))).quantize(Decimal("0.01"))
    med = Decimal(str(statistics.median(futures_levs))).quantize(Decimal("0.01"))
    mx = max(futures_levs)
    std = Decimal(
        str(statistics.stdev(futures_levs)) if len(futures_levs) > 1 else "0"
    ).quantize(Decimal("0.01"))
    over_20 = sum(1 for l in futures_levs if l > 20)
    over_20_pct = (
        Decimal(str(over_20)) / Decimal(str(len(futures_levs))) * 100
    ).quantize(Decimal("0.01"))

    return {
        "average": avg,
        "median": med,
        "max_used": mx,
        "std_dev": std,
        "over_20x_pct": over_20_pct,
    }


def _compute_additional_metrics(trades: list[dict]) -> dict[str, Any]:
    """Profit factor, Sharpe, avg duration, total volume, net PnL."""
    if not trades:
        return {
            "profit_factor": Decimal("0"),
            "sharpe_ratio": Decimal("0"),
            "avg_trade_duration_seconds": 0,
            "total_volume_usd": Decimal("0"),
            "net_pnl_usd": Decimal("0"),
            "net_pnl_pct": Decimal("0"),
        }

    gross_profit = sum(_to_dec(t.get("realized_pnl_usd")) for t in trades if _to_dec(t.get("realized_pnl_usd")) > 0)
    gross_loss = abs(sum(_to_dec(t.get("realized_pnl_usd")) for t in trades if _to_dec(t.get("realized_pnl_usd")) < 0))
    pf = (gross_profit / gross_loss).quantize(Decimal("0.01")) if gross_loss > 0 else Decimal("0")

    pnls = [float(_to_dec(t.get("realized_pnl_usd"))) for t in trades]
    if len(pnls) > 1 and statistics.stdev(pnls) > 0:
        sharpe = Decimal(str(statistics.mean(pnls) / statistics.stdev(pnls))).quantize(Decimal("0.01"))
    else:
        sharpe = Decimal("0")

    durations = [t.get("duration_seconds", 0) for t in trades]
    avg_dur = int(statistics.mean(durations)) if durations else 0

    total_vol = sum(_to_dec(t.get("notional_value_usd")) for t in trades)
    net_pnl = sum(_to_dec(t.get("realized_pnl_usd")) for t in trades)

    return {
        "profit_factor": pf,
        "sharpe_ratio": sharpe,
        "avg_trade_duration_seconds": avg_dur,
        "total_volume_usd": total_vol.quantize(Decimal("0.01")),
        "net_pnl_usd": net_pnl.quantize(Decimal("0.01")),
        "net_pnl_pct": Decimal("0"),   # would need starting equity
    }


def _compute_exchange_breakdown(trades: list[dict]) -> list[dict[str, Any]]:
    """Per-exchange aggregate metrics for the ``by_exchange`` array."""
    by_ex: dict[str, list[dict]] = defaultdict(list)
    for t in trades:
        by_ex[t.get("exchange_id", "unknown")].append(t)

    result = []
    for eid, ex_trades in by_ex.items():
        wins = sum(1 for t in ex_trades if t.get("is_win"))
        total = len(ex_trades)
        wr = (Decimal(str(wins)) / Decimal(str(total)) * 100).quantize(Decimal("0.01")) if total > 0 else Decimal("0")
        levs = [t["leverage"] for t in ex_trades if t.get("leverage", 1) > 1]
        avg_l = Decimal(str(statistics.mean(levs))).quantize(Decimal("0.01")) if levs else Decimal("0")
        net = sum(_to_dec(t.get("realized_pnl_usd")) for t in ex_trades).quantize(Decimal("0.01"))
        result.append({
            "exchange_id": eid,
            "trade_count": total,
            "win_rate_pct": net if False else wr,  # wr
            "avg_leverage": avg_l,
            "net_pnl_usd": net,
        })
    return result


# ═════════════════════════════════════════════════════════════════════════
#  BEHAVIORAL RULE EVALUATORS  (PRD §6.2.2  RQ-001 … RQ-005)
# ═════════════════════════════════════════════════════════════════════════

class _RuleResult:
    """Container for a single rule evaluation outcome."""
    __slots__ = (
        "rule_id", "rule_name", "severity", "triggered",
        "title", "message", "recommendation",
        "trigger_context", "related_trade_ids",
    )

    def __init__(self, rule_id: str, rule_name: str, severity: str):
        self.rule_id = rule_id
        self.rule_name = rule_name
        self.severity = severity
        self.triggered = False
        self.title = ""
        self.message = ""
        self.recommendation = ""
        self.trigger_context: dict[str, Any] = {}
        self.related_trade_ids: list[ObjectId] = []


def _eval_rq001_revenge_trading(trades: list[dict]) -> list[_RuleResult]:
    """
    RQ-001  Revenge Trading
    Trigger: Loss > 5 % equity AND new position opened within 10 min
             with leverage >= 15×.
    """
    results: list[_RuleResult] = []
    if len(trades) < 2:
        return results

    sorted_by_close = sorted(trades, key=lambda t: t["closed_at"])

    for i, loss_trade in enumerate(sorted_by_close):
        pnl_pct = abs(_to_dec(loss_trade.get("realized_pnl_pct")))
        if _to_dec(loss_trade.get("realized_pnl_usd")) >= 0:
            continue
        if pnl_pct < REVENGE_LOSS_PCT_THRESHOLD:
            continue

        loss_close_time = loss_trade["closed_at"]
        cutoff = loss_close_time + timedelta(minutes=REVENGE_WINDOW_MINUTES)

        # Look at trades opened after this loss
        for following in sorted_by_close[i + 1:]:
            opened = following.get("opened_at", following["closed_at"])
            if opened > cutoff:
                break
            if following.get("leverage", 1) >= REVENGE_MIN_LEVERAGE:
                r = _RuleResult("RQ-001", "Revenge Trading", "warning")
                r.triggered = True
                loss_usd = _to_dec(loss_trade.get("realized_pnl_usd"))
                mins = int((opened - loss_close_time).total_seconds() / 60)
                r.title = "Revenge Trading Detected"
                r.message = (
                    f"You opened a {following['leverage']}x "
                    f"{following.get('symbol', '?')} "
                    f"{following.get('side', 'long')} position {mins} minutes "
                    f"after a ${abs(loss_usd):.2f} loss. "
                    f"Consider stepping away."
                )
                r.recommendation = (
                    "Step away for at least 30 minutes. "
                    "Review your trade plan before re-entering."
                )
                r.trigger_context = {
                    "rule_id": "RQ-001",
                    "loss_trade_id": loss_trade.get("_id"),
                    "loss_amount_usd": Decimal128(str(loss_usd)),
                    "loss_pct_equity": Decimal128(str(pnl_pct)),
                    "trigger_trade_id": following.get("_id"),
                    "trigger_leverage": following["leverage"],
                    "trigger_symbol": following.get("symbol"),
                    "minutes_since_loss": mins,
                    "threshold_minutes": REVENGE_WINDOW_MINUTES,
                    "exchange_id": following.get("exchange_id"),
                }
                r.related_trade_ids = [
                    loss_trade["_id"], following["_id"],
                ]
                results.append(r)
                break  # one alert per loss event

    return results


def _eval_rq002_overtrading(trades: list[dict]) -> list[_RuleResult]:
    """
    RQ-002  Overtrading
    Trigger: > 10 trades opened within a 60-minute window.
    """
    results: list[_RuleResult] = []
    if len(trades) <= OVERTRADING_COUNT:
        return results

    sorted_by_open = sorted(trades, key=lambda t: t.get("opened_at", t["closed_at"]))

    # Sliding window
    for i in range(len(sorted_by_open)):
        window_start = sorted_by_open[i].get("opened_at", sorted_by_open[i]["closed_at"])
        window_end = window_start + timedelta(minutes=OVERTRADING_WINDOW_MINUTES)
        count = 0
        for j in range(i, len(sorted_by_open)):
            t_open = sorted_by_open[j].get("opened_at", sorted_by_open[j]["closed_at"])
            if t_open <= window_end:
                count += 1
            else:
                break

        if count > OVERTRADING_COUNT:
            r = _RuleResult("RQ-002", "Overtrading", "notice")
            r.triggered = True
            r.title = "Overtrading Pattern Detected"
            r.message = (
                f"{count} trades opened within a 60-minute window. "
                f"High-frequency position opening may indicate emotional trading. "
                f"Review your trade log."
            )
            r.recommendation = (
                "Reduce trade frequency. Set a cooldown period between entries."
            )
            r.trigger_context = {
                "rule_id": "RQ-002",
                "trade_count_in_window": count,
                "window_minutes": OVERTRADING_WINDOW_MINUTES,
            }
            results.append(r)
            break  # one alert is enough

    return results


def _eval_rq003_excessive_leverage(trades: list[dict]) -> list[_RuleResult]:
    """
    RQ-003  Excessive Leverage
    Trigger: Any single position opened with leverage > 50×.
    """
    results: list[_RuleResult] = []
    for t in trades:
        lev = t.get("leverage", 1)
        if lev > EXCESSIVE_LEVERAGE_THRESHOLD:
            r = _RuleResult("RQ-003", "Excessive Leverage", "critical")
            r.triggered = True
            r.title = "Extreme Leverage Detected"
            r.message = (
                f"A {t.get('symbol', '?')} position using {lev}x leverage "
                f"creates severe liquidation risk."
            )
            r.recommendation = (
                "Reduce leverage to a safer level. "
                "Consider max 20x for volatile assets."
            )
            r.trigger_context = {
                "rule_id": "RQ-003",
                "detected_leverage": lev,
                "trigger_symbol": t.get("symbol"),
                "exchange_id": t.get("exchange_id"),
            }
            r.related_trade_ids = [t["_id"]]
            results.append(r)
            break  # one per cycle

    return results


def _eval_rq004_max_drawdown(dd_pct: Decimal) -> Optional[_RuleResult]:
    """
    RQ-004  Max Drawdown Breach
    Trigger: Portfolio drawdown from peak exceeds 20 %.
    """
    if dd_pct > MAX_DRAWDOWN_BREACH_PCT:
        r = _RuleResult("RQ-004", "Max Drawdown Breach", "warning")
        r.triggered = True
        r.title = "Maximum Drawdown Threshold Breached"
        r.message = (
            f"Your portfolio has declined {dd_pct:.2f}% from its recent peak. "
            f"Review position sizing."
        )
        r.recommendation = (
            "Reduce position sizes and avoid adding new positions "
            "until the drawdown recovers."
        )
        r.trigger_context = {
            "rule_id": "RQ-004",
            "drawdown_pct": Decimal128(str(dd_pct)),
            "drawdown_threshold_pct": Decimal128(str(MAX_DRAWDOWN_BREACH_PCT)),
        }
        return r
    return None


def _eval_rq005_concentration(trades: list[dict]) -> Optional[_RuleResult]:
    """
    RQ-005  Concentration Risk
    Trigger: Single asset constitutes > 60 % of total portfolio value
    (approximated from notional values of recent trades).
    """
    if not trades:
        return None

    by_asset: dict[str, Decimal] = defaultdict(Decimal)
    for t in trades:
        asset = t.get("base_asset", t.get("symbol", "?"))
        notional = abs(_to_dec(t.get("notional_value_usd")))
        by_asset[asset] += notional

    total = sum(by_asset.values())
    if total == 0:
        return None

    for asset, value in by_asset.items():
        pct = (value / total) * 100
        if pct > CONCENTRATION_RISK_PCT:
            r = _RuleResult("RQ-005", "Concentration Risk", "caution")
            r.triggered = True
            r.title = "High Portfolio Concentration"
            r.message = (
                f"Over {pct:.0f}% of your portfolio is in {asset}. "
                f"Consider rebalancing."
            )
            r.recommendation = (
                "Diversify across multiple assets to reduce "
                "cascading liquidation risk."
            )
            r.trigger_context = {
                "rule_id": "RQ-005",
                "concentrated_asset": asset,
                "concentration_pct": Decimal128(str(pct.quantize(Decimal("0.01")))),
            }
            return r
    return None


# ═════════════════════════════════════════════════════════════════════════
#  DISCIPLINE SCORE  (PRD §6.2.3)
# ═════════════════════════════════════════════════════════════════════════

def _compute_discipline_score(
    trades: list[dict],
    triggered_rules: list[_RuleResult],
    dd_pct: Decimal,
    leverage_stats: dict,
) -> dict[str, Any]:
    """
    Trading Discipline Score (0–100).

    Component weights (PRD §6.2.3):
        Leverage Control        30 %
        Drawdown Management     30 %
        Trade Frequency         20 %
        Loss Recovery Behavior  20 %

    Each component starts at 100 and is decremented by violations.
    """
    rule_ids = {r.rule_id for r in triggered_rules if r.triggered}

    # ── Leverage Consistency (30 %) ────────────────────────────────────
    lev_score = 100
    avg_lev = float(_to_dec(leverage_stats.get("average", 0)))
    if avg_lev > 30:
        lev_score -= 40
    elif avg_lev > 20:
        lev_score -= 25
    elif avg_lev > 10:
        lev_score -= 10
    if "RQ-003" in rule_ids:
        lev_score -= 30
    lev_score = max(0, lev_score)

    # ── Drawdown Control (30 %) ───────────────────────────────────────
    dd_score = 100
    if dd_pct > 30:
        dd_score -= 50
    elif dd_pct > 20:
        dd_score -= 30
    elif dd_pct > 10:
        dd_score -= 15
    if "RQ-004" in rule_ids:
        dd_score -= 20
    dd_score = max(0, dd_score)

    # ── Trade Frequency (20 %) ────────────────────────────────────────
    freq_score = 100
    if "RQ-002" in rule_ids:
        freq_score -= 40
    # Penalise high trade count relative to window
    if len(trades) > 200:
        freq_score -= 20
    elif len(trades) > 100:
        freq_score -= 10
    freq_score = max(0, freq_score)

    # ── Post-Loss Behavior (20 %) ─────────────────────────────────────
    loss_score = 100
    revenge_count = sum(1 for r in triggered_rules if r.rule_id == "RQ-001" and r.triggered)
    if revenge_count >= 3:
        loss_score -= 50
    elif revenge_count >= 1:
        loss_score -= 25
    loss_score = max(0, loss_score)

    # ── Win-rate consistency (information, not weighted separately) ────
    wr_score = 100  # no penalty unless unusual patterns emerge

    # ── Weighted total ────────────────────────────────────────────────
    total = int(
        lev_score * 0.30
        + dd_score * 0.30
        + freq_score * 0.20
        + loss_score * 0.20
    )
    total = min(100, max(0, total))

    return {
        "total": total,
        "components": {
            "leverage_consistency": lev_score,
            "trade_frequency": freq_score,
            "post_loss_behavior": loss_score,
            "win_rate_consistency": wr_score,
            "drawdown_control": dd_score,
        },
        "grade": _grade(total),
    }


# ═════════════════════════════════════════════════════════════════════════
#  ALERT PERSISTENCE  (with rate-limit guard)
# ═════════════════════════════════════════════════════════════════════════

async def _is_rate_limited(
    user_id: ObjectId,
    rule_id: str,
) -> bool:
    """
    Check if an alert for this rule+user was already fired within the
    last 30-min window.  DB Schema §4.4.
    """
    db = get_database()
    key = f"{rule_id}::user_{user_id}::"
    cutoff = datetime.now(tz=timezone.utc) - timedelta(minutes=RATE_LIMIT_WINDOW_MINUTES)

    existing = await db.alerts_log.find_one(
        {"rate_limit_key": key, "triggered_at": {"$gte": cutoff}},
        hint="idx_rate_limit_key",
    )
    return existing is not None


async def _persist_alert(
    user_id: ObjectId,
    rule: _RuleResult,
) -> Optional[ObjectId]:
    """Insert an alert document, respecting the rate-limit guard."""
    if await _is_rate_limited(user_id, rule.rule_id):
        logger.debug(
            "Alert %s suppressed for user %s (rate-limited)", rule.rule_id, user_id
        )
        return None

    now = datetime.now(tz=timezone.utc)
    rate_key = f"{rule.rule_id}::user_{user_id}::"

    doc = {
        "user_id": user_id,
        "rule_id": rule.rule_id,
        "rule_name": rule.rule_name,
        "rule_version": "1.0",
        "severity": rule.severity,
        "category": "behavioral",
        "title": rule.title,
        "message": rule.message,
        "recommendation": rule.recommendation,
        "trigger_context": rule.trigger_context,
        "related_trade_ids": rule.related_trade_ids,
        "delivery": {
            "websocket_sent": False,
            "websocket_sent_at": None,
            "email_sent": False,
            "email_sent_at": None,
        },
        "is_read": False,
        "read_at": None,
        "is_dismissed": False,
        "dismissed_at": None,
        "rate_limit_key": rate_key,
        "rate_limit_window_start": now,
        "triggered_at": now,
        "created_at": now,
        "expires_at": now + timedelta(days=30),
        "schema_version": 1,
    }

    db = get_database()
    result = await db.alerts_log.insert_one(doc)
    logger.info("Alert %s persisted for user %s (id=%s)", rule.rule_id, user_id, result.inserted_id)
    return result.inserted_id


# ═════════════════════════════════════════════════════════════════════════
#  METRICS SNAPSHOT PERSISTENCE
# ═════════════════════════════════════════════════════════════════════════

async def _persist_metrics_snapshot(
    user_id: ObjectId,
    trades: list[dict],
    drawdown: dict,
    win_rate: dict,
    leverage_stats: dict,
    discipline: dict,
    additional: dict,
    exchange_breakdown: list[dict],
    triggered_rules: list[_RuleResult],
    prev_score: Optional[int],
    elapsed_ms: int,
) -> ObjectId:
    """
    Insert an append-only risk_metrics snapshot.  DB Schema §3.4.
    """
    now = datetime.now(tz=timezone.utc)
    cycle_id = f"sync_{now.strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:4]}"

    # Determine trend
    trend = "stable"
    if prev_score is not None:
        if discipline["total"] > prev_score:
            trend = "improving"
        elif discipline["total"] < prev_score:
            trend = "declining"

    active_flags = [r.rule_id for r in triggered_rules if r.triggered]

    doc = {
        "user_id": user_id,
        "calculated_at": now,
        "sync_cycle_id": cycle_id,
        "window_days": 30,
        "trade_count": len(trades),
        "max_drawdown": {
            "value_pct": Decimal128(str(drawdown["value_pct"])),
            "value_usd": Decimal128(str(drawdown["value_usd"])),
            "peak_equity_usd": Decimal128(str(drawdown["peak_equity_usd"])),
            "trough_equity_usd": Decimal128(str(drawdown["trough_equity_usd"])),
            "peak_at": drawdown["peak_at"],
            "trough_at": drawdown["trough_at"],
        },
        "discipline_score": {
            "total": discipline["total"],
            "components": discipline["components"],
            "grade": discipline["grade"],
            "trend": trend,
        },
        "win_rate": {
            "value_pct": Decimal128(str(win_rate["value_pct"])),
            "wins": win_rate["wins"],
            "losses": win_rate["losses"],
            "breakeven": win_rate["breakeven"],
        },
        "leverage": {
            "average": Decimal128(str(leverage_stats["average"])),
            "median": Decimal128(str(leverage_stats["median"])),
            "max_used": leverage_stats["max_used"],
            "std_dev": Decimal128(str(leverage_stats["std_dev"])),
            "over_20x_pct": Decimal128(str(leverage_stats["over_20x_pct"])),
        },
        "profit_factor": Decimal128(str(additional["profit_factor"])),
        "sharpe_ratio": Decimal128(str(additional["sharpe_ratio"])),
        "avg_trade_duration_seconds": additional["avg_trade_duration_seconds"],
        "total_volume_usd": Decimal128(str(additional["total_volume_usd"])),
        "net_pnl_usd": Decimal128(str(additional["net_pnl_usd"])),
        "net_pnl_pct": Decimal128(str(additional["net_pnl_pct"])),
        "by_exchange": [
            {
                "exchange_id": ex["exchange_id"],
                "trade_count": ex["trade_count"],
                "win_rate_pct": Decimal128(str(ex["win_rate_pct"])),
                "avg_leverage": Decimal128(str(ex["avg_leverage"])),
                "net_pnl_usd": Decimal128(str(ex["net_pnl_usd"])),
            }
            for ex in exchange_breakdown
        ],
        "active_rule_flags": active_flags,
        "sbt_payload_hash": None,
        "sbt_ready": len(trades) >= 10,   # require ≥ 10 trades for SBT readiness
        "schema_version": 1,
        "calculation_duration_ms": elapsed_ms,
    }

    db = get_database()
    result = await db.risk_metrics.insert_one(doc)
    logger.info(
        "risk_metrics snapshot persisted for user %s (id=%s, %d trades, score=%d)",
        user_id, result.inserted_id, len(trades), discipline["total"],
    )
    return result.inserted_id


# ═════════════════════════════════════════════════════════════════════════
#  PUBLIC ENTRY POINT
# ═════════════════════════════════════════════════════════════════════════

async def run_quant_engine(user_id: str | ObjectId) -> dict[str, Any]:
    """
    Execute the full Behavioral Quant Engine pipeline for one user.

    Returns a summary dict with all computed metrics, triggered rules,
    and persistence IDs.
    """
    if isinstance(user_id, str):
        user_id = ObjectId(user_id)

    start = time.monotonic()
    logger.info("Quant Engine started for user %s", user_id)

    # 1 ── Fetch trade data ───────────────────────────────────────────
    trades = await _fetch_trades(user_id, window_days=30)
    prev_score = await _fetch_previous_score(user_id)

    if not trades:
        logger.info("No trades in 30-day window for user %s — skipping", user_id)
        return {
            "status": "no_data",
            "trade_count": 0,
            "message": "No trades found in the 30-day window.",
        }

    # 2 ── Compute metrics ────────────────────────────────────────────
    drawdown = _compute_max_drawdown(trades)
    win_rate = _compute_win_rate(trades)
    leverage_stats = _compute_leverage_stats(trades)
    additional = _compute_additional_metrics(trades)
    exchange_breakdown = _compute_exchange_breakdown(trades)

    # 3 ── Evaluate behavioral rules ──────────────────────────────────
    triggered: list[_RuleResult] = []
    triggered.extend(_eval_rq001_revenge_trading(trades))
    triggered.extend(_eval_rq002_overtrading(trades))
    triggered.extend(_eval_rq003_excessive_leverage(trades))

    dd_result = _eval_rq004_max_drawdown(drawdown["value_pct"])
    if dd_result:
        triggered.append(dd_result)

    conc_result = _eval_rq005_concentration(trades)
    if conc_result:
        triggered.append(conc_result)

    # 4 ── Compute discipline score ───────────────────────────────────
    discipline = _compute_discipline_score(
        trades, triggered, drawdown["value_pct"], leverage_stats
    )

    elapsed_ms = int((time.monotonic() - start) * 1000)

    # 5 ── Persist risk_metrics snapshot ───────────────────────────────
    snapshot_id = await _persist_metrics_snapshot(
        user_id, trades, drawdown, win_rate, leverage_stats,
        discipline, additional, exchange_breakdown,
        triggered, prev_score, elapsed_ms,
    )

    # 6 ── Persist alerts (with rate-limit guard) ─────────────────────
    alert_ids: list[str] = []
    for rule in triggered:
        if rule.triggered:
            aid = await _persist_alert(user_id, rule)
            if aid:
                alert_ids.append(str(aid))

    elapsed_total = int((time.monotonic() - start) * 1000)
    logger.info(
        "Quant Engine completed for user %s in %dms — "
        "%d trades, score=%d, %d rules triggered, %d alerts persisted",
        user_id, elapsed_total, len(trades), discipline["total"],
        len([r for r in triggered if r.triggered]), len(alert_ids),
    )

    return {
        "status": "ok",
        "user_id": str(user_id),
        "trade_count": len(trades),
        "metrics": {
            "max_drawdown_pct": str(drawdown["value_pct"]),
            "win_rate_pct": str(win_rate["value_pct"]),
            "wins": win_rate["wins"],
            "losses": win_rate["losses"],
            "avg_leverage": str(leverage_stats["average"]),
            "discipline_score": discipline["total"],
            "discipline_grade": discipline["grade"],
            "profit_factor": str(additional["profit_factor"]),
            "net_pnl_usd": str(additional["net_pnl_usd"]),
        },
        "rules_triggered": [
            {"rule_id": r.rule_id, "title": r.title, "severity": r.severity}
            for r in triggered if r.triggered
        ],
        "snapshot_id": str(snapshot_id),
        "alert_ids": alert_ids,
        "elapsed_ms": elapsed_total,
    }
