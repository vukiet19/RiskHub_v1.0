"""
RiskHub — Pydantic / MongoDB Base Model
========================================
Shared base class and helpers used by all four collection models.

* ``PyObjectId``  — an annotated type for ObjectId ↔ str round-tripping
* ``DecimalStr``  — a ``Decimal`` wrapper that serialises as string and
                    maps to MongoDB Decimal128 when written via Motor.
* ``MongoBaseDocument`` — common _id handling with ``model_config``
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated, Any, Optional

from bson import ObjectId, Decimal128
from pydantic import BaseModel, Field, GetCoreSchemaHandler
from pydantic_core import CoreSchema, core_schema


# ─── ObjectId adapter ────────────────────────────────────────────────────

class _ObjectIdPydanticAnnotation:
    """
    Custom Pydantic v2 type that accepts:
    * ``str``  → validated & converted to ``ObjectId``
    * ``ObjectId`` → passed through
    and always serialises as ``str`` for JSON output.
    """

    @classmethod
    def __get_pydantic_core_schema__(
        cls,
        _source_type: Any,
        _handler: GetCoreSchemaHandler,
    ) -> CoreSchema:
        from_str = core_schema.chain_schema(
            [
                core_schema.str_schema(),
                core_schema.no_info_plain_validator_function(
                    cls._validate,
                ),
            ]
        )
        return core_schema.json_or_python_schema(
            json_schema=from_str,
            python_schema=core_schema.union_schema(
                [
                    core_schema.is_instance_schema(ObjectId),
                    from_str,
                ]
            ),
            serialization=core_schema.plain_serializer_function_ser_schema(
                lambda v: str(v),
                info_arg=False,
            ),
        )

    @classmethod
    def _validate(cls, value: str) -> ObjectId:
        if not ObjectId.is_valid(value):
            raise ValueError(f"Invalid ObjectId: {value}")
        return ObjectId(value)


PyObjectId = Annotated[ObjectId, _ObjectIdPydanticAnnotation]


# ─── Decimal adapter (Decimal128-safe) ───────────────────────────────────

class _Decimal128PydanticAnnotation:
    """
    Custom Pydantic v2 type that accepts:
    * ``str``, ``int``, ``float``, ``Decimal``, ``Decimal128``
    and always stores internally as Python ``Decimal``.

    When writing to MongoDB through Motor, convert with
    ``Decimal128(str(value))`` to get native BSON Decimal128 storage.
    """

    @classmethod
    def __get_pydantic_core_schema__(
        cls,
        _source_type: Any,
        _handler: GetCoreSchemaHandler,
    ) -> CoreSchema:
        from_any = core_schema.no_info_plain_validator_function(cls._validate)
        return core_schema.json_or_python_schema(
            json_schema=core_schema.chain_schema(
                [core_schema.str_schema(), from_any]
            ),
            python_schema=from_any,
            serialization=core_schema.plain_serializer_function_ser_schema(
                lambda v: str(v),
                info_arg=False,
            ),
        )

    @classmethod
    def _validate(cls, value: Any) -> Decimal:
        if isinstance(value, Decimal):
            return value
        if isinstance(value, Decimal128):
            return value.to_decimal()
        if isinstance(value, (str, int, float)):
            return Decimal(str(value))
        raise ValueError(f"Cannot coerce {type(value).__name__} to Decimal")


DecimalStr = Annotated[Decimal, _Decimal128PydanticAnnotation]


# ─── Helper: convert model dict for MongoDB writes ──────────────────────

def to_mongo_decimal(data: dict) -> dict:
    """
    Recursively walk a dict (e.g. from ``model.model_dump()``) and convert
    every ``Decimal`` value to ``Decimal128`` so Motor writes native
    BSON Decimal128 fields.
    """
    out: dict = {}
    for key, val in data.items():
        if isinstance(val, Decimal):
            out[key] = Decimal128(str(val))
        elif isinstance(val, dict):
            out[key] = to_mongo_decimal(val)
        elif isinstance(val, list):
            out[key] = [
                to_mongo_decimal(item) if isinstance(item, dict) else
                Decimal128(str(item)) if isinstance(item, Decimal) else item
                for item in val
            ]
        else:
            out[key] = val
    return out


# ─── Shared base document ───────────────────────────────────────────────

class MongoBaseDocument(BaseModel):
    """
    Abstract base for all RiskHub MongoDB documents.

    * Auto-generates ``_id`` as a new ObjectId if not provided.
    * Allows arbitrary types (ObjectId, Decimal128) via ``model_config``.
    """

    id: Optional[PyObjectId] = Field(
        default_factory=ObjectId,
        alias="_id",
        description="MongoDB document _id",
    )

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
        "json_encoders": {
            ObjectId: str,
            Decimal: str,
            Decimal128: lambda v: str(v.to_decimal()),
            datetime: lambda v: v.isoformat(),
        },
    }
