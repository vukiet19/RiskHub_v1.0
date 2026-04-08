from __future__ import annotations

import logging
from typing import Any, Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from security import EncryptionConfigError, encrypt_secret
from services.exchange_key_service import (
    get_user_exchange_keys,
    sanitize_exchange_key_document,
    upsert_exchange_key,
)
from services.exchange_service import validate_binance_testnet_credentials

router = APIRouter(prefix="/api/v1/exchange-keys", tags=["exchange-keys"])
logger = logging.getLogger("riskhub.api.exchange_keys")


class ConnectBinanceTestnetRequest(BaseModel):
    api_key: str = Field(..., min_length=1, max_length=512)
    api_secret: str = Field(..., min_length=1, max_length=512)
    label: Optional[str] = Field(None, max_length=120)


class ExchangeKeysListResponse(BaseModel):
    status: str
    connections: list[dict[str, Any]]
    count: int


class ConnectBinanceTestnetResponse(BaseModel):
    status: str
    connection: dict[str, Any]
    validation: dict[str, Any]


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
    "/{user_id}/binance-testnet/connect",
    response_model=ConnectBinanceTestnetResponse,
)
async def connect_binance_testnet(user_id: str, req: ConnectBinanceTestnetRequest):
    uid = _parse_user_id(user_id)
    api_key = req.api_key.strip()
    api_secret = req.api_secret.strip()
    label = (req.label or "").strip() or "Binance Testnet Futures"

    try:
        validation = await validate_binance_testnet_credentials(api_key, api_secret)
        stored_key = await upsert_exchange_key(
            uid,
            exchange_id="binance",
            environment="testnet",
            market_type="futures",
            key_doc={
                "label": label,
                "api_key_encrypted": encrypt_secret(api_key),
                "api_secret_encrypted": encrypt_secret(api_secret),
                "passphrase_encrypted": None,
                "permissions_verified": validation["permissions_verified"],
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
        logger.exception("Unexpected Binance Testnet connect failure for user %s", user_id)
        raise HTTPException(
            status_code=502,
            detail="Failed to validate or store Binance Testnet credentials.",
        ) from e

    return ConnectBinanceTestnetResponse(
        status="ok",
        connection=sanitize_exchange_key_document(stored_key),
        validation=validation,
    )
