"""
Unit tests for AES-128-CBC encrypt/decrypt roundtrip.

Validates:
  - Requirements 4.1: AES key is 16 bytes
  - Requirements 4.2: random IV per message, IV prepended to ciphertext
  - Requirements 4.6: Python uses random IV per message (two encrypts differ)

IMPORTANT: ServiceAPDBackend.py calls sys.exit(1) at module-level if required
env vars are missing. We must set them before importing that module.
"""

import base64
import os
import sys

# Set required env vars BEFORE importing ServiceAPDBackend so the startup
# validation (REQUIRED_ENV check) does not call sys.exit(1).
os.environ.setdefault("AES_KEY", "5ac913a003ce4c948c2138435d2d86d7")
os.environ.setdefault("MQTT_HOSTNAME", "test.broker.example")
os.environ.setdefault("MQTT_USERNAME", "test_user")
os.environ.setdefault("MQTT_PASSWORD", "test_pass")
os.environ.setdefault("APD_SERVICE_TOKEN", "test_service_token_00000000000000000")

# Add project root to sys.path so we can import ServiceAPDBackend and config
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

import pytest

# Import lazily inside a helper so any import-time error surfaces as a clear
# test failure rather than a cryptic collection error.
def _get_service_class():
    from ServiceAPDBackend import APDDetectionService  # noqa: PLC0415
    return APDDetectionService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def encrypt(plaintext: str) -> str:
    cls = _get_service_class()
    return cls.encrypt_aes128(plaintext)


def decrypt(b64: str):
    cls = _get_service_class()
    return cls.decrypt_aes128(b64)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestAesRoundtrip:
    """Requirement 4.1, 4.2, 4.6 — AES-128-CBC encrypt/decrypt correctness."""

    # --- 1. Roundtrip: encrypt → decrypt === original input ---

    def test_roundtrip_short_ascii(self):
        """Encrypting then decrypting a short ASCII string returns the original."""
        plaintext = "hello"
        assert decrypt(encrypt(plaintext)) == plaintext

    def test_roundtrip_json_payload(self):
        """Roundtrip with a realistic alarm JSON payload."""
        import json
        payload = json.dumps({
            "event": "apd_violation",
            "nodeId": 1,
            "sektorId": "S-01",
            "violations": ["helmet", "vest"],
            "timestamp": "2026-06-05T10:23:45.000Z",
        })
        assert decrypt(encrypt(payload)) == payload

    def test_roundtrip_empty_string(self):
        """Roundtrip with an empty string (edge case — PKCS7 adds a full block)."""
        plaintext = ""
        assert decrypt(encrypt(plaintext)) == plaintext

    def test_roundtrip_exactly_one_block(self):
        """Roundtrip with exactly 16-byte plaintext (boundary condition)."""
        plaintext = "A" * 16
        assert decrypt(encrypt(plaintext)) == plaintext

    def test_roundtrip_multi_block(self):
        """Roundtrip with plaintext spanning multiple AES blocks."""
        plaintext = "X" * 64
        assert decrypt(encrypt(plaintext)) == plaintext

    def test_roundtrip_unicode(self):
        """Roundtrip with UTF-8 multi-byte characters."""
        plaintext = "Peringatan APD ⚠️ — Sektor S-01"
        assert decrypt(encrypt(plaintext)) == plaintext

    # --- 2. Randomised IV: two encrypts of the same plaintext differ ---

    def test_two_encryptions_produce_different_ciphertext(self):
        """
        Validates: Requirements 4.2, 4.6

        Each call to encrypt_aes128 must generate a fresh random IV so that
        identical plaintexts do NOT produce identical ciphertexts.  A static
        (reused) IV would make CBC vulnerable to pattern analysis.
        """
        plaintext = "same input every time"
        ct1 = encrypt(plaintext)
        ct2 = encrypt(plaintext)
        assert ct1 != ct2, (
            "Two encryptions of the same plaintext produced identical output. "
            "IV is not being randomised per call (Requirement 4.2, 4.6)."
        )

    def test_iv_is_prepended_in_output(self):
        """
        Validates: Requirements 4.2

        The raw (decoded) payload must be at least 32 bytes: 16-byte IV
        prepended before at least one 16-byte ciphertext block.
        """
        ct_b64 = encrypt("test payload for IV check")
        raw = base64.b64decode(ct_b64)
        assert len(raw) >= 32, (
            f"Decoded payload is only {len(raw)} bytes; expected >= 32 "
            "(16-byte IV + at least one 16-byte ciphertext block)."
        )

    def test_different_ivs_across_calls(self):
        """
        Validates: Requirements 4.2

        Extract the first 16 bytes (IV) from multiple encryptions of the
        same plaintext and assert they differ.
        """
        plaintext = "iv randomness check"
        ivs = set()
        for _ in range(10):
            raw = base64.b64decode(encrypt(plaintext))
            iv = raw[:16]
            ivs.add(iv)
        assert len(ivs) > 1, (
            "All 10 encryptions produced the same IV — IV is not random."
        )

    # --- 3. Tampered ciphertext fails to decrypt ---

    def test_tampered_ciphertext_returns_none(self):
        """
        Validates: Requirements 4.1, 4.6

        Flipping a byte in the ciphertext portion (bytes 16+) must cause
        decrypt_aes128 to return None (padding validation failure).
        """
        ct_b64 = encrypt("sensitive payload")
        raw = bytearray(base64.b64decode(ct_b64))

        # Flip a bit in the first ciphertext byte (index 16, right after IV)
        raw[16] ^= 0xFF

        tampered_b64 = base64.b64encode(bytes(raw)).decode("utf-8")
        result = decrypt(tampered_b64)
        assert result is None, (
            "decrypt_aes128 should return None for tampered ciphertext, "
            f"but returned: {result!r}"
        )

    def test_tampered_iv_returns_none_or_garbage(self):
        """
        Flipping a byte in the IV (bytes 0–15) corrupts the first CBC block.
        The decrypted output will not be valid UTF-8 or valid padding, so
        decrypt_aes128 must return None.
        """
        ct_b64 = encrypt("another sensitive payload")
        raw = bytearray(base64.b64decode(ct_b64))

        # Flip a bit in the IV (index 0)
        raw[0] ^= 0xFF

        tampered_b64 = base64.b64encode(bytes(raw)).decode("utf-8")
        result = decrypt(tampered_b64)
        # Corrupted IV produces garbled first block; unpad will usually fail
        # → result should be None.  We allow the rare case where garbage
        # happens to look like valid padding + UTF-8, but in practice it won't.
        assert result is None or result != "another sensitive payload", (
            "Tampered IV still produced the original plaintext — "
            "this indicates IV is not influencing decryption."
        )

    def test_truncated_payload_returns_none(self):
        """
        Validates: Requirements 4.2

        A payload shorter than 32 bytes (16 IV + 16 minimum ciphertext) must
        be rejected by decrypt_aes128.
        """
        too_short = base64.b64encode(b"short").decode("utf-8")
        assert decrypt(too_short) is None

    def test_completely_invalid_base64_returns_none(self):
        """Garbage input must not raise an exception — just return None."""
        assert decrypt("not-valid-base64!!!") is None

    def test_empty_string_input_returns_none(self):
        """An empty string is not a valid ciphertext."""
        assert decrypt("") is None
