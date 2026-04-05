"""
RiskHub — Quant Engine API Router
===================================
POST /api/v1/engine/run/{user_id}   — Trigger the Behavioral Quant Engine
                                       for a specific user (manual trigger
                                       for testing / on-demand refresh).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from engine.quant_engine import run_quant_engine

logger = logging.getLogger("riskhub.api.engine")

router = APIRouter(prefix="/api/v1/engine", tags=["engine"])


@router.post("/run/{user_id}")
async def trigger_engine(user_id: str):
    """
    Manually trigger the Behavioral Quant Engine for a single user.

    Steps executed:
      1. Fetches last 30 days of trades from ``trade_history``
      2. Computes Max Drawdown, Win Rate, Avg Leverage, Discipline Score
      3. Evaluates all 5 MVP behavioral rules (RQ-001 … RQ-005)
      4. Persists a ``risk_metrics`` snapshot (append-only)
      5. Persists ``alerts_log`` records for triggered rules
         (with 30-min rate-limit guard)

    Returns a JSON summary of all computed metrics and triggered rules.
    """
    try:
        result = await run_quant_engine(user_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Quant Engine failed for user %s", user_id)
        raise HTTPException(status_code=500, detail=f"Engine error: {str(e)}")
