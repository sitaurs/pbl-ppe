"""
aes_demo_compare.py — Demo random IV pada AES-128-CBC.

Encrypt payload yang SAMA persis sebanyak 3x, lalu print base64 output-nya.
Kalau random IV bekerja dengan benar, ketiga ciphertext WAJIB berbeda total
walau plaintext-nya identik.

Ini demo standar untuk klaim "random IV per pesan" di kuliah keamanan jaringan.

Usage:
    python scripts/aes_demo_compare.py
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Tambah project root ke sys.path agar bisa import ServiceAPDBackend
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

# Pastikan env wajib terisi (tidak harus valid, ServiceAPDBackend hanya cek
# keberadaan saat module loaded). Kalau .env asli sudah di-load via python-dotenv,
# nilai di sini akan di-skip.
os.environ.setdefault("MQTT_HOSTNAME", "demo")
os.environ.setdefault("MQTT_USERNAME", "demo")
os.environ.setdefault("MQTT_PASSWORD", "demo")
os.environ.setdefault("APD_SERVICE_TOKEN", "x" * 32)

from ServiceAPDBackend import APDDetectionService  # noqa: E402


def main() -> int:
    payload = {
        "event": "apd_violation",
        "nodeId": 1,
        "sektorId": "A1",
        "violations": ["no_helmet"],
        "timestamp": "2026-06-07T14:30:00Z",
    }
    plaintext = json.dumps(payload, separators=(",", ":"))

    print("=" * 64)
    print("  AES-128-CBC Random IV Demo")
    print("=" * 64)
    print(f"\nPlaintext (sama untuk ketiga run):\n  {plaintext}\n")

    ciphertexts = []
    for i in range(1, 4):
        ct = APDDetectionService.encrypt_aes128(plaintext)
        ciphertexts.append(ct)
        preview = ct[:60] + "..." if len(ct) > 60 else ct
        print(f"  Run {i}: {preview}")

    unique = len(set(ciphertexts))
    print()
    if unique == 3:
        print(f"  [PASS] Ketiga ciphertext UNIK ({unique}/3)")
        print("  -> Random IV per pesan TERVERIFIKASI")
        rc = 0
    else:
        print(f"  [FAIL] Hanya {unique}/3 ciphertext unik")
        print("  -> Random IV TIDAK BEKERJA dengan benar")
        rc = 1

    print()
    print("Verifikasi roundtrip (decrypt kembalikan plaintext asli):")
    for i, ct in enumerate(ciphertexts, 1):
        pt = APDDetectionService.decrypt_aes128(ct)
        ok = pt == plaintext
        marker = "[OK]" if ok else "[FAIL]"
        print(f"  Run {i}: {marker} decrypt -> match={ok}")

    print()
    return rc


if __name__ == "__main__":
    sys.exit(main())
