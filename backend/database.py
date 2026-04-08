"""
RiskHub — Asynchronous MongoDB Connection Layer
================================================
Uses Motor (async MongoDB driver) with connection pooling configured per
the Database Architecture Document v1.0, Section 6.4.

Pool config:  minPoolSize=5, maxPoolSize=50  (MVP defaults)
"""

import os
import logging
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

load_dotenv()

# ---------------------------------------------------------------------------
# Global handles — initialised on FastAPI startup, torn down on shutdown
# ---------------------------------------------------------------------------
_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


def get_mongo_url() -> str:
    """Read the connection string from env; fall back to localhost for dev."""
    return os.getenv("MONGO_URL", "mongodb://localhost:27017")


def get_database_name() -> str:
    """Read the database name from env; default to 'riskhub'."""
    return os.getenv("MONGO_DB_NAME", "riskhub")


async def connect_to_mongo() -> None:
    """
    Create the Motor client with MVP-tuned pool settings and verify
    connectivity.  Called once from FastAPI's ``startup`` event.
    """
    global _client, _db

    mongo_url = get_mongo_url()
    db_name = get_database_name()

    logger.info("Connecting to MongoDB at %s (db=%s) …", mongo_url, db_name)

    _client = AsyncIOMotorClient(
        mongo_url,
        minPoolSize=5,
        maxPoolSize=50,
        # Sensible timeouts for an async web-backend
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=5000,
    )
    _db = _client[db_name]

    # Quick connectivity check (raises on failure)
    await _client.admin.command("ping")
    logger.info("MongoDB connection established ✓")


async def close_mongo_connection() -> None:
    """Gracefully close the Motor client.  Called from ``shutdown``."""
    global _client, _db
    if _client is not None:
        _client.close()
        _client = None
        _db = None
        logger.info("MongoDB connection closed.")


def get_database() -> AsyncIOMotorDatabase:
    """
    Return the active database handle.
    Raises ``RuntimeError`` if called before ``connect_to_mongo()``.
    """
    if _db is None:
        raise RuntimeError(
            "Database not initialised. "
            "Call connect_to_mongo() during application startup."
        )
    return _db


# ---------------------------------------------------------------------------
# Index bootstrapping — ensures all indexes from the Schema Document exist
# ---------------------------------------------------------------------------
async def ensure_indexes() -> None:
    """
    Idempotently create every index defined in the Database Architecture
    Document v1.0 (Sections 1.3, 2.3, 3.3, 4.3).

    Safe to call on every startup — ``create_index`` is a no-op when the
    index already exists with identical options.
    """
    db = get_database()
    logger.info("Ensuring MongoDB indexes …")

    # ── users ────────────────────────────────────────────────────────────
    users = db.users
    await users.create_index(
        "email", unique=True, name="idx_email_unique"
    )
    await users.create_index(
        "wallet.address",
        unique=True, sparse=True, name="idx_wallet_address_unique",
    )
    await users.create_index(
        "exchange_keys.exchange_id",
        name="idx_exchange_keys_exchange_id",
    )
    await users.create_index(
        [("sbt.status", 1), ("sbt.token_id", 1)],
        sparse=True, name="idx_sbt_status_tokenid",
    )
    await users.create_index(
        "wallet.siwe_nonce_expires_at",
        expireAfterSeconds=0, name="idx_siwe_nonce_ttl",
    )

    # ── trade_history ────────────────────────────────────────────────────
    trades = db.trade_history
    await trades.create_index(
        [("user_id", 1), ("exchange_id", 1), ("closed_at", -1)],
        name="idx_user_exchange_closedat_desc",
    )
    await trades.create_index(
        [("user_id", 1), ("exchange_id", 1), ("exchange_trade_id", 1)],
        unique=True, name="idx_dedup_trade",
    )
    await trades.create_index(
        [("user_id", 1), ("symbol", 1), ("closed_at", -1)],
        name="idx_user_symbol_closedat",
    )
    await trades.create_index(
        [("user_id", 1), ("opened_at", -1)],
        name="idx_user_openedat_desc",
    )
    await trades.create_index(
        [("user_id", 1), ("is_win", 1), ("closed_at", -1)],
        name="idx_user_iswin_closedat",
    )

    # ── risk_metrics ─────────────────────────────────────────────────────
    metrics = db.risk_metrics
    await metrics.create_index(
        [("user_id", 1), ("calculated_at", -1)],
        name="idx_user_calculated_desc",
    )
    await metrics.create_index(
        [
            ("user_id", 1),
            ("calculated_at", -1),
            ("discipline_score.total", 1),
            ("max_drawdown.value_pct", 1),
            ("win_rate.value_pct", 1),
        ],
        name="idx_user_chart_covered",
    )
    await metrics.create_index(
        [("user_id", 1), ("sbt_ready", 1), ("calculated_at", -1)],
        name="idx_sbt_ready_lookup",
    )
    await metrics.create_index(
        "calculated_at",
        expireAfterSeconds=31_536_000,   # 1 year
        name="idx_metrics_ttl_1year",
    )

    # ── alerts_log ───────────────────────────────────────────────────────
    alerts = db.alerts_log
    await alerts.create_index(
        [("user_id", 1), ("triggered_at", -1)],
        name="idx_user_triggered_desc",
    )
    await alerts.create_index(
        [("user_id", 1), ("is_read", 1), ("triggered_at", -1)],
        name="idx_user_isread_triggered",
    )
    await alerts.create_index(
        [("user_id", 1), ("rule_id", 1), ("triggered_at", -1)],
        name="idx_user_ruleid_triggered",
    )
    await alerts.create_index(
        [("user_id", 1), ("severity", 1), ("triggered_at", -1)],
        name="idx_user_severity_triggered",
    )
    await alerts.create_index(
        [("rate_limit_key", 1), ("triggered_at", -1)],
        name="idx_rate_limit_key",
    )
    await alerts.create_index(
        "expires_at",
        expireAfterSeconds=0,
        name="idx_alerts_ttl_30days",
    )

    logger.info("All indexes ensured ✓")
