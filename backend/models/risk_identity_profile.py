"""
RiskHub — ``risk_identity_profiles`` Collection Model
=====================================================
Stores versioned, user-saved identity-ready risk profile snapshots.

Each save creates a new immutable profile version so the frontend can:
* reopen the latest saved profile
* compare saved vs latest live snapshot
* preserve profile continuity for demo identity issuance
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from .base import MongoBaseDocument, PyObjectId


class EligibilitySnapshot(BaseModel):
    """Persisted eligibility snapshot attached to a saved risk profile."""

    status: Literal["eligible", "ineligible"] = "ineligible"
    reason: str = "Eligibility was not evaluated."
    preview_allowed: bool = False
    met: list[str] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    blockers: list[str] = Field(default_factory=list)


class LeverageSnapshot(BaseModel):
    """Compact leverage view used by saved identity profiles."""

    average: Optional[float] = None
    maximum: Optional[float] = None


class RiskIdentityProfileDocument(MongoBaseDocument):
    """
    Root Pydantic model for the ``risk_identity_profiles`` MongoDB collection.

    A new document is inserted per save, with monotonic version per user.
    """

    profile_id: str
    user_id: PyObjectId
    wallet_address: Optional[str] = None
    saved_at: datetime = Field(default_factory=datetime.utcnow)
    version: int = 1

    source_snapshot_at: Optional[datetime] = None
    identity_tier: str = "Pending"
    risk_level: str = "Unrated"
    discipline_score: Optional[float] = None
    discipline_grade: str = "Unrated"
    total_risk_score: Optional[float] = None
    max_drawdown_pct: Optional[float] = None
    leverage: LeverageSnapshot = Field(default_factory=LeverageSnapshot)
    contagion_score: Optional[float] = None
    top_asset: Optional[str] = None
    top_asset_concentration_pct: Optional[float] = None
    active_exchanges: int = 0
    configured_exchanges: int = 0
    trade_activity_count: int = 0
    position_count: int = 0
    behavior_flags_summary: list[str] = Field(default_factory=list)

    source_state: str = "unknown"
    profile_status: str = "partial"
    warnings: list[str] = Field(default_factory=list)
    profile_hash: str
    eligibility: EligibilitySnapshot = Field(default_factory=EligibilitySnapshot)
    metadata: dict[str, Any] = Field(default_factory=dict)

    schema_version: int = 1
