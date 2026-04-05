"""
RiskHub — Trade Sync API Router
================================
POST /api/v1/sync/trades   — Trigger a full trade history sync for a user.
POST /api/v1/sync/positions — Fetch current open positions (ephemeral).
POST /api/v1/sync/balances  — Fetch current spot balances (ephemeral).

All endpoints accept plaintext API keys in the request body for MVP
testing.  In production, the backend will decrypt stored keys from
the ``users.exchange_keys`` array using AES-256-GCM.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.exchange_service import (
    fetch_and_sync_trades,
    fetch_open_positions,
    fetch_spot_balances,
)

logger = logging.getLogger("riskhub.api.sync")

router = APIRouter(prefix="/api/v1/sync", tags=["sync"])


# ── Request / Response schemas ───────────────────────────────────────────

class SyncTradesRequest(BaseModel):
    """Request body for triggering a trade history sync."""
    user_id: str = Field(..., description="MongoDB ObjectId string of the user")
    exchange_id: str = Field(
        ..., description="CCXT exchange identifier (e.g. 'binance', 'okx')"
    )
    api_key: str = Field(..., description="Exchange API key (plaintext for MVP)")
    api_secret: str = Field(..., description="Exchange API secret (plaintext for MVP)")
    passphrase: Optional[str] = Field(
        None, description="Exchange passphrase (required for OKX)"
    )
    since_ms: Optional[int] = Field(
        None,
        description=(
            "Unix-ms timestamp to fetch trades from. "
            "Defaults to last 30 days if omitted."
        ),
    )


class SyncTradesResponse(BaseModel):
    """Summary of a completed trade sync operation."""
    status: str
    inserted: int
    updated: int
    errors: int
    elapsed_ms: int


class PositionsRequest(BaseModel):
    """Request body for fetching open positions."""
    exchange_id: str
    api_key: str
    api_secret: str
    passphrase: Optional[str] = None


class BalancesRequest(BaseModel):
    """Request body for fetching spot balances."""
    exchange_id: str
    api_key: str
    api_secret: str
    passphrase: Optional[str] = None


# ── Endpoints ────────────────────────────────────────────────────────────

@router.post("/trades", response_model=SyncTradesResponse)
async def sync_trades(req: SyncTradesRequest):
    """
    Trigger a full trade history sync for a single user+exchange pair.

    Fetches closed trades via CCXT and upserts them into the
    ``trade_history`` collection using a ``bulkWrite`` with the
    dedup unique index to prevent duplicates.
    """
    try:
        result = await fetch_and_sync_trades(
            user_id=req.user_id,
            exchange_id=req.exchange_id,
            api_key=req.api_key,
            api_secret=req.api_secret,
            passphrase=req.passphrase,
            since_ms=req.since_ms,
        )
        return SyncTradesResponse(
            status="ok",
            inserted=result["inserted"],
            updated=result["updated"],
            errors=result["errors"],
            elapsed_ms=result["elapsed_ms"],
        )
    except ValueError as e:
        # Auth failures, unsupported exchange, etc.
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Unexpected error during trade sync")
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")


@router.post("/positions")
async def get_positions(req: PositionsRequest):
    """
    Fetch currently open Futures positions from the exchange.

    Positions are ephemeral — they are returned directly without
    being persisted to MongoDB.
    """
    try:
        positions = await fetch_open_positions(
            exchange_id=req.exchange_id,
            api_key=req.api_key,
            api_secret=req.api_secret,
            passphrase=req.passphrase,
        )
        return {"status": "ok", "positions": positions, "count": len(positions)}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Failed to fetch positions")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/balances")
async def get_balances(req: BalancesRequest):
    """
    Fetch Spot account balances from the exchange.

    Balances are ephemeral — returned directly without persistence.
    """
    try:
        balances = await fetch_spot_balances(
            exchange_id=req.exchange_id,
            api_key=req.api_key,
            api_secret=req.api_secret,
            passphrase=req.passphrase,
        )
        return {"status": "ok", **balances}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Failed to fetch balances")
        raise HTTPException(status_code=500, detail=str(e))
