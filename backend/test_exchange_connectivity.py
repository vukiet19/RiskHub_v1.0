"""
RiskHub -- Exchange Connectivity Test Suite
============================================
Standalone script that validates Binance Testnet connectivity in 7 stages:
  1. CCXT client creation & sandbox mode
  2. Market loading (load_markets)
  3. Futures balance fetch
  4. Spot balance fetch
  5. Futures positions fetch
  6. Trade history fetch (fetchMyTrades)
  7. Full integration with MongoDB

Usage:
  python test_exchange_connectivity.py
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone

# Force UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# -- Configure logging -------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("connectivity_test")

# Suppress noisy CCXT debug logs
logging.getLogger("ccxt").setLevel(logging.WARNING)

# -- Your Binance Testnet credentials ----------------------------------------
# Option A: set environment variables BINANCE_TESTNET_KEY / BINANCE_TESTNET_SECRET
# Option B: paste them here (NEVER commit real keys!)
API_KEY = os.getenv("BINANCE_TESTNET_KEY", "")
API_SECRET = os.getenv("BINANCE_TESTNET_SECRET", "")


# =============================================================================
#  Test helpers
# =============================================================================

class TestResult:
    def __init__(self, name: str):
        self.name = name
        self.passed = False
        self.message = ""
        self.data = None
        self.elapsed_ms = 0

    def __str__(self):
        icon = "[PASS]" if self.passed else "[FAIL]"
        return f"  {icon}  {self.name} ({self.elapsed_ms}ms) -- {self.message}"


results: list[TestResult] = []


async def run_test(name: str, coro):
    """Wrap a coroutine as a named test with timing."""
    t = TestResult(name)
    start = time.monotonic()
    try:
        data = await coro
        t.passed = True
        t.message = "OK"
        t.data = data
    except Exception as e:
        t.passed = False
        t.message = f"{type(e).__name__}: {e}"
    t.elapsed_ms = int((time.monotonic() - start) * 1000)
    results.append(t)
    print(t)
    return t


# =============================================================================
#  Main Test Sequence
# =============================================================================

async def main():
    import ccxt.async_support as ccxt

    print()
    print("=" * 65)
    print("  RiskHub -- Exchange Connectivity Test")
    print("  Target: Binance Testnet (Futures Sandbox)")
    print(f"  Time:   {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 65)
    print()

    if not API_KEY or not API_SECRET:
        print("[FAIL]  No API credentials found!")
        print("    Set environment variables:")
        print("      set BINANCE_TESTNET_KEY=your_key")
        print("      set BINANCE_TESTNET_SECRET=your_secret")
        print("    Or edit API_KEY / API_SECRET in this script.")
        sys.exit(1)

    print(f"  API Key:    {API_KEY[:8]}...{API_KEY[-4:]}")
    print(f"  API Secret: {API_SECRET[:4]}...{API_SECRET[-4:]}")
    print()

    exchange = None

    try:
        # ----------------------------------------------------------------
        # TEST 1: Create CCXT client in sandbox mode
        # ----------------------------------------------------------------
        print("--- Stage 1: Client Creation --------------------------")

        async def test_create_client():
            nonlocal exchange
            exchange = ccxt.binance({
                "apiKey": API_KEY,
                "secret": API_SECRET,
                "enableRateLimit": True,
                "options": {
                    "defaultType": "future",
                    "adjustForTimeDifference": True,
                    "disableFuturesSandboxWarning": True,
                },
            })
            exchange.set_sandbox_mode(True)

            return {
                "id": exchange.id,
                "sandbox": "enabled",
                "rateLimit": exchange.rateLimit,
            }

        t1 = await run_test("Create CCXT Binance client (sandbox)", test_create_client())
        if not t1.passed:
            print("\n[STOP] Cannot proceed without a client. Aborting.\n")
            return

        # ----------------------------------------------------------------
        # TEST 2: Load markets
        # ----------------------------------------------------------------
        print("\n--- Stage 2: Load Markets -----------------------------")

        async def test_load_markets():
            markets = await exchange.load_markets()
            futures_count = sum(1 for m in markets.values() if m.get("swap") or m.get("future"))
            spot_count = sum(1 for m in markets.values() if m.get("spot"))
            return {
                "total_markets": len(markets),
                "futures_markets": futures_count,
                "spot_markets": spot_count,
                "sample_symbols": list(markets.keys())[:5],
            }

        t2 = await run_test("Load exchange markets", test_load_markets())
        if t2.passed and t2.data:
            print(f"       -> {t2.data['total_markets']} markets loaded "
                  f"({t2.data['futures_markets']} futures, {t2.data['spot_markets']} spot)")

        # ----------------------------------------------------------------
        # TEST 3: Fetch Futures balance
        # ----------------------------------------------------------------
        print("\n--- Stage 3: Fetch Futures Balance --------------------")

        async def test_futures_balance():
            exchange.options["defaultType"] = "future"
            balance = await exchange.fetch_balance()
            # Summarise non-zero assets
            assets = {}
            for asset, amt in balance.get("total", {}).items():
                if float(amt) > 0:
                    assets[asset] = {
                        "total": float(amt),
                        "free": float(balance["free"].get(asset, 0)),
                        "used": float(balance["used"].get(asset, 0)),
                    }
            return {"non_zero_assets": assets, "asset_count": len(assets)}

        t3 = await run_test("Fetch Futures account balance", test_futures_balance())
        if t3.passed and t3.data:
            if t3.data["asset_count"] > 0:
                print(f"       -> Found {t3.data['asset_count']} asset(s) with balance:")
                for asset, info in t3.data["non_zero_assets"].items():
                    print(f"         {asset}: total={info['total']}, free={info['free']}, used={info['used']}")
            else:
                print("       -> No assets with non-zero balance (normal for fresh testnet)")

        # ----------------------------------------------------------------
        # TEST 4: Fetch Spot balance
        # ----------------------------------------------------------------
        print("\n--- Stage 4: Fetch Spot Balance -----------------------")

        async def test_spot_balance():
            exchange.options["defaultType"] = "spot"
            try:
                balance = await exchange.fetch_balance()
            except Exception as e:
                # Binance Futures Testnet keys often fail on Spot Testnet
                return {"skipped": True, "msg": "API key is for Futures Testnet, Spot is separate"}
            assets = {}
            for asset, amt in balance.get("total", {}).items():
                if float(amt) > 0:
                    assets[asset] = float(amt)
            return {"non_zero_assets": assets}

        t4 = await run_test("Fetch Spot account balance", test_spot_balance())
        if t4.passed and t4.data:
            if t4.data.get("skipped"):
                print(f"       -> Skipped: {t4.data['msg']}")
            elif t4.data.get("non_zero_assets"):
                print(f"       -> Spot assets: {t4.data['non_zero_assets']}")
            else:
                print("       -> No spot assets (normal for testnet)")

        # ----------------------------------------------------------------
        # TEST 5: Fetch open Futures positions
        # ----------------------------------------------------------------
        print("\n--- Stage 5: Fetch Open Positions --------------------")

        async def test_positions():
            exchange.options["defaultType"] = "future"
            positions = await exchange.fetch_positions()
            active = [p for p in positions if float(p.get("contracts", 0)) != 0]
            return {
                "raw_count": len(positions),
                "active_count": len(active),
                "active_symbols": [p["symbol"] for p in active],
            }

        t5 = await run_test("Fetch open Futures positions", test_positions())
        if t5.passed and t5.data:
            print(f"       -> {t5.data['active_count']} active position(s) "
                  f"out of {t5.data['raw_count']} returned")
            if t5.data["active_symbols"]:
                print(f"       -> Active: {t5.data['active_symbols']}")

        # ----------------------------------------------------------------
        # TEST 6: Fetch trade history (last 30 days)
        # ----------------------------------------------------------------
        print("\n--- Stage 6: Fetch Trade History ----------------------")

        since_ms = int((datetime.now(tz=timezone.utc).timestamp() - 30 * 86400) * 1000)

        async def test_trades_all():
            """Try fetchMyTrades with symbol=None first."""
            exchange.options["defaultType"] = "future"
            try:
                trades = await exchange.fetch_my_trades(
                    symbol=None, since=since_ms, limit=100
                )
                return {"supported": True, "count": len(trades), "trades": trades[:3]}
            except Exception as e:
                return {"supported": False, "msg": "CCXT Binance requires a symbol"}

        t6 = await run_test("Fetch trades (symbol=None)", test_trades_all())

        # If symbol=None is not supported, do per-symbol scan
        if t6.passed and not t6.data.get("supported"):
            print("       -> symbol=None not supported, trying per-symbol scan...")
            symbols_to_try = [
                "BTC/USDT:USDT", "ETH/USDT:USDT",
                "SOL/USDT:USDT", "BNB/USDT:USDT",
            ]
            total_found = 0
            for sym in symbols_to_try:
                async def test_trades_sym(s=sym):
                    exchange.options["defaultType"] = "future"
                    trades = await exchange.fetch_my_trades(
                        symbol=s, since=since_ms, limit=50
                    )
                    return {
                        "symbol": s,
                        "count": len(trades),
                        "sample": trades[0] if trades else None,
                    }

                t = await run_test(f"Fetch trades for {sym}", test_trades_sym())
                if t.passed and t.data and t.data["count"] > 0:
                    total_found += t.data["count"]
                    print(f"       -> Found {t.data['count']} trade(s) for {sym}")

            if total_found == 0:
                print("       [!] No trades found. Make some test trades on Binance Testnet first!")
        elif t6.passed and t6.data:
            print(f"       -> Found {t6.data['count']} trade(s) in last 30 days")
            if t6.data["trades"]:
                sample = t6.data["trades"][0]
                print(f"       -> Sample: {sample.get('symbol')} {sample.get('side')} "
                      f"amt={sample.get('amount')} price={sample.get('price')}")

        # ----------------------------------------------------------------
        # TEST 7: Full integration -- fetch_and_sync_trades (needs MongoDB)
        # ----------------------------------------------------------------
        print("\n--- Stage 7: Full Sync Integration (needs MongoDB) ---")

        async def test_full_sync():
            from database import connect_to_mongo, close_mongo_connection
            from services.exchange_service import fetch_and_sync_trades

            await connect_to_mongo()
            try:
                result = await fetch_and_sync_trades(
                    user_id="64f1a2b3c4d5e6f7a8b9c0d1",
                    exchange_id="binance",
                    api_key=API_KEY,
                    api_secret=API_SECRET,
                    testnet=True,
                )
                return result
            finally:
                await close_mongo_connection()

        t7 = await run_test("Full trade sync -> MongoDB", test_full_sync())
        if t7.passed and t7.data:
            print(f"       -> Inserted: {t7.data['inserted']}, "
                  f"Updated: {t7.data['updated']}, "
                  f"Errors: {t7.data['errors']}, "
                  f"Time: {t7.data['elapsed_ms']}ms")

    finally:
        # Always close the standalone exchange client
        if exchange:
            await exchange.close()

    # -- Summary ----------------------------------------------------------
    print()
    print("=" * 65)
    print("  TEST SUMMARY")
    print("=" * 65)
    passed = sum(1 for r in results if r.passed)
    total = len(results)
    for r in results:
        print(r)
    print()
    print(f"  Result: {passed}/{total} passed")
    if passed == total:
        print("  >>> All tests passed! Exchange connectivity is working. <<<")
    else:
        failed = [r for r in results if not r.passed]
        print(f"  >>> {len(failed)} test(s) failed -- review errors above. <<<")
    print("=" * 65)
    print()


if __name__ == "__main__":
    asyncio.run(main())
