"""
RiskHub — ``risk_metrics`` Collection Model
============================================
Schema reference:  Database Architecture Document v1.0  §3.2

Design notes:
* Append-only time-series — every sync cycle creates a new document;
  no in-place updates.
* ``discipline_score.components`` holds the 5 weighted sub-scores
  (Leverage 30%, Drawdown 30%, Frequency 20%, Post-Loss 20%).
* ``by_exchange`` is an embedded denormalised array (bounded 2-5 items).
* ``sbt_payload_hash`` and ``sbt_ready`` support the Oracle signing
  critical path without re-computation.
* 1-year TTL index auto-purges old snapshots.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from .base import MongoBaseDocument, PyObjectId, DecimalStr


# ── Enums ────────────────────────────────────────────────────────────────

class DisciplineTrend(str, Enum):
    IMPROVING = "improving"
    DECLINING = "declining"
    STABLE = "stable"


# ── Sub-documents ────────────────────────────────────────────────────────

class MaxDrawdownSubdocument(BaseModel):
    """Peak-to-trough drawdown metrics."""
    value_pct: DecimalStr               # peak-to-trough % drop
    value_usd: DecimalStr               # absolute USD drawdown
    peak_equity_usd: DecimalStr
    trough_equity_usd: DecimalStr
    peak_at: Optional[datetime] = None
    trough_at: Optional[datetime] = None


class DisciplineComponents(BaseModel):
    """Weighted sub-scores that compose the Trading Discipline Score."""
    leverage_consistency: int = 0       # 0-100  (weight: 30%)
    trade_frequency: int = 0            # 0-100  (weight: 20%)
    post_loss_behavior: int = 0         # 0-100  (weight: 20%)
    win_rate_consistency: int = 0       # 0-100
    drawdown_control: int = 0           # 0-100  (weight: 30%)


class DisciplineScoreSubdocument(BaseModel):
    """
    Trading Discipline Score (0–100).
    Grade mapping:  A (≥90), B (≥75), C (≥60), D (≥40), F (<40)
    """
    total: int = 0
    components: DisciplineComponents = Field(
        default_factory=DisciplineComponents
    )
    grade: str = "F"                     # derived label: A/B/C/D/F (with ± suffix)
    trend: DisciplineTrend = DisciplineTrend.STABLE


class WinRateSubdocument(BaseModel):
    """Win/loss trade counts and derived percentage."""
    value_pct: DecimalStr = Field(default="0")
    wins: int = 0
    losses: int = 0
    breakeven: int = 0


class LeverageSubdocument(BaseModel):
    """Leverage usage statistics across the calculation window."""
    average: DecimalStr = Field(default="0")
    median: DecimalStr = Field(default="0")
    max_used: int = 0
    std_dev: DecimalStr = Field(default="0")
    over_20x_pct: DecimalStr = Field(default="0")   # % of trades with leverage > 20×


class ExchangeBreakdown(BaseModel):
    """Per-exchange metric summary — denormalised for SBT detail view."""
    exchange_id: str
    trade_count: int = 0
    win_rate_pct: DecimalStr = Field(default="0")
    avg_leverage: DecimalStr = Field(default="0")
    profit_factor: DecimalStr = Field(default="0")
    sharpe_ratio: DecimalStr = Field(default="0")
    net_pnl_usd: DecimalStr = Field(default="0")


# ── Root document ────────────────────────────────────────────────────────

class RiskMetricsDocument(MongoBaseDocument):
    """
    Root Pydantic model for the ``risk_metrics`` MongoDB collection.

    Each document is a point-in-time snapshot produced by the Behavioral
    Quant Engine after every sync cycle.  It is also the source of truth
    for the SBT Oracle payload.
    """

    # Partition key
    user_id: PyObjectId

    # Snapshot timestamp (time-series axis)
    calculated_at: datetime = Field(default_factory=datetime.utcnow)
    sync_cycle_id: Optional[str] = None     # unique per sync run

    # Calculation window
    window_days: int = 30
    trade_count: int = 0

    # Core Risk Metrics (SBT Payload source of truth)
    max_drawdown: MaxDrawdownSubdocument = Field(
        default_factory=lambda: MaxDrawdownSubdocument(
            value_pct="0", value_usd="0",
            peak_equity_usd="0", trough_equity_usd="0",
        )
    )
    discipline_score: DisciplineScoreSubdocument = Field(
        default_factory=DisciplineScoreSubdocument
    )
    win_rate: WinRateSubdocument = Field(
        default_factory=WinRateSubdocument
    )
    leverage: LeverageSubdocument = Field(
        default_factory=LeverageSubdocument
    )

    # Additional Quant Metrics
    profit_factor: DecimalStr = Field(default="0")
    sharpe_ratio: DecimalStr = Field(default="0")
    avg_trade_duration_seconds: int = 0
    total_volume_usd: DecimalStr = Field(default="0")
    net_pnl_usd: DecimalStr = Field(default="0")
    net_pnl_pct: DecimalStr = Field(default="0")

    # Per-Exchange Breakdown (denormalised)
    by_exchange: list[ExchangeBreakdown] = Field(default_factory=list)

    # Active Rule Triggers (snapshot of currently-firing rules)
    active_rule_flags: list[str] = Field(default_factory=list)

    # SBT Payload (pre-signed, ready for Oracle)
    sbt_payload_hash: Optional[str] = None      # keccak256 hash
    sbt_ready: bool = False

    # Metadata
    schema_version: int = 1
    calculation_duration_ms: Optional[int] = None   # engine perf tracking
