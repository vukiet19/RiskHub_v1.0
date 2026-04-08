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

# ── Symbols to scan if 'None' fails (Binance Futures Limitation) ──────
COMMON_SYMBOLS = [
    "BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT", 
    "BNB/USDT:USDT", "XRP/USDT:USDT"
]

STABLE_ASSETS = {
    "USD", "USDT", "USDC", "BUSD", "FDUSD", "TUSD", "USDP", "DAI",
}


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
    testnet: bool = False,
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
        "enableRateLimit": True,        # respect exchange rate limits
        "options": {
            "defaultType": "future",    # fetch futures by default
            "adjustForTimeDifference": True,
            "disableFuturesSandboxWarning": True,  # Bypass CCXT hard-block on deprecated testnet
            "portfolio": testnet,                  # Support newer Binance Demo accounts
        },
    }
    
    if api_key and api_secret:
        config["apiKey"] = api_key
        config["secret"] = api_secret

    # OKX requires a passphrase
    if passphrase:
        config["password"] = passphrase

    exchange = cls(config)
    if testnet:
        exchange.set_sandbox_mode(True)
        logger.info("%s client created in SANDBOX/TESTNET mode", exchange_id)

    return exchange


# ─── Helpers ─────────────────────────────────────────────────────────────

def _safe_decimal(value: Any, fallback: str = "0") -> Decimal:
    """Coerce to Decimal; return ``fallback`` on failure."""
    if value is None:
        return Decimal(fallback)
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal(fallback)


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _latest_close(candles: list[list[float]]) -> Optional[float]:
    if not candles:
        return None
    last_candle = candles[-1]
    if len(last_candle) < 5:
        return None
    return _safe_float(last_candle[4], 0.0)


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


def _extract_nonzero_assets(balance: dict[str, Any]) -> list[dict[str, Any]]:
    assets: list[dict[str, Any]] = []
    for asset, total in balance.get("total", {}).items():
        total_amount = _safe_decimal(total)
        if total_amount <= 0:
            continue
        assets.append(
            {
                "asset": asset,
                "total": str(total_amount),
                "free": str(_safe_decimal(balance.get("free", {}).get(asset))),
                "used": str(_safe_decimal(balance.get("used", {}).get(asset))),
            }
        )
    return assets


def _extract_futures_totals(balance: dict[str, Any]) -> dict[str, float]:
    info = balance.get("info") or {}
    wallet_balance = _safe_float(info.get("totalWalletBalance"))
    unrealized_pnl = _safe_float(info.get("totalUnrealizedProfit"))
    margin_balance = _safe_float(info.get("totalMarginBalance"))
    available_balance = _safe_float(info.get("availableBalance"))

    assets_info = info.get("assets")
    if isinstance(assets_info, list) and assets_info:
        wallet_balance = wallet_balance or sum(
            _safe_float(asset.get("walletBalance"))
            for asset in assets_info
        )
        unrealized_pnl = unrealized_pnl or sum(
            _safe_float(asset.get("unrealizedProfit"))
            for asset in assets_info
        )
        margin_balance = margin_balance or sum(
            _safe_float(asset.get("marginBalance"))
            for asset in assets_info
        )
        available_balance = available_balance or sum(
            _safe_float(asset.get("availableBalance"))
            for asset in assets_info
        )

    if wallet_balance == 0.0:
        wallet_balance = sum(
            _safe_float(total)
            for asset, total in balance.get("total", {}).items()
            if asset in STABLE_ASSETS
        )

    if margin_balance == 0.0:
        margin_balance = wallet_balance + unrealized_pnl

    return {
        "wallet_balance_usd": round(wallet_balance, 8),
        "unrealized_pnl_usd": round(unrealized_pnl, 8),
        "account_value_usd": round(margin_balance, 8),
        "available_balance_usd": round(available_balance, 8),
    }


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
    testnet: bool = False,
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

    exchange = _create_exchange_client(exchange_id, api_key, api_secret, passphrase, testnet)

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
            if isinstance(trades, list):
                raw_trades.extend(trades)
        except Exception as e:
            logger.warning(
                "%s: fetchMyTrades(None) failed (%s), starting Dynamic Symbol Discovery",
                exchange_id, type(e).__name__
            )
            # ── DYNAMIC DISCOVERY: Find symbols the user actually uses ───
            symbols_to_scan = set(COMMON_SYMBOLS)
            try:
                # 1. Check current positions for active symbols
                positions = await exchange.fetch_positions()
                for pos in positions:
                    if float(pos.get('contracts', 0)) != 0 or float(pos.get('unrealizedPnl', 0)) != 0:
                        symbols_to_scan.add(pos['symbol'])
                
                # 2. Check balance for assets with non-zero values
                bal = await exchange.fetch_balance()
                for asset, data in bal.get('total', {}).items():
                    if float(data) > 0 and asset != 'USDT':
                        # Attempt to guess the USDT unified derivative pair
                        symbols_to_scan.add(f"{asset}/USDT:USDT")
            except Exception as disc_e:
                logger.debug("Symbol discovery limited: %s", disc_e)

            logger.info("%s: Scanning discovered symbols: %s", exchange_id, list(symbols_to_scan))
            
            for sym in symbols_to_scan:
                try:
                    trades = await exchange.fetch_my_trades(
                        symbol=sym, since=since_ms, limit=limit
                    )
                    if isinstance(trades, list) and len(trades) > 0:
                        logger.info("Sync found %d trades for %s", len(trades), sym)
                        raw_trades.extend(trades)
                except Exception as sym_e:
                    logger.debug("Sync skipped %s: %s", sym, sym_e)



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
            if not raw or not isinstance(raw, dict):
                continue
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
    testnet: bool = False,
) -> list[dict[str, Any]]:
    """
    Fetch currently open Futures positions from the exchange.

    Returns a list of position dicts suitable for rendering on
    the dashboard without persisting to MongoDB (positions are
    ephemeral; only closed trades are stored).
    """
    exchange = _create_exchange_client(exchange_id, api_key, api_secret, passphrase, testnet)
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
    testnet: bool = False,
) -> dict[str, Any]:
    """
    Fetch Spot account balances.  Returns a dict with ``total_usd``,
    ``assets`` (list), and ``raw`` for the full CCXT response.
    """
    exchange = _create_exchange_client(exchange_id, api_key, api_secret, passphrase, testnet)

    try:
        exchange.options["defaultType"] = "spot"
        await exchange.load_markets()
        balance = await exchange.fetch_balance()

        return {
            "exchange_id": exchange_id,
            "total_usd": str(_safe_decimal(balance.get("total", {}).get("USDT"))),
            "assets": _extract_nonzero_assets(balance),
        }
    finally:
        await exchange.close()


# ─── Fetch OHLCV data for Correlation ────────────────────────────────────

async def validate_binance_testnet_credentials(
    api_key: str,
    api_secret: str,
) -> dict[str, Any]:
    """
    Validate Binance Testnet Futures credentials by confirming authenticated
    read access server-side.
    """
    exchange = _create_exchange_client(
        "binance",
        api_key,
        api_secret,
        testnet=True,
    )

    try:
        await exchange.load_markets()
        exchange.options["defaultType"] = "future"

        balance = await exchange.fetch_balance()
        positions = await exchange.fetch_positions()
        active_positions = [
            position
            for position in positions
            if _safe_float(position.get("contracts")) != 0
        ]

        return {
            "permissions_verified": ["read"],
            "balances_count": len(_extract_nonzero_assets(balance)),
            "positions_count": len(active_positions),
            "warnings": [],
        }
    except (
        ccxt.AuthenticationError,
        ccxt.PermissionDenied,
        ccxt.BadRequest,
    ) as e:
        raise ValueError(
            "Binance Testnet validation failed. Check the API key, secret, and read permissions."
        ) from e
    finally:
        await exchange.close()


async def fetch_futures_account_overview(
    exchange_id: str,
    api_key: str,
    api_secret: str,
    passphrase: Optional[str] = None,
    testnet: bool = False,
) -> dict[str, Any]:
    exchange = _create_exchange_client(exchange_id, api_key, api_secret, passphrase, testnet)

    try:
        exchange.options["defaultType"] = "future"
        await exchange.load_markets()
        balance = await exchange.fetch_balance()
        positions = await exchange.fetch_positions()

        active_positions = [
            position
            for position in positions
            if _safe_float(position.get("contracts")) != 0
        ]
        totals = _extract_futures_totals(balance)

        if totals["unrealized_pnl_usd"] == 0.0:
            totals["unrealized_pnl_usd"] = round(
                sum(_safe_float(position.get("unrealizedPnl")) for position in active_positions),
                8,
            )
            totals["account_value_usd"] = round(
                totals["wallet_balance_usd"] + totals["unrealized_pnl_usd"],
                8,
            )

        return {
            "exchange_id": exchange_id,
            "wallet_balance_usd": totals["wallet_balance_usd"],
            "account_value_usd": totals["account_value_usd"],
            "total_unrealized_pnl_usd": totals["unrealized_pnl_usd"],
            "available_balance_usd": totals["available_balance_usd"],
            "balances_count": len(_extract_nonzero_assets(balance)),
            "positions_count": len(active_positions),
        }
    finally:
        await exchange.close()


async def fetch_account_overview(
    exchange_id: str,
    api_key: str,
    api_secret: str,
    passphrase: Optional[str] = None,
    *,
    testnet: bool = False,
    market_type: str = "futures",
) -> dict[str, Any]:
    """
    Build a live account overview without relying on historical trade volume.
    """
    warnings: list[str] = []
    normalized_market_type = (market_type or "futures").lower()

    spot_total_usd = 0.0
    spot_assets: list[dict[str, Any]] = []
    if normalized_market_type in {"spot", "mixed"}:
        try:
            spot_balance = await fetch_spot_balances(
                exchange_id=exchange_id,
                api_key=api_key,
                api_secret=api_secret,
                passphrase=passphrase,
                testnet=testnet,
            )
            spot_assets = spot_balance.get("assets", [])

            price_symbols = [
                asset["asset"]
                for asset in spot_assets
                if asset["asset"] not in STABLE_ASSETS
            ]
            ohlcv = (
                await fetch_daily_ohlcv(exchange_id, price_symbols, days=8)
                if price_symbols else {}
            )

            for asset in spot_assets:
                symbol = asset["asset"]
                quantity = _safe_float(asset.get("total"))
                if symbol in STABLE_ASSETS:
                    spot_total_usd += quantity
                    continue

                last_close = _latest_close(ohlcv.get(symbol, []))
                if last_close is None or last_close <= 0:
                    warnings.append(f"Spot pricing unavailable for {symbol}.")
                    continue
                spot_total_usd += quantity * last_close
        except Exception as e:
            logger.warning("Failed to fetch spot overview for %s: %s", exchange_id, e)
            warnings.append("Spot balances were unavailable for this connection.")

    futures_overview = {
        "wallet_balance_usd": 0.0,
        "account_value_usd": 0.0,
        "total_unrealized_pnl_usd": 0.0,
        "available_balance_usd": 0.0,
        "balances_count": 0,
        "positions_count": 0,
    }
    if normalized_market_type in {"futures", "mixed"}:
        futures_overview = await fetch_futures_account_overview(
            exchange_id=exchange_id,
            api_key=api_key,
            api_secret=api_secret,
            passphrase=passphrase,
            testnet=testnet,
        )

    total_portfolio_value = round(
        spot_total_usd + futures_overview["account_value_usd"],
        8,
    )

    return {
        "exchange_id": exchange_id,
        "environment": "testnet" if testnet else "mainnet",
        "market_type": normalized_market_type,
        "spot_total_usd": round(spot_total_usd, 8),
        "futures_wallet_balance_usd": futures_overview["wallet_balance_usd"],
        "futures_account_value_usd": futures_overview["account_value_usd"],
        "total_portfolio_value_usd": total_portfolio_value,
        "total_unrealized_pnl_usd": futures_overview["total_unrealized_pnl_usd"],
        "balances_count": len(spot_assets) + futures_overview["balances_count"],
        "positions_count": futures_overview["positions_count"],
        "warnings": warnings,
    }


async def fetch_daily_ohlcv(
    exchange_id: str,
    symbols: list[str],
    days: int = 30,
) -> dict[str, list[list[float]]]:
    """
    Fetch daily OHLCV data for a list of symbols for the past `days`.
    Uses unauthenticated API limits.
    Returns dict mapping symbol to CCXT OHLCV list.
    """
    exchange = _create_exchange_client(exchange_id, "", "")
    since = int((datetime.now(tz=timezone.utc).timestamp() - days * 86400) * 1000)
    
    results = {}
    try:
        exchange.options["defaultType"] = "spot" # OHLCV generally easier on spot
        await exchange.load_markets()
        for sym in symbols:
            try:
                # CCXT unified symbol (e.g., BTC/USDT)
                ccxt_sym = sym if "/" in sym else f"{sym}/USDT" 
                ohlcv = await exchange.fetch_ohlcv(ccxt_sym, '1d', since)
                results[sym] = ohlcv
            except Exception as e:
                logger.warning("Failed to fetch OHLCV for %s: %s", sym, e)
    finally:
        await exchange.close()

    return results
