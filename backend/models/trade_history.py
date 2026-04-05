"""
RiskHub — ``trade_history`` Collection Model
=============================================
Schema reference:  Database Architecture Document v1.0  §2.2

Design notes:
* This is the most write-intensive collection (60-second sync cycle).
* All monetary fields use ``DecimalStr`` → Decimal128 in MongoDB to
  avoid IEEE 754 rounding corruption across thousands of trades.
* ``is_win`` and ``pnl_category`` are denormalised for index-covered
  queries used by the consecutive-loss-streak rule.
* ``exchange_trade_id`` is part of the dedup compound unique index.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field

from .base import MongoBaseDocument, PyObjectId, DecimalStr


# ── Enums ────────────────────────────────────────────────────────────────

class AccountType(str, Enum):
    SPOT = "spot"
    FUTURES = "futures"


class TradeSide(str, Enum):
    LONG = "long"
    SHORT = "short"


class PositionSide(str, Enum):
    LONG = "long"
    SHORT = "short"
    BOTH = "both"       # hedge-mode


class PnlCategory(str, Enum):
    WIN = "win"
    LOSS = "loss"
    BREAKEVEN = "breakeven"


# ── Sub-documents ────────────────────────────────────────────────────────

class RawExchangeData(BaseModel):
    """
    Original CCXT response payload — embedded for auditability.
    The ``info`` dict preserves the exchange-specific raw JSON untouched.
    """
    ccxt_trade_id: Optional[str] = None
    ccxt_symbol: Optional[str] = None
    original_side: Optional[str] = None     # exchange-native side before normalisation
    info: dict[str, Any] = Field(default_factory=dict)


# ── Root document ────────────────────────────────────────────────────────

class TradeHistoryDocument(MongoBaseDocument):
    """
    Root Pydantic model for the ``trade_history`` MongoDB collection.

    Every closed trade fetched from every connected exchange for a user
    is represented as one document.  This collection is the primary input
    to the Behavioral Quant Engine.
    """

    # Partition keys (critical for index performance)
    user_id: PyObjectId
    exchange_id: str                    # CCXT id, e.g. "binance", "okx"
    account_type: AccountType

    # Exchange-native identifiers
    exchange_trade_id: str              # unique per exchange — dedup index field
    exchange_order_id: Optional[str] = None

    # Instrument & Position
    symbol: str                         # CCXT unified symbol, e.g. "BTCUSDT"
    base_asset: str                     # e.g. "BTC"
    quote_asset: str                    # e.g. "USDT"
    side: TradeSide
    position_side: PositionSide = PositionSide.BOTH

    # Execution Metrics (Core Quant Engine Inputs)
    leverage: int = 1                   # 1 = spot / no leverage
    entry_price: DecimalStr
    exit_price: DecimalStr
    quantity: DecimalStr
    notional_value_usd: DecimalStr      # quantity × exit_price
    margin_used_usd: DecimalStr         # notional / leverage

    # PnL
    realized_pnl_usd: DecimalStr        # net PnL after fees
    realized_pnl_pct: DecimalStr        # PnL as % of margin
    gross_pnl_usd: DecimalStr           # before fees
    fee_usd: DecimalStr                 # total commission paid
    funding_fee_usd: DecimalStr = Field(default="0")  # futures funding payments

    # Outcome (Denormalised for query performance)
    is_win: bool                        # realized_pnl_usd > 0
    pnl_category: PnlCategory

    # Timestamps (CRITICAL for time-series queries)
    opened_at: datetime
    closed_at: datetime
    duration_seconds: int               # derived: closed_at − opened_at

    # Raw Exchange Response (auditability)
    raw_exchange_data: Optional[RawExchangeData] = None

    # Metadata
    synced_at: datetime = Field(default_factory=datetime.utcnow)
    schema_version: int = 1
