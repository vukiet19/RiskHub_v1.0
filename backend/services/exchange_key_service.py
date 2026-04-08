from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId

from database import get_database
from models.user import ExchangeEnvironment, ExchangeMarketType, SyncStatus
from security import decrypt_secret_if_needed


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_sync_status(value: Any) -> str:
    if isinstance(value, SyncStatus):
        return value.value

    raw = str(value or SyncStatus.OK.value).strip().lower()
    if raw in {status.value for status in SyncStatus}:
        return raw
    return SyncStatus.OK.value


def normalise_exchange_key_document(key_doc: dict[str, Any]) -> dict[str, Any]:
    doc = dict(key_doc or {})
    exchange_id = str(doc.get("exchange_id") or "").strip().lower()
    environment = str(
        doc.get("environment") or ExchangeEnvironment.MAINNET.value
    ).strip().lower()
    market_type = str(
        doc.get("market_type") or ExchangeMarketType.MIXED.value
    ).strip().lower()

    doc["exchange_id"] = exchange_id
    doc["environment"] = environment
    doc["market_type"] = market_type
    doc["label"] = str(
        doc.get("label") or f"{exchange_id or 'exchange'}-{environment}"
    ).strip()
    doc["permissions_verified"] = list(
        dict.fromkeys(doc.get("permissions_verified") or ["read"])
    )
    doc["is_active"] = bool(doc.get("is_active", True))
    doc["last_sync_status"] = _coerce_sync_status(doc.get("last_sync_status"))

    if doc.get("added_at") is None:
        doc["added_at"] = _utcnow()

    return doc


def key_matches(
    key_doc: dict[str, Any],
    *,
    exchange_id: Optional[str] = None,
    environment: Optional[str] = None,
    market_type: Optional[str] = None,
    active_only: bool = False,
) -> bool:
    doc = normalise_exchange_key_document(key_doc)

    if active_only and not doc.get("is_active", True):
        return False
    if exchange_id and doc["exchange_id"] != exchange_id.lower():
        return False
    if environment and doc["environment"] != environment.lower():
        return False
    if market_type and doc["market_type"] != market_type.lower():
        return False
    return True


def sanitize_exchange_key_document(key_doc: dict[str, Any]) -> dict[str, Any]:
    doc = normalise_exchange_key_document(key_doc)
    return {
        "exchange_id": doc["exchange_id"],
        "label": doc["label"],
        "environment": doc["environment"],
        "market_type": doc["market_type"],
        "permissions_verified": doc["permissions_verified"],
        "is_active": doc["is_active"],
        "last_sync_at": (
            doc["last_sync_at"].isoformat() if isinstance(doc.get("last_sync_at"), datetime) else None
        ),
        "last_sync_status": doc["last_sync_status"],
        "last_sync_error": doc.get("last_sync_error"),
        "added_at": (
            doc["added_at"].isoformat() if isinstance(doc.get("added_at"), datetime) else None
        ),
    }


def decrypt_exchange_key_document(key_doc: dict[str, Any]) -> dict[str, Any]:
    doc = normalise_exchange_key_document(key_doc)
    api_key = decrypt_secret_if_needed(doc.get("api_key_encrypted"))
    api_secret = decrypt_secret_if_needed(doc.get("api_secret_encrypted"))
    passphrase = decrypt_secret_if_needed(doc.get("passphrase_encrypted"))

    if not api_key or not api_secret:
        raise ValueError("Stored exchange credentials are incomplete.")

    return {
        **doc,
        "api_key": api_key,
        "api_secret": api_secret,
        "passphrase": passphrase,
        "testnet": doc["environment"] == ExchangeEnvironment.TESTNET.value,
    }


async def _get_user_exchange_keys_document(user_id: ObjectId) -> dict[str, Any]:
    db = get_database()
    user = await db.users.find_one(
        {"_id": user_id},
        projection={"exchange_keys": 1},
    )
    if not user:
        raise LookupError(f"User '{user_id}' was not found.")
    return user


async def get_user_exchange_keys(user_id: ObjectId) -> list[dict[str, Any]]:
    user = await _get_user_exchange_keys_document(user_id)
    return [
        normalise_exchange_key_document(key_doc)
        for key_doc in user.get("exchange_keys", [])
    ]


async def get_active_exchange_key(
    user_id: ObjectId,
    *,
    exchange_id: Optional[str] = None,
    environment: Optional[str] = None,
    market_type: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    keys = await get_user_exchange_keys(user_id)
    for key_doc in keys:
        if key_matches(
            key_doc,
            exchange_id=exchange_id,
            environment=environment,
            market_type=market_type,
            active_only=True,
        ):
            return key_doc
    return None


async def upsert_exchange_key(
    user_id: ObjectId,
    *,
    exchange_id: str,
    environment: str,
    market_type: str,
    key_doc: dict[str, Any],
) -> dict[str, Any]:
    db = get_database()
    user = await db.users.find_one(
        {"_id": user_id},
        projection={"exchange_keys": 1},
    )
    if not user:
        raise LookupError(f"User '{user_id}' was not found.")

    now = _utcnow()
    target = normalise_exchange_key_document(
        {
            **key_doc,
            "exchange_id": exchange_id,
            "environment": environment,
            "market_type": market_type,
        }
    )
    target.setdefault("added_at", now)

    updated_keys: list[dict[str, Any]] = []
    replaced = False

    for existing_key in user.get("exchange_keys", []):
        normalized_existing = normalise_exchange_key_document(existing_key)
        if key_matches(
            normalized_existing,
            exchange_id=exchange_id,
            environment=environment,
            market_type=market_type,
        ):
            if not replaced:
                merged = {**normalized_existing, **target}
                merged["added_at"] = normalized_existing.get("added_at") or target["added_at"]
                updated_keys.append(merged)
                replaced = True
            else:
                normalized_existing["is_active"] = False
                updated_keys.append(normalized_existing)
        else:
            updated_keys.append(normalized_existing)

    if not replaced:
        updated_keys.append(target)

    await db.users.update_one(
        {"_id": user_id},
        {
            "$set": {
                "exchange_keys": updated_keys,
                "updated_at": now,
            }
        },
    )
    return target


async def update_exchange_key_sync_status(
    user_id: ObjectId,
    *,
    exchange_id: str,
    environment: str,
    market_type: str,
    last_sync_status: str,
    last_sync_error: Optional[str],
    last_sync_at: Optional[datetime] = None,
) -> Optional[dict[str, Any]]:
    db = get_database()
    user = await db.users.find_one(
        {"_id": user_id},
        projection={"exchange_keys": 1},
    )
    if not user:
        raise LookupError(f"User '{user_id}' was not found.")

    sync_at = last_sync_at or _utcnow()
    updated_keys: list[dict[str, Any]] = []
    updated_key: Optional[dict[str, Any]] = None

    for existing_key in user.get("exchange_keys", []):
        normalized_existing = normalise_exchange_key_document(existing_key)
        if (
            updated_key is None
            and key_matches(
                normalized_existing,
                exchange_id=exchange_id,
                environment=environment,
                market_type=market_type,
            )
        ):
            normalized_existing["last_sync_status"] = _coerce_sync_status(last_sync_status)
            normalized_existing["last_sync_error"] = last_sync_error
            normalized_existing["last_sync_at"] = sync_at
            updated_key = normalized_existing
        updated_keys.append(normalized_existing)

    if updated_key is None:
        return None

    await db.users.update_one(
        {"_id": user_id},
        {
            "$set": {
                "exchange_keys": updated_keys,
                "updated_at": sync_at,
            }
        },
    )
    return updated_key
