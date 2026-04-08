"""
RiskHub - application-layer credential decryption helpers.

Supports the documented exchange key envelope format:
    enc::<base64_iv>::<base64_tag>::<base64_ciphertext>

The AES-256-GCM master key is read from one of these environment variables:
    - RISKHUB_ENCRYPTION_KEY
    - APP_ENCRYPTION_KEY
    - ENCRYPTION_KEY

Accepted key formats:
    - raw 32-byte string
    - 64-char hex string
    - base64 / urlsafe-base64 encoded 32-byte key
    - any other string, which is deterministically expanded via SHA-256
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import logging
import os
from functools import lru_cache
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from dotenv import load_dotenv

logger = logging.getLogger("riskhub.security")

ENCRYPTION_KEY_ENV_NAMES = (
    "RISKHUB_ENCRYPTION_KEY",
    "APP_ENCRYPTION_KEY",
    "ENCRYPTION_KEY",
)


class EncryptionConfigError(RuntimeError):
    """Raised when the app cannot resolve a usable encryption key."""


def _pad_base64(value: str) -> str:
    return value + ("=" * ((4 - len(value) % 4) % 4))


def _decode_base64(value: str) -> bytes:
    try:
        return base64.b64decode(_pad_base64(value))
    except binascii.Error:
        return base64.urlsafe_b64decode(_pad_base64(value))


def _encode_base64(value: bytes) -> str:
    return base64.b64encode(value).decode("utf-8")


def _normalise_aes256_key(material: str) -> bytes:
    raw = material.strip()
    if not raw:
        raise EncryptionConfigError("Encryption key is empty.")

    # Explicit hex encoding.
    if raw.startswith("hex:"):
        decoded = bytes.fromhex(raw[4:])
        if len(decoded) != 32:
            raise EncryptionConfigError("hex: encryption key must decode to 32 bytes.")
        return decoded

    # Explicit base64 encoding.
    if raw.startswith("base64:"):
        decoded = _decode_base64(raw[7:])
        if len(decoded) != 32:
            raise EncryptionConfigError("base64: encryption key must decode to 32 bytes.")
        return decoded

    # 64-character hex key.
    if len(raw) == 64:
        try:
            decoded = bytes.fromhex(raw)
            if len(decoded) == 32:
                return decoded
        except ValueError:
            pass

    # Base64 / urlsafe-base64 encoded 32-byte key.
    try:
        decoded = _decode_base64(raw)
        if len(decoded) == 32:
            return decoded
    except (ValueError, binascii.Error):
        pass

    # Raw 32-byte secret.
    raw_bytes = raw.encode("utf-8")
    if len(raw_bytes) == 32:
        return raw_bytes

    # Deterministic expansion for passphrase-style secrets.
    return hashlib.sha256(raw_bytes).digest()


@lru_cache(maxsize=1)
def get_encryption_key_bytes() -> bytes:
    """
    Resolve the AES-256-GCM master key from environment variables.
    """
    load_dotenv()

    for env_name in ENCRYPTION_KEY_ENV_NAMES:
        material = os.getenv(env_name)
        if material and material.strip():
            return _normalise_aes256_key(material)

    raise EncryptionConfigError(
        "Missing encryption key. Set RISKHUB_ENCRYPTION_KEY, "
        "APP_ENCRYPTION_KEY, or ENCRYPTION_KEY."
    )


def decrypt_secret_if_needed(value: Optional[str]) -> Optional[str]:
    """
    Return plaintext as-is, or decrypt an ``enc::`` AES-256-GCM envelope.
    """
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError("Encrypted credential value must be a string or None.")
    if not value:
        return value
    if not value.startswith("enc::"):
        return value

    parts = value.split("::")
    if len(parts) != 4:
        raise ValueError("Encrypted credential envelope must match enc::<iv>::<tag>::<ciphertext>.")

    _, iv_b64, tag_b64, ciphertext_b64 = parts
    iv = _decode_base64(iv_b64)
    tag = _decode_base64(tag_b64)
    ciphertext = _decode_base64(ciphertext_b64)

    plaintext = AESGCM(get_encryption_key_bytes()).decrypt(iv, ciphertext + tag, None)
    return plaintext.decode("utf-8")


def encrypt_secret(value: Optional[str]) -> Optional[str]:
    """
    Encrypt plaintext into the documented ``enc::`` AES-256-GCM envelope.
    """
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError("Credential value to encrypt must be a string or None.")
    if not value:
        return value

    iv = os.urandom(12)
    encrypted = AESGCM(get_encryption_key_bytes()).encrypt(
        iv,
        value.encode("utf-8"),
        None,
    )
    ciphertext = encrypted[:-16]
    tag = encrypted[-16:]

    return "enc::{}::{}::{}".format(
        _encode_base64(iv),
        _encode_base64(tag),
        _encode_base64(ciphertext),
    )
