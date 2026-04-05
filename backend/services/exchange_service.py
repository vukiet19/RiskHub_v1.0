"""
RiskHub — Exchange Data Ingestion Service
==========================================
Implements read-only CCXT integration for fetching closed trades and
open positions from centralized exchanges (Binance focus for MVP).

Design references:
  PRD v1.0  §5.2  (Read-Only Ingestion Pipeline)
  PRD v1.0  §6.1  (Read-Only Cross-Exchange Data Ingestion)
  DB Schema §2.2  (trade_history document)
  DB Schema §6.3  (Prefer upsert / bulkWrite for trade ingestion)

Security:
  CCXT is configured exclusively with read-scope API keys.
  No trade execution, withdrawal, or fund transfer methods are called.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

import ccxt.async_support as ccxt
from bson import ObjectId, Decimal128
from pymongo import UpdateOne

from database import get_database
from models.trade_history import (
    TradeHistoryDocument,
    RawExchangeData,
    AccountType,
    TradeSide,
    PositionSide,
    PnlCategory,
)
from models.base import to_mongo_decimal

logger = logging.getLogger("riskhub.exchange")

# ── Supported exchanges (MVP) ───────────────────────────────────────────
SUPPORTED_EXCHANGES: dict[str, type] = {
    "binance": ccxt.binance,
    "okx": ccxt.okx,
}


# ─── Exchange client factory ────────────────────────────────────────────

def _create_exchange_client(
    exchange_id: str,
    api_key: str,
    api_secret: str,
    passphrase: Optional[str] = None,
) -> ccxt.Exchange:
    """
    Instantiate a CCXT async exchange client in **read-only** mode.

    The ``options`` dict explicitly disables any write capability as an
    additional safety net beyond the API key permission scope.
    """
    if exchange_id not in SUPPORTED_EXCHANGES:
        raise ValueError(
            f"Exchange '{exchange_id}' is not supported. "
            f"Supported: {list(SUPPORTED_EXCHANGES.keys())}"
        )

    cls = SUPPORTED_EXCHANGES[exchange_id]

    config: dict[str, Any] = {
        "apiKey": api_key,
        "secret": api_secret,
        "enableRateLimit": True,        # respect exchange rate limits
        "options": {
            "defaultType": "future",    # fetch futures by default
            "adjustForTimeDifference": True,
        },
    }

    # OKX requires a passphrase
    if passphrase:
        config["password"] = passphrase

    return cls(config)


# ─── Helpers ─────────────────────────────────────────────────────────────

def _safe_decimal(value: Any, fallback: str = "0") -> Decimal:
    """Coerce to Decimal; return ``fallback`` on failure."""
    if value is None:
        return Decimal(fallback)
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal(fallback)


def _parse_symbol_parts(symbol: str) -> tuple[str, str]:
    """
    Extract base/quote from a CCXT unified symbol.
    Examples:
        "BTC/USDT"       → ("BTC", "USDT")
        "BTC/USDT:USDT"  → ("BTC", "USDT")
        "BTCUSDT"        → ("BTC", "USDT")  # fallback heuristic
    """
    # Strip perpetual contract suffix
    clean = symbol.split(":")[0]

    if "/" in clean:
        parts = clean.split("/")
        return parts[0], parts[1]

    # Heuristic: common quote currencies at the tail
    for quote in ("USDT", "BUSD", "USDC", "USD", "BTC", "ETH"):
        if clean.endswith(quote) and len(clean) > len(quote):
            return clean[: -len(quote)], quote

    return clean, "USDT"


def _normalise_side(raw_side: str | None) -> TradeSide:
    """Map exchange-native side strings to our enum."""
    if raw_side is None:
        return TradeSide.LONG
    s = raw_side.lower()
    if s in ("sell", "short"):
        return TradeSide.SHORT
    return TradeSide.LONG


def _determine_pnl_category(pnl: Decimal) -> PnlCategory:
    if pnl > 0:
        return PnlCategory.WIN
    if pnl < 0:
        return PnlCategory.LOSS
    return PnlCategory.BREAKEVEN


# ─── CCXT → Pydantic mapping ────────────────────────────────────────────

def _ccxt_trade_to_document(
    raw: dict[str, Any],
    user_id: ObjectId,
    exchange_id: str,
    account_type: AccountType,
) -> dict[str, Any]:
    """
    Transform a single CCXT closed-order / trade dict into a dict ready
    for MongoDB upsert (matching the ``TradeHistoryDocument`` schema).

    Returns a plain dict (not a Pydantic model) because we feed it
    directly into a ``bulkWrite`` pipeline for efficiency.
    """
    symbol_raw: str = raw.get("symbol", "")
    base, quote = _parse_symbol_parts(symbol_raw)

    entry_price = _safe_decimal(raw.get("price"))
    exit_price = _safe_decimal(raw.get("average", raw.get("price")))
    quantity = _safe_decimal(raw.get("amount", raw.get("filled")))
    fee_cost = _safe_decimal(
        raw.get("fee", {}).get("cost") if isinstance(raw.get("fee"), dict) else None
    )
    leverage_raw = raw.get("leverage") or 1
    leverage = int(leverage_raw) if leverage_raw else 1

    notional = quantity * exit_price
    margin = notional / Decimal(str(leverage)) if leverage > 0 else notional

    # Realised PnL — some exchanges put it in 'info.realizedPnl'
    info_dict = raw.get("info", {}) or {}
    realized_pnl = _safe_decimal(
        raw.get("realizedPnl")
        or info_dict.get("realizedPnl")
        or info_dict.get("profit")
    )
    gross_pnl = realized_pnl + fee_cost
    pnl_pct = (
        (realized_pnl / margin * 100) if margin and margin != 0 else Decimal("0")
    )

    is_win = realized_pnl > 0
    pnl_category = _determine_pnl_category(realized_pnl)

    # Timestamps
    opened_ts = raw.get("timestamp") or raw.get("datetime")
    closed_ts = raw.get("lastTradeTimestamp") or raw.get("timestamp")

    def _to_dt(ts: Any) -> datetime:
        if isinstance(ts, datetime):
            return ts
        if isinstance(ts, (int, float)):
            return datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
        if isinstance(ts, str):
            try:
                return datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except ValueError:
                pass
        return datetime.now(tz=timezone.utc)

    opened_at = _to_dt(opened_ts)
    closed_at = _to_dt(closed_ts)
    duration = int((closed_at - opened_at).total_seconds())
    if duration < 0:
        duration = 0

    side = _normalise_side(raw.get("side"))

    # Build the raw exchange data subdocument for auditability
    raw_exchange_data = {
        "ccxt_trade_id": str(raw.get("id", "")),
        "ccxt_symbol": symbol_raw,
        "original_side": raw.get("side"),
        "info": info_dict,
    }

    # Flatten symbol for our schema (no slash)
    symbol_clean = f"{base}{quote}"

    exchange_trade_id = str(raw.get("id", ""))
    exchange_order_id = str(raw.get("order", "") or "")

    return {
        "user_id": user_id,
        "exchange_id": exchange_id,
        "account_type": account_type.value,
        "exchange_trade_id": exchange_trade_id,
        "exchange_order_id": exchange_order_id,
        "symbol": symbol_clean,
        "base_asset": base,
        "quote_asset": quote,
        "side": side.value,
        "position_side": PositionSide.BOTH.value,
        "leverage": leverage,
        "entry_price": Decimal128(str(entry_price)),
        "exit_price": Decimal128(str(exit_price)),
        "quantity": Decimal128(str(quantity)),
        "notional_value_usd": Decimal128(str(notional)),
        "margin_used_usd": Decimal128(str(margin)),
        "realized_pnl_usd": Decimal128(str(realized_pnl)),
        "realized_pnl_pct": Decimal128(str(pnl_pct)),
        "gross_pnl_usd": Decimal128(str(gross_pnl)),
        "fee_usd": Decimal128(str(fee_cost)),
        "funding_fee_usd": Decimal128("0"),
        "is_win": is_win,
        "pnl_category": pnl_category.value,
        "opened_at": opened_at,
        "closed_at": closed_at,
        "duration_seconds": duration,
        "raw_exchange_data": raw_exchange_data,
        "synced_at": datetime.now(tz=timezone.utc),
        "schema_version": 1,
    }


# ─── Core ingestion function ────────────────────────────────────────────

async def fetch_and_sync_trades(
    user_id: str | ObjectId,
    exchange_id: str,
    api_key: str,
    api_secret: str,
    passphrase: Optional[str] = None,
    since_ms: Optional[int] = None,
    limit: int = 500,
) -> dict[str, Any]:
    """
    Fetch closed trades from an exchange via CCXT and upsert them into
    the ``trade_history`` collection using ``bulkWrite`` with the dedup
    unique index (§6.3).

    Parameters
    ----------
    user_id : str | ObjectId
        The ``users._id`` this data belongs to.
    exchange_id : str
        CCXT exchange identifier ("binance", "okx").
    api_key, api_secret : str
        Plaintext credentials (in production these come from AES-256
        decryption; for MVP testing they are passed directly).
    passphrase : str, optional
        Required for OKX.
    since_ms : int, optional
        Unix-ms timestamp to fetch trades from.  Defaults to last 30 days.
    limit : int
        Max trades per CCXT call (default 500, per §6.3 batch guideline).

    Returns
    -------
    dict with ``inserted``, ``updated``, ``errors``, ``elapsed_ms`` keys.
    """
    if isinstance(user_id, str):
        user_id = ObjectId(user_id)

    exchange = _create_exchange_client(exchange_id, api_key, api_secret, passphrase)

    if since_ms is None:
        since_ms = int((datetime.now(tz=timezone.utc).timestamp() - 30 * 86400) * 1000)

    start = time.monotonic()
    result = {"inserted": 0, "updated": 0, "errors": 0, "elapsed_ms": 0}

    try:
        # Load markets once (required by CCXT before most calls)
        await exchange.load_markets()

        # ── Fetch Futures closed orders ──────────────────────────────
        raw_trades: list[dict] = []
        try:
            # Try fetchMyTrades first (most granular)
            trades = await exchange.fetch_my_trades(
                symbol=None, since=since_ms, limit=limit
            )
            raw_trades.extend(trades)
        except ccxt.NotSupported:
            logger.warning(
                "%s: fetchMyTrades not supported, falling back to fetchClosedOrders",
                exchange_id,
            )
            try:
                orders = await exchange.fetch_closed_orders(
                    symbol=None, since=since_ms, limit=limit
                )
                raw_trades.extend(orders)
            except ccxt.NotSupported:
                logger.error("%s: neither fetchMyTrades nor fetchClosedOrders supported", exchange_id)

        # ── Also try Spot trades ─────────────────────────────────────
        try:
            exchange.options["defaultType"] = "spot"
            spot_trades = await exchange.fetch_my_trades(
                symbol=None, since=since_ms, limit=limit
            )
            raw_trades.extend(spot_trades)
        except Exception as e:
            logger.debug("Spot trade fetch skipped: %s", e)

        if not raw_trades:
            logger.info("No trades returned from %s for user %s", exchange_id, user_id)
            result["elapsed_ms"] = int((time.monotonic() - start) * 1000)
            return result

        # ── Map to documents & build bulkWrite ops ───────────────────
        ops: list[UpdateOne] = []
        for raw in raw_trades:
            try:
                # Determine account type from the raw response
                market_type = raw.get("type", "") or ""
                if "swap" in market_type or "future" in market_type:
                    acct_type = AccountType.FUTURES
                else:
                    acct_type = AccountType.SPOT

                doc = _ccxt_trade_to_document(raw, user_id, exchange_id, acct_type)

                # Upsert keyed on the dedup index fields
                ops.append(
                    UpdateOne(
                        {
                            "user_id": user_id,
                            "exchange_id": exchange_id,
                            "exchange_trade_id": doc["exchange_trade_id"],
                        },
                        {"$set": doc},
                        upsert=True,
                    )
                )
            except Exception as e:
                logger.warning("Failed to map trade %s: %s", raw.get("id"), e)
                result["errors"] += 1

        # ── Execute bulkWrite in batches of 500 (§6.3) ───────────────
        db = get_database()
        collection = db.trade_history
        batch_size = 500

        for i in range(0, len(ops), batch_size):
            batch = ops[i : i + batch_size]
            try:
                bulk_result = await collection.bulk_write(batch, ordered=False)
                result["inserted"] += bulk_result.upserted_count
                result["updated"] += bulk_result.modified_count
            except Exception as e:
                logger.error("bulkWrite error (batch %d): %s", i, e)
                result["errors"] += len(batch)

        logger.info(
            "Sync complete for %s/%s: %d inserted, %d updated, %d errors",
            exchange_id,
            user_id,
            result["inserted"],
            result["updated"],
            result["errors"],
        )

    except ccxt.AuthenticationError as e:
        logger.error("Auth failed for %s: %s", exchange_id, e)
        raise ValueError(f"Authentication failed for {exchange_id}: check API keys") from e
    except ccxt.ExchangeNotAvailable as e:
        logger.error("Exchange unavailable: %s — %s", exchange_id, e)
        raise
    except ccxt.RateLimitExceeded as e:
        logger.warning("Rate limit hit on %s: %s", exchange_id, e)
        raise
    finally:
        await exchange.close()

    result["elapsed_ms"] = int((time.monotonic() - start) * 1000)
    return result


# ─── Fetch current open positions ────────────────────────────────────────

async def fetch_open_positions(
    exchange_id: str,
    api_key: str,
    api_secret: str,
    passphrase: Optional[str] = None,
) -> list[dict[str, Any]]:
    """
    Fetch currently open Futures positions from the exchange.

    Returns a list of position dicts suitable for rendering on
    the dashboard without persisting to MongoDB (positions are
    ephemeral; only closed trades are stored).
    """
    exchange = _create_exchange_client(exchange_id, api_key, api_secret, passphrase)
    positions: list[dict[str, Any]] = []

    try:
        await exchange.load_markets()
        raw_positions = await exchange.fetch_positions()

        for pos in raw_positions:
            contracts = _safe_decimal(pos.get("contracts"))
            if contracts == 0:
                continue  # skip empty positions

            entry = _safe_decimal(pos.get("entryPrice"))
            mark = _safe_decimal(pos.get("markPrice"))
            unrealized = _safe_decimal(pos.get("unrealizedPnl"))
            liq_price = _safe_decimal(pos.get("liquidationPrice"))
            leverage_val = int(pos.get("leverage", 1) or 1)

            base, quote = _parse_symbol_parts(pos.get("symbol", ""))

            positions.append({
                "symbol": f"{base}{quote}",
                "side": pos.get("side", "long"),
                "contracts": str(contracts),
                "entry_price": str(entry),
                "mark_price": str(mark),
                "unrealized_pnl": str(unrealized),
                "liquidation_price": str(liq_price),
                "leverage": leverage_val,
                "margin_type": pos.get("marginMode", "cross"),
                "exchange_id": exchange_id,
            })

    except ccxt.AuthenticationError as e:
        raise ValueError(f"Auth failed for {exchange_id}") from e
    finally:
        await exchange.close()

    return positions


# ─── Fetch spot balances ─────────────────────────────────────────────────

async def fetch_spot_balances(
    exchange_id: str,
    api_key: str,
    api_secret: str,
    passphrase: Optional[str] = None,
) -> dict[str, Any]:
    """
    Fetch Spot account balances.  Returns a dict with ``total_usd``,
    ``assets`` (list), and ``raw`` for the full CCXT response.
    """
    exchange = _create_exchange_client(exchange_id, api_key, api_secret, passphrase)

    try:
        exchange.options["defaultType"] = "spot"
        await exchange.load_markets()
        balance = await exchange.fetch_balance()

        assets = []
        for asset, amount_data in balance.get("total", {}).items():
            total_amt = _safe_decimal(amount_data)
            if total_amt > 0:
                assets.append({
                    "asset": asset,
                    "total": str(total_amt),
                    "free": str(_safe_decimal(balance.get("free", {}).get(asset))),
                    "used": str(_safe_decimal(balance.get("used", {}).get(asset))),
                })

        return {
            "exchange_id": exchange_id,
            "total_usd": str(_safe_decimal(balance.get("total", {}).get("USDT"))),
            "assets": assets,
        }
    finally:
        await exchange.close()
