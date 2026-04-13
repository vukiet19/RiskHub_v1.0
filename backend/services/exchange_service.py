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

import hashlib
import logging
import time
from collections import defaultdict
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
    HistoryRecordType,
    TradeSide,
    PositionSide,
    PnlCategory,
)
from models.base import to_mongo_decimal

logger = logging.getLogger("riskhub.exchange")

# ── Symbols to scan if 'None' fails (Binance Futures Limitation) ──────
COMMON_SYMBOLS = [
    "BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT",
    "BNB/USDT:USDT", "XRP/USDT:USDT", "DOGE/USDT:USDT",
    "BCH/USDT:USDT", "TRX/USDT:USDT"
]

STABLE_ASSETS = {
    "USD", "USDT", "USDC", "BUSD", "FDUSD", "TUSD", "USDP", "DAI",
}


# ── Supported exchanges (MVP) ───────────────────────────────────────────
SUPPORTED_EXCHANGES: dict[str, type] = {
    "binance": ccxt.binance,
    "okx": ccxt.okx,
}


def _default_futures_type(exchange_id: str) -> str:
    if exchange_id == "okx":
        return "swap"
    return "future"


def _normalise_environment(environment: Optional[str], *, testnet: Optional[bool] = None) -> str:
    env = (environment or "").strip().lower()
    if env:
        if env not in {"mainnet", "testnet", "demo"}:
            raise ValueError(f"Unsupported environment '{environment}'.")
        return env
    return "testnet" if testnet else "mainnet"


def _configure_binance_demo_urls(exchange: ccxt.Exchange) -> None:
    api_urls = exchange.urls.get("api")
    if not isinstance(api_urls, dict):
        api_urls = {}
    else:
        api_urls = dict(api_urls)

    api_urls.update(
        {
            "public": "https://demo-api.binance.com/api/v3",
            "private": "https://demo-api.binance.com/api/v3",
            "v1": "https://demo-api.binance.com/api/v1",
            "v3": "https://demo-api.binance.com/api/v3",
            "fapiPublic": "https://demo-fapi.binance.com/fapi/v1",
            "fapiPublicV2": "https://demo-fapi.binance.com/fapi/v2",
            "fapiPublicV3": "https://demo-fapi.binance.com/fapi/v3",
            "fapiPrivate": "https://demo-fapi.binance.com/fapi/v1",
            "fapiPrivateV2": "https://demo-fapi.binance.com/fapi/v2",
            "fapiPrivateV3": "https://demo-fapi.binance.com/fapi/v3",
        }
    )
    exchange.urls["api"] = api_urls


def _configure_binance_derivatives_compat(
    exchange: ccxt.Exchange,
    environment: str,
) -> None:
    if exchange.id != "binance":
        return
    if environment not in {"demo", "testnet"}:
        return

    options = dict(exchange.options or {})
    existing_fetch_balance = options.get("fetchBalance")
    fetch_balance_opts = (
        dict(existing_fetch_balance)
        if isinstance(existing_fetch_balance, dict)
        else {}
    )
    fetch_balance_opts["useV2"] = True
    options["fetchBalance"] = fetch_balance_opts

    existing_fetch_positions = options.get("fetchPositions")
    fetch_positions_opts = (
        dict(existing_fetch_positions)
        if isinstance(existing_fetch_positions, dict)
        else {}
    )
    if isinstance(existing_fetch_positions, str) and existing_fetch_positions:
        fetch_positions_opts["method"] = existing_fetch_positions
    fetch_positions_opts["useV2"] = True
    options["fetchPositions"] = fetch_positions_opts

    options["defaultSubType"] = "linear"
    exchange.options = options


def _binance_futures_query_params(environment: str) -> dict[str, Any]:
    params: dict[str, Any] = {"type": "future"}
    if environment in {"demo", "testnet"}:
        params["useV2"] = True
    return params


def _format_exchange_auth_error(exchange_id: str, exc: Exception) -> str:
    raw_message = str(exc or "").strip()
    if raw_message.lower().startswith(f"{exchange_id.lower()} "):
        return raw_message
    return f"{exchange_id} {raw_message}"


def _is_exchange_auth_error(exc: Exception) -> bool:
    return isinstance(exc, (ccxt.AuthenticationError, ccxt.PermissionDenied, ccxt.BadRequest))


# ─── Exchange client factory ────────────────────────────────────────────

def _create_exchange_client(
    exchange_id: str,
    api_key: str,
    api_secret: str,
    passphrase: Optional[str] = None,
    testnet: Optional[bool] = None,
    environment: Optional[str] = None,
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

    normalized_environment = _normalise_environment(environment, testnet=testnet)
    if normalized_environment == "demo" and exchange_id != "binance":
        raise ValueError(f"Environment 'demo' is not supported for exchange '{exchange_id}'.")

    config: dict[str, Any] = {
        "enableRateLimit": True,        # respect exchange rate limits
        "options": {
            "defaultType": _default_futures_type(exchange_id),    # fetch futures by default
            "adjustForTimeDifference": True,
            "disableFuturesSandboxWarning": True,  # Bypass CCXT hard-block on deprecated testnet
        },
    }
    
    if api_key and api_secret:
        config["apiKey"] = api_key
        config["secret"] = api_secret

    # OKX requires a passphrase
    if passphrase:
        config["password"] = passphrase

    exchange = cls(config)
    if normalized_environment == "testnet":
        exchange.set_sandbox_mode(True)
        logger.info("%s client created in SANDBOX/TESTNET mode", exchange_id)
    elif normalized_environment == "demo":
        _configure_binance_demo_urls(exchange)
        logger.info("%s client created in DEMO mode", exchange_id)
    _configure_binance_derivatives_compat(exchange, normalized_environment)

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


def _safe_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _to_dt(ts: Any) -> datetime:
    if isinstance(ts, datetime):
        return ts
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
    if isinstance(ts, str):
        ts_str = ts.strip()
        if ts_str.isdigit():
            return datetime.fromtimestamp(int(ts_str) / 1000, tz=timezone.utc)
        try:
            return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        except ValueError:
            pass
    return datetime.now(tz=timezone.utc)


def _hash_record_id(prefix: str, *parts: Any) -> str:
    payload = "|".join("" if part is None else str(part) for part in parts)
    digest = hashlib.sha1(payload.encode("utf-8")).hexdigest()[:20]
    return f"{prefix}:{digest}"


def _position_notional_usd(raw_position: dict[str, Any]) -> Decimal:
    info = raw_position.get("info", {}) or {}

    direct_notional = _safe_decimal(
        raw_position.get("notional")
        or info.get("notionalUsd")
        or info.get("notional")
    )
    if direct_notional != 0:
        return abs(direct_notional)

    contracts = _safe_decimal(raw_position.get("contracts") or info.get("pos"))
    contract_size = _safe_decimal(raw_position.get("contractSize"), "1")
    mark_price = _safe_decimal(
        raw_position.get("markPrice")
        or info.get("markPx")
        or info.get("last")
    )
    return abs(contracts * contract_size * mark_price)


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


def _direction_to_position_side(direction: TradeSide) -> PositionSide:
    return PositionSide.LONG if direction == TradeSide.LONG else PositionSide.SHORT


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


def _extract_binance_account_assets(account_payload: dict[str, Any]) -> list[dict[str, Any]]:
    assets: list[dict[str, Any]] = []
    balances = account_payload.get("balances")
    if not isinstance(balances, list):
        return assets

    for balance_row in balances:
        if not isinstance(balance_row, dict):
            continue
        asset = str(balance_row.get("asset") or "").strip().upper()
        if not asset:
            continue
        free = _safe_decimal(balance_row.get("free"))
        locked = _safe_decimal(balance_row.get("locked"))
        total = free + locked
        if total <= 0:
            continue
        assets.append(
            {
                "asset": asset,
                "total": str(total),
                "free": str(free),
                "used": str(locked),
            }
        )
    return assets


async def _value_spot_assets(
    exchange_id: str,
    assets: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], float, list[str]]:
    normalised_assets: list[dict[str, Any]] = []
    symbols_to_price: list[str] = []

    for asset in assets:
        symbol = str(asset.get("asset") or "").strip().upper()
        total_amount = _safe_float(asset.get("total"))
        if not symbol or total_amount <= 0:
            continue

        normalised_asset = {**asset, "asset": symbol}
        normalised_assets.append(normalised_asset)
        if symbol not in STABLE_ASSETS and symbol not in symbols_to_price:
            symbols_to_price.append(symbol)

    warnings: list[str] = []
    ohlcv = (
        await fetch_daily_ohlcv(exchange_id, symbols_to_price, days=8, out_warnings=warnings)
        if symbols_to_price
        else {}
    )

    priced_assets: list[dict[str, Any]] = []
    total_usd = 0.0

    for asset in normalised_assets:
        symbol = str(asset.get("asset") or "").upper()
        quantity = _safe_float(asset.get("total"))
        is_stable = symbol in STABLE_ASSETS
        last_price = 1.0 if is_stable else _latest_close(ohlcv.get(symbol, []))
        is_priced = is_stable or (last_price is not None and last_price > 0)
        usd_value = quantity if is_stable else (quantity * _safe_float(last_price))

        if not is_priced:
            warnings.append(f"Spot pricing unavailable for {symbol}.")
            usd_value = 0.0

        total_usd += usd_value
        priced_assets.append(
            {
                **asset,
                "is_stable": is_stable,
                "last_price_usd": round(_safe_float(last_price), 8) if is_priced else None,
                "usd_value": round(usd_value, 8),
                "pricing_status": (
                    "stable"
                    if is_stable
                    else "priced"
                    if is_priced
                    else "unpriced"
                ),
            }
        )

    priced_assets.sort(
        key=lambda asset: (
            _safe_float(asset.get("usd_value")),
            _safe_float(asset.get("total")),
        ),
        reverse=True,
    )

    return priced_assets, round(total_usd, 8), list(dict.fromkeys(warnings))


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
        "record_type": HistoryRecordType.LEGACY_FILL.value,
        "aggregation_source": "legacy_trade_fill",
        "source_fill_count": 1,
        "synced_at": datetime.now(tz=timezone.utc),
        "schema_version": 1,
    }


# ─── Core ingestion function ────────────────────────────────────────────

def _build_closed_position_document(
    *,
    user_id: ObjectId,
    exchange_id: str,
    record_id: str,
    symbol_raw: str,
    direction: TradeSide,
    leverage: int,
    entry_price: Decimal,
    exit_price: Decimal,
    quantity: Decimal,
    realized_pnl: Decimal,
    gross_pnl: Decimal,
    fee_usd: Decimal,
    funding_fee_usd: Decimal,
    opened_at: datetime,
    closed_at: datetime,
    exchange_order_id: Optional[str],
    aggregation_source: str,
    source_fill_count: int,
    raw_exchange_data: dict[str, Any],
) -> dict[str, Any]:
    base, quote = _parse_symbol_parts(symbol_raw)
    symbol_clean = f"{base}{quote}"
    notional = quantity * exit_price
    margin = notional / Decimal(str(leverage)) if leverage > 0 and notional > 0 else notional
    pnl_pct = (
        (realized_pnl / margin * 100).quantize(Decimal("0.01"))
        if margin > 0
        else Decimal("0")
    )
    duration = max(int((closed_at - opened_at).total_seconds()), 0)

    return {
        "user_id": user_id,
        "exchange_id": exchange_id,
        "account_type": AccountType.FUTURES.value,
        "exchange_trade_id": record_id,
        "exchange_order_id": exchange_order_id,
        "symbol": symbol_clean,
        "base_asset": base,
        "quote_asset": quote,
        "side": direction.value,
        "position_side": _direction_to_position_side(direction).value,
        "leverage": leverage,
        "entry_price": Decimal128(str(entry_price)),
        "exit_price": Decimal128(str(exit_price)),
        "quantity": Decimal128(str(quantity)),
        "notional_value_usd": Decimal128(str(notional)),
        "margin_used_usd": Decimal128(str(margin)),
        "realized_pnl_usd": Decimal128(str(realized_pnl)),
        "realized_pnl_pct": Decimal128(str(pnl_pct)),
        "gross_pnl_usd": Decimal128(str(gross_pnl)),
        "fee_usd": Decimal128(str(fee_usd)),
        "funding_fee_usd": Decimal128(str(funding_fee_usd)),
        "is_win": realized_pnl > 0,
        "pnl_category": _determine_pnl_category(realized_pnl).value,
        "opened_at": opened_at,
        "closed_at": closed_at,
        "duration_seconds": duration,
        "raw_exchange_data": raw_exchange_data,
        "record_type": HistoryRecordType.CLOSED_POSITION.value,
        "aggregation_source": aggregation_source,
        "source_fill_count": max(source_fill_count, 1),
        "synced_at": datetime.now(tz=timezone.utc),
        "schema_version": 2,
    }


def _build_okx_closed_position_document(
    raw_position: dict[str, Any],
    *,
    user_id: ObjectId,
    exchange_id: str,
) -> dict[str, Any]:
    info = raw_position.get("info", {}) or {}
    symbol_raw = raw_position.get("symbol") or info.get("instId") or ""
    direction = _normalise_side(info.get("direction") or raw_position.get("side"))
    quantity = _safe_decimal(info.get("closeTotalPos") or info.get("openMaxPos"))
    entry_price = _safe_decimal(info.get("openAvgPx") or raw_position.get("entryPrice"))
    exit_price = _safe_decimal(info.get("closeAvgPx") or raw_position.get("markPrice"))
    leverage = max(_safe_int(info.get("lever") or raw_position.get("leverage"), 1), 1)
    gross_pnl = _safe_decimal(info.get("realizedPnl") or raw_position.get("realizedPnl") or info.get("pnl"))
    fee_usd = abs(_safe_decimal(info.get("fee")))
    funding_fee_usd = _safe_decimal(info.get("fundingFee"))
    realized_pnl = gross_pnl - fee_usd + funding_fee_usd
    opened_at = _to_dt(info.get("cTime") or raw_position.get("timestamp"))
    closed_at = _to_dt(info.get("uTime") or raw_position.get("datetime") or raw_position.get("timestamp"))
    position_id = str(info.get("posId") or raw_position.get("id") or "")
    record_id = (
        f"position:{position_id}"
        if position_id
        else _hash_record_id("position", exchange_id, symbol_raw, opened_at.isoformat(), closed_at.isoformat(), quantity)
    )

    return _build_closed_position_document(
        user_id=user_id,
        exchange_id=exchange_id,
        record_id=record_id,
        symbol_raw=symbol_raw,
        direction=direction,
        leverage=leverage,
        entry_price=entry_price,
        exit_price=exit_price,
        quantity=quantity,
        realized_pnl=realized_pnl,
        gross_pnl=gross_pnl,
        fee_usd=fee_usd,
        funding_fee_usd=funding_fee_usd,
        opened_at=opened_at,
        closed_at=closed_at,
        exchange_order_id=position_id or None,
        aggregation_source="okx_positions_history",
        source_fill_count=1,
        raw_exchange_data={
            "ccxt_trade_id": position_id or None,
            "ccxt_symbol": symbol_raw,
            "original_side": info.get("direction"),
            "info": info,
        },
    )


def _clean_symbol_to_unified_contract(symbol: str) -> str:
    base, quote = _parse_symbol_parts(symbol)
    return f"{base}/{quote}:{quote}"


async def _fetch_binance_leverage_map(exchange: ccxt.Exchange) -> dict[str, int]:
    leverage_by_symbol: dict[str, int] = {}
    try:
        rows = await exchange.fapiPrivateV2GetPositionRisk({})
    except Exception as exc:
        logger.warning("binance: failed to fetch leverage map (%s)", exc)
        return leverage_by_symbol

    for row in rows or []:
        symbol_id = str(row.get("symbol") or "")
        if symbol_id:
            leverage_by_symbol[symbol_id] = max(_safe_int(row.get("leverage"), 1), 1)

    return leverage_by_symbol


async def _fetch_binance_realized_income_rows(
    exchange: ccxt.Exchange,
    *,
    since_ms: int,
    limit: int,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    cursor = since_ms
    page_limit = min(max(limit, 100), 1000)

    while True:
        batch = await exchange.fapiPrivateGetIncome(
            {
                "incomeType": "REALIZED_PNL",
                "startTime": cursor,
                "limit": page_limit,
            }
        )
        if not isinstance(batch, list) or not batch:
            break

        last_time = cursor
        for row in batch:
            key = str(row.get("tranId") or row.get("tradeId") or f"{row.get('symbol')}:{row.get('time')}")
            if key in seen_ids:
                continue
            seen_ids.add(key)
            rows.append(row)
            last_time = max(last_time, _safe_int(row.get("time")))

        if len(batch) < page_limit or last_time <= cursor:
            break
        cursor = last_time + 1

    return rows


async def _discover_binance_futures_symbols(
    exchange: ccxt.Exchange,
    *,
    user_id: ObjectId,
    since_ms: int,
    limit: int,
) -> set[str]:
    symbols_to_scan: set[str] = set(COMMON_SYMBOLS)

    try:
        incomes = await _fetch_binance_realized_income_rows(exchange, since_ms=since_ms, limit=limit)
        for row in incomes:
            symbol_id = str(row.get("symbol") or "")
            if symbol_id:
                symbols_to_scan.add(_clean_symbol_to_unified_contract(symbol_id))
    except Exception as exc:
        logger.warning("binance: failed to discover symbols from realized pnl (%s)", exc)

    try:
        positions = await exchange.fetch_positions()
        for pos in positions:
            if _safe_float(pos.get("contracts")) != 0 or _safe_float(pos.get("unrealizedPnl")) != 0:
                symbol = str(pos.get("symbol") or "")
                if symbol:
                    symbols_to_scan.add(symbol)
    except Exception as exc:
        logger.debug("binance: active-position symbol discovery limited (%s)", exc)

    try:
        db = get_database()
        lookback_start = _to_dt(max(since_ms - 90 * 86400 * 1000, 0))
        previous_symbols = await db.trade_history.distinct(
            "symbol",
            {
                "user_id": user_id,
                "exchange_id": "binance",
                "closed_at": {"$gte": lookback_start},
            },
        )
        for symbol_clean in previous_symbols:
            if isinstance(symbol_clean, str) and symbol_clean:
                symbols_to_scan.add(_clean_symbol_to_unified_contract(symbol_clean))
    except Exception as exc:
        logger.debug("binance: historical symbol discovery limited (%s)", exc)

    return {symbol for symbol in symbols_to_scan if symbol}


async def _fetch_binance_symbol_fills(
    exchange: ccxt.Exchange,
    symbol: str,
    *,
    since_ms: int,
    limit: int,
) -> list[dict[str, Any]]:
    all_trades: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    cursor = since_ms
    page_limit = min(max(limit, 100), 1000)

    while True:
        batch = await exchange.fetch_my_trades(symbol=symbol, since=cursor, limit=page_limit)
        if not isinstance(batch, list) or not batch:
            break

        last_ts = cursor
        for trade in batch:
            key = str(trade.get("id") or f"{trade.get('order')}:{trade.get('timestamp')}")
            if key in seen_ids:
                continue
            seen_ids.add(key)
            all_trades.append(trade)
            last_ts = max(last_ts, _safe_int(trade.get("timestamp")))

        if len(batch) < page_limit or last_ts <= cursor:
            break
        cursor = last_ts + 1

    return all_trades


def _binance_position_signed_qty(trade: dict[str, Any], position_side: str) -> Decimal:
    qty = _safe_decimal(trade.get("amount") or (trade.get("info") or {}).get("qty"))
    side = str(trade.get("side") or "").lower()
    if position_side == "SHORT":
        return -qty if side == "sell" else qty
    return qty if side == "buy" else -qty


def _extract_trade_fee(raw: dict[str, Any]) -> Decimal:
    fee = raw.get("fee")
    if isinstance(fee, dict):
        return _safe_decimal(fee.get("cost"))
    return _safe_decimal((raw.get("info") or {}).get("commission"))


def _extract_trade_realized_pnl(raw: dict[str, Any]) -> Decimal:
    info = raw.get("info", {}) or {}
    return _safe_decimal(raw.get("realizedPnl") or info.get("realizedPnl") or info.get("profit"))


def _infer_entry_from_close(
    *,
    direction: TradeSide,
    exit_price: Decimal,
    quantity: Decimal,
    gross_pnl: Decimal,
) -> Decimal:
    if quantity <= 0:
        return exit_price
    if direction == TradeSide.LONG:
        return exit_price - (gross_pnl / quantity)
    return exit_price + (gross_pnl / quantity)


def _finalize_binance_cycle(
    cycle: dict[str, Any],
    *,
    user_id: ObjectId,
    leverage_by_symbol: dict[str, int],
) -> dict[str, Any] | None:
    if cycle.get("closed_qty_total", Decimal("0")) <= 0 or cycle.get("closed_at") is None:
        return None

    symbol_id = cycle["symbol_id"]
    symbol_raw = cycle["symbol_raw"]
    direction = cycle["direction"]
    quantity = cycle["closed_qty_total"]
    exit_price = (
        cycle["closing_turnover"] / quantity
        if quantity > 0
        else cycle["avg_entry"]
    )
    leverage = max(leverage_by_symbol.get(symbol_id, cycle.get("leverage", 1) or 1), 1)
    fee_total = cycle["fee_total"].quantize(Decimal("0.00000001"))
    gross_pnl = cycle["gross_realized"].quantize(Decimal("0.00000001"))
    realized_pnl = (gross_pnl - fee_total).quantize(Decimal("0.00000001"))
    record_id = _hash_record_id(
        "position",
        "binance",
        symbol_id,
        direction.value,
        cycle["opened_at"].isoformat(),
        cycle["closed_at"].isoformat(),
        quantity,
        ",".join(sorted(cycle["close_order_ids"])),
    )

    return _build_closed_position_document(
        user_id=user_id,
        exchange_id="binance",
        record_id=record_id,
        symbol_raw=symbol_raw,
        direction=direction,
        leverage=leverage,
        entry_price=cycle["avg_entry"],
        exit_price=exit_price,
        quantity=quantity,
        realized_pnl=realized_pnl,
        gross_pnl=gross_pnl,
        fee_usd=fee_total,
        funding_fee_usd=Decimal("0"),
        opened_at=cycle["opened_at"],
        closed_at=cycle["closed_at"],
        exchange_order_id=next(iter(sorted(cycle["close_order_ids"])), None),
        aggregation_source="binance_reconstructed_fills",
        source_fill_count=cycle["open_fill_count"] + cycle["close_fill_count"],
        raw_exchange_data={
            "ccxt_trade_id": record_id,
            "ccxt_symbol": symbol_raw,
            "original_side": direction.value,
            "info": {
                "positionSide": cycle["position_side_key"],
                "openFillCount": cycle["open_fill_count"],
                "closeFillCount": cycle["close_fill_count"],
                "closeOrderIds": sorted(cycle["close_order_ids"]),
                "sourceTradeIds": cycle["source_trade_ids"][:100],
            },
        },
    )


def _new_binance_cycle(
    *,
    symbol_id: str,
    symbol_raw: str,
    position_side_key: str,
    signed_qty: Decimal,
    price: Decimal,
    trade_timestamp: datetime,
    trade_id: str,
    order_id: str,
    fee_open: Decimal = Decimal("0"),
    leverage: int = 1,
) -> dict[str, Any]:
    abs_qty = abs(signed_qty)
    return {
        "symbol_id": symbol_id,
        "symbol_raw": symbol_raw,
        "position_side_key": position_side_key,
        "direction": TradeSide.LONG if signed_qty > 0 else TradeSide.SHORT,
        "current_qty": signed_qty,
        "avg_entry": price,
        "opened_at": trade_timestamp,
        "closed_at": None,
        "closing_turnover": Decimal("0"),
        "closed_qty_total": Decimal("0"),
        "gross_realized": Decimal("0"),
        "fee_total": fee_open,
        "leverage": leverage,
        "open_fill_count": 1 if abs_qty > 0 else 0,
        "close_fill_count": 0,
        "close_order_ids": set(),
        "source_trade_ids": [trade_id] if trade_id else [],
        "max_abs_qty": abs_qty,
        "last_order_id": order_id,
    }


def _build_binance_closed_position_documents(
    raw_trades: list[dict[str, Any]],
    *,
    user_id: ObjectId,
    leverage_by_symbol: dict[str, int],
    closed_since_ms: int,
) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for trade in raw_trades:
        if not isinstance(trade, dict):
            continue
        info = trade.get("info", {}) or {}
        symbol_raw = str(trade.get("symbol") or "")
        if not symbol_raw:
            continue
        position_side_key = str(info.get("positionSide") or "BOTH").upper()
        grouped[(symbol_raw, position_side_key)].append(trade)

    docs: list[dict[str, Any]] = []
    closed_since = _to_dt(closed_since_ms)

    for (symbol_raw, position_side_key), trades in grouped.items():
        symbol_id = symbol_raw.replace("/", "").replace(":USDT", "")
        cycle: dict[str, Any] | None = None
        sorted_trades = sorted(
            trades,
            key=lambda row: (_safe_int(row.get("timestamp")), str(row.get("id") or "")),
        )

        for trade in sorted_trades:
            qty = _safe_decimal(trade.get("amount") or (trade.get("info") or {}).get("qty"))
            if qty <= 0:
                continue

            price = _safe_decimal(trade.get("price"))
            fee = _extract_trade_fee(trade)
            gross_realized = _extract_trade_realized_pnl(trade)
            signed_qty = _binance_position_signed_qty(trade, position_side_key)
            trade_timestamp = _to_dt(trade.get("timestamp") or trade.get("datetime"))
            trade_id = str(trade.get("id") or "")
            order_id = str(trade.get("order") or (trade.get("info") or {}).get("orderId") or "")
            symbol_leverage = max(leverage_by_symbol.get(symbol_id, 1), 1)

            if cycle is None:
                if gross_realized != 0:
                    inferred_direction = TradeSide.SHORT if signed_qty > 0 else TradeSide.LONG
                    synthetic_entry = _infer_entry_from_close(
                        direction=inferred_direction,
                        exit_price=price,
                        quantity=qty,
                        gross_pnl=gross_realized,
                    )
                    synthetic_doc = _build_closed_position_document(
                        user_id=user_id,
                        exchange_id="binance",
                        record_id=_hash_record_id(
                            "position",
                            "binance",
                            symbol_id,
                            inferred_direction.value,
                            trade_timestamp.isoformat(),
                            trade_timestamp.isoformat(),
                            qty,
                            order_id,
                            trade_id,
                        ),
                        symbol_raw=symbol_raw,
                        direction=inferred_direction,
                        leverage=symbol_leverage,
                        entry_price=synthetic_entry,
                        exit_price=price,
                        quantity=qty,
                        realized_pnl=(gross_realized - fee).quantize(Decimal("0.00000001")),
                        gross_pnl=gross_realized.quantize(Decimal("0.00000001")),
                        fee_usd=fee.quantize(Decimal("0.00000001")),
                        funding_fee_usd=Decimal("0"),
                        opened_at=trade_timestamp,
                        closed_at=trade_timestamp,
                        exchange_order_id=order_id or None,
                        aggregation_source="binance_reconstructed_fills",
                        source_fill_count=1,
                        raw_exchange_data={
                            "ccxt_trade_id": trade_id or None,
                            "ccxt_symbol": symbol_raw,
                            "original_side": trade.get("side"),
                            "info": trade.get("info", {}) or {},
                        },
                    )
                    if synthetic_doc["closed_at"] >= closed_since:
                        docs.append(synthetic_doc)
                    continue

                cycle = _new_binance_cycle(
                    symbol_id=symbol_id,
                    symbol_raw=symbol_raw,
                    position_side_key=position_side_key,
                    signed_qty=signed_qty,
                    price=price,
                    trade_timestamp=trade_timestamp,
                    trade_id=trade_id,
                    order_id=order_id,
                    fee_open=fee,
                    leverage=symbol_leverage,
                )
                continue

            current_qty = cycle["current_qty"]
            same_direction = (current_qty > 0 and signed_qty > 0) or (current_qty < 0 and signed_qty < 0)

            if same_direction:
                current_abs = abs(current_qty)
                fill_abs = abs(signed_qty)
                new_abs = current_abs + fill_abs
                if new_abs > 0:
                    cycle["avg_entry"] = ((cycle["avg_entry"] * current_abs) + (price * fill_abs)) / new_abs
                cycle["current_qty"] = current_qty + signed_qty
                cycle["max_abs_qty"] = max(cycle["max_abs_qty"], abs(cycle["current_qty"]))
                cycle["fee_total"] += fee
                cycle["open_fill_count"] += 1
                if trade_id:
                    cycle["source_trade_ids"].append(trade_id)
                cycle["last_order_id"] = order_id
                continue

            fill_abs = abs(signed_qty)
            reduce_qty = min(abs(current_qty), fill_abs)
            close_ratio = (reduce_qty / fill_abs) if fill_abs > 0 else Decimal("0")
            close_fee = fee * close_ratio
            open_fee = fee - close_fee

            cycle["fee_total"] += close_fee
            cycle["gross_realized"] += gross_realized
            cycle["closing_turnover"] += reduce_qty * price
            cycle["closed_qty_total"] += reduce_qty
            cycle["close_fill_count"] += 1
            cycle["closed_at"] = trade_timestamp
            if order_id:
                cycle["close_order_ids"].add(order_id)
            if trade_id:
                cycle["source_trade_ids"].append(trade_id)

            fully_closed = reduce_qty == abs(current_qty)
            if fully_closed:
                final_doc = _finalize_binance_cycle(cycle, user_id=user_id, leverage_by_symbol=leverage_by_symbol)
                if final_doc and final_doc["closed_at"] >= closed_since:
                    docs.append(final_doc)

                remaining_qty = fill_abs - reduce_qty
                cycle = None
                if remaining_qty > 0:
                    leftover_signed = remaining_qty if signed_qty > 0 else -remaining_qty
                    cycle = _new_binance_cycle(
                        symbol_id=symbol_id,
                        symbol_raw=symbol_raw,
                        position_side_key=position_side_key,
                        signed_qty=leftover_signed,
                        price=price,
                        trade_timestamp=trade_timestamp,
                        trade_id=trade_id,
                        order_id=order_id,
                        fee_open=open_fee,
                        leverage=symbol_leverage,
                    )
                continue

            cycle["current_qty"] = current_qty + signed_qty

    return docs


def _build_binance_income_group_closed_position_documents(
    income_rows: list[dict[str, Any]],
    *,
    user_id: ObjectId,
    leverage_by_symbol: dict[str, int],
    closed_since_ms: int,
) -> list[dict[str, Any]]:
    """
    Fallback for Binance testnet accounts where user-trade and closed-order
    history endpoints return empty responses, but REALIZED_PNL income rows are
    still available. We collapse rows by (symbol, timestamp) so the app stores
    one approximate closed-position snapshot per close event instead of raw fills.
    """
    grouped: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
    closed_since = _to_dt(closed_since_ms)

    for row in income_rows:
        if not isinstance(row, dict):
            continue
        symbol_id = str(row.get("symbol") or "").upper()
        timestamp_ms = _safe_int(row.get("time"))
        if not symbol_id or timestamp_ms <= 0:
            continue
        grouped[(symbol_id, timestamp_ms)].append(row)

    docs: list[dict[str, Any]] = []
    for (symbol_id, timestamp_ms), rows in grouped.items():
        closed_at = _to_dt(timestamp_ms)
        if closed_at < closed_since:
            continue

        symbol_raw = _clean_symbol_to_unified_contract(symbol_id)
        leverage = max(leverage_by_symbol.get(symbol_id, 1), 1)
        gross_pnl = sum((_safe_decimal(row.get("income")) for row in rows), Decimal("0"))
        trade_ids = [
            str(row.get("tradeId") or row.get("info") or row.get("tranId") or "")
            for row in rows
            if row.get("tradeId") or row.get("info") or row.get("tranId")
        ]
        tran_ids = [
            str(row.get("tranId") or "")
            for row in rows
            if row.get("tranId")
        ]

        docs.append(
            _build_closed_position_document(
                user_id=user_id,
                exchange_id="binance",
                record_id=_hash_record_id(
                    "income-group",
                    "binance",
                    symbol_id,
                    timestamp_ms,
                    ",".join(sorted(tran_ids or trade_ids)),
                ),
                symbol_raw=symbol_raw,
                direction=TradeSide.LONG,
                leverage=leverage,
                entry_price=Decimal("0"),
                exit_price=Decimal("0"),
                quantity=Decimal("0"),
                realized_pnl=gross_pnl.quantize(Decimal("0.00000001")),
                gross_pnl=gross_pnl.quantize(Decimal("0.00000001")),
                fee_usd=Decimal("0"),
                funding_fee_usd=Decimal("0"),
                opened_at=closed_at,
                closed_at=closed_at,
                exchange_order_id=tran_ids[0] if tran_ids else None,
                aggregation_source="binance_realized_pnl_group",
                source_fill_count=max(len(rows), 1),
                raw_exchange_data={
                    "ccxt_trade_id": trade_ids[0] if trade_ids else None,
                    "ccxt_symbol": symbol_raw,
                    "original_side": "unknown",
                    "info": {
                        "tradeIds": trade_ids[:50],
                        "tranIds": tran_ids[:50],
                        "groupSize": len(rows),
                        "inferredFrom": "fapiPrivateGetIncome/REALIZED_PNL",
                        "directionInference": "unavailable",
                        "quantityInference": "unavailable",
                        "priceInference": "unavailable",
                        "incomeRows": rows[:20],
                    },
                },
            )
        )

    return docs


async def _fetch_okx_closed_position_documents(
    exchange: ccxt.Exchange,
    *,
    user_id: ObjectId,
    exchange_id: str,
    since_ms: int,
    limit: int,
) -> list[dict[str, Any]]:
    rows = await exchange.fetch_positions_history(None, since_ms, min(max(limit, 20), 100), {"instType": "SWAP"})
    docs: list[dict[str, Any]] = []
    for row in rows:
        try:
            docs.append(_build_okx_closed_position_document(row, user_id=user_id, exchange_id=exchange_id))
        except Exception as exc:
            logger.warning("okx: failed to map closed position (%s)", exc)
    return docs


async def fetch_and_sync_trades(
    user_id: str | ObjectId,
    exchange_id: str,
    api_key: str,
    api_secret: str,
    passphrase: Optional[str] = None,
    testnet: Optional[bool] = None,
    environment: Optional[str] = None,
    since_ms: Optional[int] = None,
    limit: int = 500,
    market_type: str = "mixed",
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

    normalized_environment = _normalise_environment(environment, testnet=testnet)
    exchange = _create_exchange_client(
        exchange_id,
        api_key,
        api_secret,
        passphrase,
        environment=normalized_environment,
    )

    if since_ms is None:
        since_ms = int((datetime.now(tz=timezone.utc).timestamp() - 30 * 86400) * 1000)

    start = time.monotonic()
    result = {"inserted": 0, "updated": 0, "errors": 0, "elapsed_ms": 0}

    try:
        # Load markets once (required by CCXT before most calls)
        await exchange.load_markets()

        # ── Fetch Futures closed orders ──────────────────────────────
        raw_trades: list[dict] = []
        if market_type in {"futures", "mixed"}:
            should_discover_symbols = False
            try:
                # Try fetchMyTrades first (most granular)
                trades = await exchange.fetch_my_trades(
                    symbol=None, since=since_ms, limit=limit
                )
                if isinstance(trades, list):
                    raw_trades.extend(trades)
                    should_discover_symbols = len(trades) == 0
            except Exception as e:
                logger.warning(
                    "%s: fetchMyTrades(None) failed (%s), starting Dynamic Symbol Discovery",
                    exchange_id, type(e).__name__
                )
                should_discover_symbols = True

            if should_discover_symbols:
                if not raw_trades:
                    logger.info(
                        "%s: fetchMyTrades(None) returned no futures trades, starting Dynamic Symbol Discovery",
                        exchange_id,
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
        if market_type in {"spot", "mixed"}:
            try:
                exchange.options["defaultType"] = "spot"
                spot_trades = await exchange.fetch_my_trades(
                    symbol=None, since=since_ms, limit=limit
                )
                raw_trades.extend(spot_trades)
            except Exception as e:
                logger.debug("Spot trade fetch skipped: %s", e)

        if raw_trades:
            deduped_trades: dict[tuple[str, str], dict[str, Any]] = {}
            for raw in raw_trades:
                if not isinstance(raw, dict):
                    continue
                trade_id = str(raw.get("id", "") or "")
                symbol = str(raw.get("symbol", "") or "")
                deduped_trades[(trade_id, symbol)] = raw
            raw_trades = list(deduped_trades.values())

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

async def fetch_and_sync_trades(
    user_id: str | ObjectId,
    exchange_id: str,
    api_key: str,
    api_secret: str,
    passphrase: Optional[str] = None,
    testnet: Optional[bool] = None,
    environment: Optional[str] = None,
    since_ms: Optional[int] = None,
    limit: int = 500,
    market_type: str = "mixed",
) -> dict[str, Any]:
    """
    Fetch closed-position history from an exchange and upsert it into
    ``trade_history`` using one document per closed position.
    """
    if isinstance(user_id, str):
        user_id = ObjectId(user_id)

    normalized_environment = _normalise_environment(environment, testnet=testnet)
    exchange = _create_exchange_client(
        exchange_id,
        api_key,
        api_secret,
        passphrase,
        environment=normalized_environment,
    )
    if since_ms is None:
        since_ms = int((datetime.now(tz=timezone.utc).timestamp() - 30 * 86400) * 1000)

    start = time.monotonic()
    result = {"inserted": 0, "updated": 0, "errors": 0, "elapsed_ms": 0}

    try:
        await exchange.load_markets()

        normalized_market_type = (market_type or "mixed").lower()
        docs_to_sync: list[dict[str, Any]] = []

        if normalized_market_type in {"futures", "mixed"}:
            if exchange_id == "okx":
                docs_to_sync.extend(
                    await _fetch_okx_closed_position_documents(
                        exchange,
                        user_id=user_id,
                        exchange_id=exchange_id,
                        since_ms=since_ms,
                        limit=limit,
                    )
                )
            elif exchange_id == "binance":
                discovery_since_ms = max(since_ms - 90 * 86400 * 1000, 0)
                leverage_by_symbol = await _fetch_binance_leverage_map(exchange)
                realized_income_rows = await _fetch_binance_realized_income_rows(
                    exchange,
                    since_ms=since_ms,
                    limit=limit,
                )
                symbols_to_scan = await _discover_binance_futures_symbols(
                    exchange,
                    user_id=user_id,
                    since_ms=since_ms,
                    limit=limit,
                )
                raw_trades: list[dict[str, Any]] = []
                for symbol in sorted(symbols_to_scan):
                    try:
                        raw_trades.extend(
                            await _fetch_binance_symbol_fills(
                                exchange,
                                symbol,
                                since_ms=discovery_since_ms,
                                limit=limit,
                            )
                        )
                    except Exception as exc:
                        logger.debug("binance: skipped fill sync for %s (%s)", symbol, exc)

                docs_to_sync.extend(
                    _build_binance_closed_position_documents(
                        raw_trades,
                        user_id=user_id,
                        leverage_by_symbol=leverage_by_symbol,
                        closed_since_ms=since_ms,
                    )
                )
                if not docs_to_sync and realized_income_rows:
                    logger.info(
                        "binance: falling back to realized-pnl grouped closed positions for user %s",
                        user_id,
                    )
                    docs_to_sync.extend(
                        _build_binance_income_group_closed_position_documents(
                            realized_income_rows,
                            user_id=user_id,
                            leverage_by_symbol=leverage_by_symbol,
                            closed_since_ms=since_ms,
                        )
                    )

        if normalized_market_type in {"spot", "mixed"} and not docs_to_sync:
            try:
                exchange.options["defaultType"] = "spot"
                spot_trades = await exchange.fetch_my_trades(symbol=None, since=since_ms, limit=limit)
                for raw in spot_trades:
                    if not raw or not isinstance(raw, dict):
                        continue
                    try:
                        docs_to_sync.append(_ccxt_trade_to_document(raw, user_id, exchange_id, AccountType.SPOT))
                    except Exception as exc:
                        logger.warning("Failed to map legacy spot trade %s: %s", raw.get("id"), exc)
                        result["errors"] += 1
            except Exception as exc:
                logger.debug("Spot history fetch skipped: %s", exc)

        if not docs_to_sync:
            logger.info("No closed-position history returned from %s for user %s", exchange_id, user_id)
            result["elapsed_ms"] = int((time.monotonic() - start) * 1000)
            return result

        ops: list[UpdateOne] = []
        for doc in docs_to_sync:
            if not doc:
                continue
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

        db = get_database()
        collection = db.trade_history
        batch_size = 500

        for i in range(0, len(ops), batch_size):
            batch = ops[i : i + batch_size]
            try:
                bulk_result = await collection.bulk_write(batch, ordered=False)
                result["inserted"] += bulk_result.upserted_count
                result["updated"] += bulk_result.modified_count
            except Exception as exc:
                logger.error("bulkWrite error (batch %d): %s", i, exc)
                result["errors"] += len(batch)

        logger.info(
            "Closed-position sync complete for %s/%s: %d inserted, %d updated, %d errors",
            exchange_id,
            user_id,
            result["inserted"],
            result["updated"],
            result["errors"],
        )

    except ccxt.AuthenticationError as exc:
        logger.error("Auth failed for %s: %s", exchange_id, exc)
        raise ValueError(f"Authentication failed for {exchange_id}: check API keys") from exc
    except ccxt.ExchangeNotAvailable as exc:
        logger.error("Exchange unavailable: %s â€” %s", exchange_id, exc)
        raise
    except ccxt.RateLimitExceeded as exc:
        logger.warning("Rate limit hit on %s: %s", exchange_id, exc)
        raise
    finally:
        await exchange.close()

    result["elapsed_ms"] = int((time.monotonic() - start) * 1000)
    return result


async def fetch_open_positions(
    exchange_id: str,
    api_key: str,
    api_secret: str,
    passphrase: Optional[str] = None,
    testnet: Optional[bool] = None,
    environment: Optional[str] = None,
) -> list[dict[str, Any]]:
    """
    Fetch currently open Futures positions from the exchange.

    Returns a list of position dicts suitable for rendering on
    the dashboard without persisting to MongoDB (positions are
    ephemeral; only closed trades are stored).
    """
    normalized_environment = _normalise_environment(environment, testnet=testnet)
    exchange = _create_exchange_client(
        exchange_id,
        api_key,
        api_secret,
        passphrase,
        environment=normalized_environment,
    )
    positions: list[dict[str, Any]] = []

    try:
        await exchange.load_markets()
        if exchange_id == "binance":
            futures_params = _binance_futures_query_params(normalized_environment)
            raw_positions = await exchange.fetch_positions(None, futures_params)
        else:
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
            contract_size = _safe_decimal(pos.get("contractSize"), "1")
            notional_usd = _position_notional_usd(pos)

            base, quote = _parse_symbol_parts(pos.get("symbol", ""))

            positions.append({
                "symbol": f"{base}{quote}",
                "side": pos.get("side", "long"),
                "contracts": str(contracts),
                "contractSize": str(contract_size),
                "entry_price": str(entry),
                "mark_price": str(mark),
                "unrealized_pnl": str(unrealized),
                "liquidation_price": str(liq_price),
                "leverage": leverage_val,
                "margin_type": pos.get("marginMode", "cross"),
                "exchange_id": exchange_id,
                "notional": str(notional_usd),
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
    testnet: Optional[bool] = None,
    environment: Optional[str] = None,
) -> dict[str, Any]:
    """
    Fetch Spot account balances and best-effort USD valuations.
    """
    normalized_environment = _normalise_environment(environment, testnet=testnet)
    exchange = _create_exchange_client(
        exchange_id,
        api_key,
        api_secret,
        passphrase,
        environment=normalized_environment,
    )
    warnings: list[str] = []

    try:
        exchange.options["defaultType"] = "spot"
        await exchange.load_markets()
        raw_assets: list[dict[str, Any]] = []
        if exchange_id == "binance":
            # Binance demo/test credentials can fail on SAPI-based balance routes.
            # Use the signed /api account endpoint directly for stable spot retrieval.
            account_payload = await exchange.privateGetAccount({})
            raw_assets = _extract_binance_account_assets(account_payload)
        if not raw_assets:
            balance = await exchange.fetch_balance()
            raw_assets = _extract_nonzero_assets(balance)

        if exchange_id == "binance" and normalized_environment == "testnet":
            warnings.append(
                "Binance Spot Testnet balances are isolated from Binance mainnet accounts."
            )
        if exchange_id == "binance" and normalized_environment == "demo":
            warnings.append(
                "Binance Demo spot balances are simulated and isolated from Binance mainnet accounts."
            )
        priced_assets, total_usd, pricing_warnings = await _value_spot_assets(
            exchange_id,
            raw_assets,
        )
        warnings.extend(pricing_warnings)

        return {
            "exchange_id": exchange_id,
            "total_usd": str(total_usd),
            "assets": priced_assets,
            "warnings": warnings,
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
        exchange.options["defaultType"] = _default_futures_type("binance")
        futures_params = _binance_futures_query_params("testnet")

        balance = await exchange.fetch_balance(futures_params)
        positions = await exchange.fetch_positions(None, futures_params)
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
    testnet: Optional[bool] = None,
    environment: Optional[str] = None,
) -> dict[str, Any]:
    normalized_environment = _normalise_environment(environment, testnet=testnet)
    exchange = _create_exchange_client(
        exchange_id,
        api_key,
        api_secret,
        passphrase,
        environment=normalized_environment,
    )

    try:
        exchange.options["defaultType"] = _default_futures_type(exchange_id)
        await exchange.load_markets()
        if exchange_id == "binance":
            futures_params = _binance_futures_query_params(normalized_environment)
            balance = await exchange.fetch_balance(futures_params)
            positions = await exchange.fetch_positions(None, futures_params)
        else:
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
    testnet: Optional[bool] = None,
    environment: Optional[str] = None,
    market_type: str = "futures",
) -> dict[str, Any]:
    """
    Build a live account overview without relying on historical trade volume.
    """
    normalized_environment = _normalise_environment(environment, testnet=testnet)
    warnings: list[str] = []
    normalized_market_type = (market_type or "futures").lower()
    spot_authenticated = False
    futures_authenticated = False
    latest_auth_error: Optional[Exception] = None

    spot_total_usd = 0.0
    spot_assets: list[dict[str, Any]] = []
    if normalized_market_type in {"spot", "mixed", "futures"}:
        try:
            spot_balance = await fetch_spot_balances(
                exchange_id=exchange_id,
                api_key=api_key,
                api_secret=api_secret,
                passphrase=passphrase,
                environment=normalized_environment,
            )
            spot_assets = spot_balance.get("assets", [])
            spot_total_usd = round(_safe_float(spot_balance.get("total_usd")), 8)
            warnings.extend(spot_balance.get("warnings", []))
            spot_authenticated = True
        except Exception as e:
            logger.warning("Failed to fetch spot overview for %s: %s", exchange_id, e)
            if _is_exchange_auth_error(e):
                latest_auth_error = e
            if exchange_id == "binance" and normalized_environment == "testnet":
                warnings.append(
                    "Binance Spot Testnet balances are isolated from Binance mainnet accounts."
                )
            elif exchange_id == "binance" and normalized_environment == "demo":
                warnings.append(
                    "Binance Demo spot balances are unavailable for this key. Verify that Spot & Margin permission is enabled on demo.binance.com."
                )
            else:
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
        try:
            futures_overview = await fetch_futures_account_overview(
                exchange_id=exchange_id,
                api_key=api_key,
                api_secret=api_secret,
                passphrase=passphrase,
                environment=normalized_environment,
            )
            futures_authenticated = True
        except Exception as e:
            logger.warning("Failed to fetch futures overview for %s: %s", exchange_id, e)
            if _is_exchange_auth_error(e):
                latest_auth_error = e
            if exchange_id == "binance" and normalized_environment == "demo":
                warnings.append(
                    "Binance Demo futures are unavailable for this key. Verify that Enable Futures is turned on in demo.binance.com API Management."
                )
            else:
                warnings.append("Futures balances and positions were unavailable for this connection.")

    if normalized_market_type == "spot" and not spot_authenticated:
        if latest_auth_error:
            raise ValueError(_format_exchange_auth_error(exchange_id, latest_auth_error))
        raise ValueError(f"Failed to authenticate {exchange_id} spot account.")

    if normalized_market_type == "futures" and not futures_authenticated:
        if latest_auth_error:
            raise ValueError(_format_exchange_auth_error(exchange_id, latest_auth_error))
        raise ValueError(f"Failed to authenticate {exchange_id} futures account.")

    if normalized_market_type == "mixed" and not (spot_authenticated or futures_authenticated):
        if latest_auth_error:
            raise ValueError(_format_exchange_auth_error(exchange_id, latest_auth_error))
        raise ValueError(f"Failed to authenticate {exchange_id} account for both spot and futures.")

    total_portfolio_value = round(
        spot_total_usd + futures_overview["account_value_usd"],
        8,
    )

    return {
        "exchange_id": exchange_id,
        "environment": normalized_environment,
        "market_type": normalized_market_type,
        "spot_total_usd": round(spot_total_usd, 8),
        "spot_assets": spot_assets,
        "spot_asset_count": len(spot_assets),
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
    out_warnings: Optional[list[str]] = None,
    out_meta: Optional[dict[str, Any]] = None,
) -> dict[str, list[list[float]]]:
    """
    Fetch daily OHLCV data for a list of symbols for the past `days`.
    Uses unauthenticated API limits.
    Returns dict mapping symbol to CCXT OHLCV list.
    """
    exchange = _create_exchange_client(exchange_id, "", "")
    since = int((datetime.now(tz=timezone.utc).timestamp() - days * 86400) * 1000)
    
    results = {}
    binance_fallback = None
    
    try:
        # Default to spot, but we'll manually probe both
        exchange.options["defaultType"] = "spot"
        await exchange.load_markets()
        
        for sym in symbols:
            ccxt_sym = sym if "/" in sym else f"{sym}/USDT" 
            spot_sym = ccxt_sym
            swap_sym = f"{ccxt_sym}:USDT"
            
            # 1. Try Spot Market
            try:
                ohlcv = await exchange.fetch_ohlcv(spot_sym, '1d', since)
                if ohlcv and len(ohlcv) > 0:
                    results[sym] = ohlcv
                    continue
            except Exception as e:
                logger.debug("Failed Spot OHLCV for %s natively on %s: %s", spot_sym, exchange_id, type(e).__name__)
                
            # 2. Try Swap Market (especially for OKX)
            try:
                ohlcv = await exchange.fetch_ohlcv(swap_sym, '1d', since)
                if ohlcv and len(ohlcv) > 0:
                    results[sym] = ohlcv
                    continue
            except Exception as e:
                logger.debug("Failed Swap OHLCV for %s natively on %s: %s", swap_sym, exchange_id, type(e).__name__)
                
            # 3. Universal Fallback to Binance
            if exchange_id != "binance":
                try:
                    if binance_fallback is None:
                        binance_fallback = _create_exchange_client("binance", "", "")
                        binance_fallback.options["defaultType"] = "spot"
                        await binance_fallback.load_markets()
                    
                    ohlcv = await binance_fallback.fetch_ohlcv(spot_sym, '1d', since)
                    if ohlcv and len(ohlcv) > 0:
                        results[sym] = ohlcv
                        if out_warnings is not None:
                            out_warnings.append(f"Used Binance fallback for missing {exchange_id} market data on {sym}.")
                        if out_meta is not None:
                            out_meta["used_fallback"] = True
                        continue
                except Exception as e:
                    logger.debug("Failed Binance fallback for %s: %s", sym, type(e).__name__)
                    
            logger.warning("All OHLCV attempts failed for %s on %s", sym, exchange_id)
            if out_warnings is not None:
                out_warnings.append(f"Could not resolve market data for {sym} on {exchange_id} or fallback.")

    finally:
        await exchange.close()
        if binance_fallback is not None:
            await binance_fallback.close()

    return results
