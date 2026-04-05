"""
RiskHub — Pydantic Models Package
==================================
Maps the 4 core MongoDB collections defined in the Database Architecture
Document v1.0 to strict Pydantic v2 models.

Collections
-----------
* ``users``         — Identity, credentials, exchange keys, SBT status
* ``trade_history`` — Every closed trade from all connected exchanges
* ``risk_metrics``  — Point-in-time Quant Engine output snapshots
* ``alerts_log``    — Behavioral alert events produced by the rules engine
"""

from .user import (
    UserDocument,
    WalletSubdocument,
    SBTSubdocument,
    ExchangeKeySubdocument,
    UserPreferences,
)
from .trade_history import TradeHistoryDocument, RawExchangeData
from .risk_metrics import (
    RiskMetricsDocument,
    MaxDrawdownSubdocument,
    DisciplineScoreSubdocument,
    DisciplineComponents,
    WinRateSubdocument,
    LeverageSubdocument,
    ExchangeBreakdown,
)
from .alerts_log import (
    AlertsLogDocument,
    TriggerContext,
    DeliveryStatus,
)

__all__ = [
    # users
    "UserDocument",
    "WalletSubdocument",
    "SBTSubdocument",
    "ExchangeKeySubdocument",
    "UserPreferences",
    # trade_history
    "TradeHistoryDocument",
    "RawExchangeData",
    # risk_metrics
    "RiskMetricsDocument",
    "MaxDrawdownSubdocument",
    "DisciplineScoreSubdocument",
    "DisciplineComponents",
    "WinRateSubdocument",
    "LeverageSubdocument",
    "ExchangeBreakdown",
    # alerts_log
    "AlertsLogDocument",
    "TriggerContext",
    "DeliveryStatus",
]
