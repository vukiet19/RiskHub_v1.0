"""
RiskHub — ``users`` Collection Model
=====================================
Schema reference:  Database Architecture Document v1.0  §1.2

Design notes:
* Financial values use ``Decimal`` (mapped to Decimal128 by Motor/PyMongo).
* ``exchange_keys`` is an embedded array — bounded by 2-5 entries per user.
* ``api_key_encrypted`` / ``api_secret_encrypted`` are stored in the
  AES-256-GCM envelope format ``enc::<iv>::<tag>::<ciphertext>``.
* ``wallet`` and ``sbt`` are 1:1 embedded sub-documents.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, EmailStr

from .base import MongoBaseDocument, PyObjectId


# ── Enums ────────────────────────────────────────────────────────────────

class SBTStatus(str, Enum):
    NONE = "none"
    PENDING = "pending"
    MINTED = "minted"
    ERROR = "error"


class SBTNetwork(str, Enum):
    BNB_TESTNET = "bnb_testnet"
    SEPOLIA = "sepolia"
    BNB_MAINNET = "bnb_mainnet"
    MAINNET = "mainnet"


class SyncStatus(str, Enum):
    OK = "ok"
    ERROR = "error"
    RATE_LIMITED = "rate_limited"


class ExchangeEnvironment(str, Enum):
    TESTNET = "testnet"
    MAINNET = "mainnet"
    DEMO = "demo"


class ExchangeMarketType(str, Enum):
    FUTURES = "futures"
    SPOT = "spot"
    MIXED = "mixed"


class AlertChannel(str, Enum):
    WEBSOCKET = "websocket"
    EMAIL = "email"


# ── Sub-documents ────────────────────────────────────────────────────────

class WalletSubdocument(BaseModel):
    """Web3 wallet identity — sparse-unique indexed on ``address``."""
    address: Optional[str] = None       # lowercase hex, e.g. "0xabcd…"
    chain_id: Optional[int] = None      # 56 = BNB Chain, 1 = Ethereum
    linked_at: Optional[datetime] = None
    siwe_nonce: Optional[str] = None
    siwe_nonce_expires_at: Optional[datetime] = None


class SBTSubdocument(BaseModel):
    """Soulbound Token minting state — 1:1 embedded in user doc."""
    status: SBTStatus = SBTStatus.NONE
    token_id: Optional[str] = None
    contract_address: Optional[str] = None
    network: Optional[SBTNetwork] = None
    tx_hash: Optional[str] = None
    minted_at: Optional[datetime] = None
    last_updated_at: Optional[datetime] = None
    metrics_snapshot_id: Optional[PyObjectId] = None   # Ref → risk_metrics._id
    oracle_signature: Optional[str] = None


class ExchangeKeySubdocument(BaseModel):
    """
    A single exchange API credential set — encrypted at application layer.

    SECURITY:  ``api_key_encrypted``, ``api_secret_encrypted``, and
    ``passphrase_encrypted`` are **never** stored in plaintext.
    Format:  ``enc::<base64_iv>::<base64_tag>::<base64_ciphertext>``
    """
    exchange_id: str                  # CCXT exchange identifier ("binance", "okx")
    label: str                        # User-defined label
    environment: ExchangeEnvironment = ExchangeEnvironment.MAINNET
    market_type: ExchangeMarketType = ExchangeMarketType.MIXED
    api_key_encrypted: str            # [AES-256-GCM ENCRYPTED]
    api_secret_encrypted: str         # [AES-256-GCM ENCRYPTED]
    passphrase_encrypted: Optional[str] = None  # OKX / Gate.io only
    permissions_verified: list[str] = Field(default_factory=lambda: ["read"])
    is_active: bool = True
    last_sync_at: Optional[datetime] = None
    last_sync_status: SyncStatus = SyncStatus.OK
    last_sync_error: Optional[str] = None
    added_at: datetime = Field(default_factory=datetime.utcnow)


class UserPreferences(BaseModel):
    """User-configurable dashboard & notification preferences."""
    alerts_enabled: bool = True
    alert_channels: list[AlertChannel] = Field(
        default_factory=lambda: [AlertChannel.WEBSOCKET]
    )
    timezone: str = "UTC"
    currency_display: str = "USD"


# ── Root document ────────────────────────────────────────────────────────

class UserDocument(MongoBaseDocument):
    """
    Root Pydantic model for the ``users`` MongoDB collection.

    All other collections reference ``users._id`` as their primary
    partition key.
    """

    # Identity
    email: EmailStr
    password_hash: str
    username: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_login_at: Optional[datetime] = None
    is_active: bool = True
    email_verified: bool = False
    email_verified_at: Optional[datetime] = None

    # Web3 Identity
    wallet: Optional[WalletSubdocument] = None

    # Soulbound Token
    sbt: SBTSubdocument = Field(default_factory=SBTSubdocument)

    # Exchange API Keys (encrypted at application layer)
    exchange_keys: list[ExchangeKeySubdocument] = Field(default_factory=list)

    # Auth Tokens
    refresh_token_hash: Optional[str] = None
    refresh_token_expires_at: Optional[datetime] = None

    # Preferences
    preferences: UserPreferences = Field(default_factory=UserPreferences)

    # Schema versioning
    schema_version: int = 1
