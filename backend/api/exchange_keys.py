from __future__ import annotations

import logging
from typing import Any, Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from security import EncryptionConfigError, encrypt_secret
from services.exchange_key_service import (
    delete_exchange_key,
    get_user_exchange_keys,
    sanitize_exchange_key_document,
    upsert_exchange_key,
)
from services.exchange_service import SUPPORTED_EXCHANGES, fetch_account_overview

router = APIRouter(prefix="/api/v1/exchange-keys", tags=["exchange-keys"])
logger = logging.getLogger("riskhub.api.exchange_keys")

SUPPORTED_ENVIRONMENTS = {"mainnet", "testnet"}


class ConnectExchangeRequest(BaseModel):
    exchange_id: str = Field(..., max_length=50)
    environment: str = Field("mainnet", max_length=50)
    market_type: str = Field("mixed", max_length=50)
    label: Optional[str] = Field(None, max_length=120)
    api_key: str = Field(..., min_length=1, max_length=512)
    api_secret: str = Field(..., min_length=1, max_length=512)
    passphrase: Optional[str] = Field(None, max_length=512)

class ExchangeKeysListResponse(BaseModel):
    status: str
    connections: list[dict[str, Any]]
    count: int

class ConnectExchangeResponse(BaseModel):
    status: str
    connection: dict[str, Any]
    validation: dict[str, Any]


class DeleteExchangeResponse(BaseModel):
    status: str
    deleted_count: int
    remaining_count: int


def _parse_user_id(user_id: str) -> ObjectId:
    try:
        return ObjectId(user_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid user_id format") from e

@router.get("/{user_id}", response_model=ExchangeKeysListResponse)
async def list_exchange_keys(user_id: str):
    uid = _parse_user_id(user_id)

    try:
        keys = await get_user_exchange_keys(uid)
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    return ExchangeKeysListResponse(
        status="ok",
        connections=[sanitize_exchange_key_document(key) for key in keys],
        count=len(keys),
    )

@router.post(
    "/{user_id}/connect",
    response_model=ConnectExchangeResponse,
)
async def connect_exchange(user_id: str, req: ConnectExchangeRequest):
    uid = _parse_user_id(user_id)
    exchange_id = req.exchange_id.strip().lower()
    environment = req.environment.strip().lower()
    market_type = req.market_type.strip().lower()
    
    allowed_environments = set(SUPPORTED_ENVIRONMENTS)
    if exchange_id == "binance":
        allowed_environments.add("demo")
    if environment not in allowed_environments:
        allowed = ", ".join(sorted(allowed_environments))
        raise HTTPException(
            status_code=400,
            detail=f"Environment '{environment}' is not supported for {exchange_id}. Supported: {allowed}.",
        )
    if market_type not in ["futures", "spot", "mixed"]:
        raise HTTPException(status_code=400, detail=f"Market type '{market_type}' is not supported.")
    
    if exchange_id not in SUPPORTED_EXCHANGES:
        raise HTTPException(status_code=400, detail=f"Exchange '{exchange_id}' is not supported.")
        
    api_key = "".join(req.api_key.split())
    api_secret = "".join(req.api_secret.split())
    passphrase = req.passphrase.strip() if req.passphrase else None

    if not api_key or not api_secret:
        raise HTTPException(status_code=400, detail="API key and API secret are required.")
    
    label = (req.label or "").strip() or f"{exchange_id.capitalize()} {environment.capitalize()} {market_type.capitalize()}"

    try:
        validation = await fetch_account_overview(
            exchange_id,
            api_key,
            api_secret,
            passphrase,
            environment=environment,
            market_type=market_type,
        )
        
        stored_key = await upsert_exchange_key(
            uid,
            exchange_id=exchange_id,
            environment=environment,
            market_type=market_type,
            key_doc={
                "label": label,
                "api_key_encrypted": encrypt_secret(api_key),
                "api_secret_encrypted": encrypt_secret(api_secret),
                "passphrase_encrypted": encrypt_secret(passphrase) if passphrase else None,
                "permissions_verified": ["read"],
                "is_active": True,
                "last_sync_at": None,
                "last_sync_status": "ok",
                "last_sync_error": None,
            },
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except EncryptionConfigError as e:
        raise HTTPException(
            status_code=503,
            detail="Server encryption is not configured.",
        ) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("Unexpected connect failure for %s user %s", exchange_id, user_id)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to validate or store {exchange_id} credentials. {e}",
        ) from e

    return ConnectExchangeResponse(
        status="ok",
        connection=sanitize_exchange_key_document(stored_key),
        validation={
            "permissions_verified": ["read"],
            "balances_count": validation.get("balances_count", 0),
            "positions_count": validation.get("positions_count", 0),
            "spot_asset_count": validation.get("spot_asset_count", 0),
            "spot_total_usd": validation.get("spot_total_usd", 0),
            "warnings": validation.get("warnings", []),
        },
    )


@router.delete(
    "/{user_id}/connection",
    response_model=DeleteExchangeResponse,
)
async def delete_connection(
    user_id: str,
    exchange_id: str = Query(..., description="Exchange identifier (binance, okx)"),
    environment: str = Query(..., description="Connection environment (mainnet, testnet, demo for binance)"),
):
    uid = _parse_user_id(user_id)
    normalized_exchange = exchange_id.strip().lower()
    normalized_environment = environment.strip().lower()

    if normalized_exchange not in SUPPORTED_EXCHANGES:
        raise HTTPException(status_code=400, detail=f"Exchange '{normalized_exchange}' is not supported.")

    allowed_environments = set(SUPPORTED_ENVIRONMENTS)
    if normalized_exchange == "binance":
        allowed_environments.add("demo")
    if normalized_environment not in allowed_environments:
        allowed = ", ".join(sorted(allowed_environments))
        raise HTTPException(
            status_code=400,
            detail=f"Environment '{normalized_environment}' is not supported for {normalized_exchange}. Supported: {allowed}.",
        )

    try:
        result = await delete_exchange_key(
            uid,
            exchange_id=normalized_exchange,
            environment=normalized_environment,
        )
    except LookupError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        logger.exception("Unexpected delete failure for %s user %s", normalized_exchange, user_id)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to delete {normalized_exchange} credentials. {e}",
        ) from e

    if result["deleted_count"] == 0:
        raise HTTPException(
            status_code=404,
            detail=f"No saved connection found for {normalized_exchange} {normalized_environment}.",
        )

    return DeleteExchangeResponse(
        status="ok",
        deleted_count=result["deleted_count"],
        remaining_count=result["remaining_count"],
    )
