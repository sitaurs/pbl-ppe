"""
check_password_hash.py — Verifikasi format password hash di database.

Buka SQLite database SafeGuard, ambil 1 baris dari tabel User, parse field
`passwordHash`, dan verifikasi bahwa hash tersebut:
  1. Memakai algoritma Argon2id
  2. Memenuhi parameter minimum OWASP 2023 (m>=19456 KiB, t>=2, p>=1)

Output: ringkasan + status PASS/FAIL.

Usage:
    python scripts/check_password_hash.py
"""
from __future__ import annotations

import re
import sqlite3
import sys
from pathlib import Path

# Path DB relatif ke project root (SQLite ada di web-dashboard/data/safeguard.db)
ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "web-dashboard" / "data" / "safeguard.db"

# OWASP 2023 minimum untuk Argon2id (lihat web-dashboard/src/lib/auth/argon2.ts)
OWASP_MIN_MEMORY = 19_456  # KiB
OWASP_MIN_TIME = 2
OWASP_MIN_PARALLELISM = 1

PHC_RE = re.compile(r"^\$argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$")


def main() -> int:
    print("=" * 64)
    print("  Password Hash Inspection (Argon2id)")
    print("=" * 64)

    if not DB_PATH.exists():
        print(f"\n  [FAIL] Database tidak ditemukan di:\n         {DB_PATH}")
        print("\n  Pastikan Next.js sudah pernah dijalankan untuk inisialisasi.")
        return 1

    print(f"\n  Database: {DB_PATH}")

    try:
        conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute("SELECT username, passwordHash FROM User LIMIT 1")
        row = cur.fetchone()
        conn.close()
    except sqlite3.Error as e:
        print(f"\n  [FAIL] Gagal akses DB: {e}")
        return 1

    if not row:
        print("\n  [FAIL] Tidak ada user di tabel User")
        print("  Jalankan `npm run seed` di web-dashboard/ dulu.")
        return 1

    username, password_hash = row
    print(f"  Sample user: {username}")
    print(f"  passwordHash format:")
    # Tampilkan hash dengan masking salt+hash bagian belakangnya
    masked = password_hash[:50] + "..." if len(password_hash) > 50 else password_hash
    print(f"    {masked}")

    m = PHC_RE.match(password_hash)
    if not m:
        print("\n  [FAIL] Format hash tidak dikenali sebagai Argon2id PHC string")
        print(f"         Expected: $argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>")
        return 1

    version = int(m.group(1))
    memory = int(m.group(2))
    time_cost = int(m.group(3))
    parallelism = int(m.group(4))

    print()
    print("  Parsed parameters:")
    print(f"    Algorithm    : Argon2id")
    print(f"    Version      : {version}")
    print(f"    Memory       : {memory} KiB ({memory / 1024:.1f} MiB)")
    print(f"    Iterations   : {time_cost}")
    print(f"    Parallelism  : {parallelism}")

    print()
    print("  OWASP 2023 compliance check:")
    checks = [
        ("Memory     >=  19456 KiB (19 MiB)", memory, OWASP_MIN_MEMORY, ">="),
        ("Iterations >=      2", time_cost, OWASP_MIN_TIME, ">="),
        ("Parallelism>=      1", parallelism, OWASP_MIN_PARALLELISM, ">="),
    ]
    all_ok = True
    for label, actual, required, _op in checks:
        ok = actual >= required
        marker = "[OK]" if ok else "[FAIL]"
        print(f"    {marker} {label:40s}  actual={actual}")
        if not ok:
            all_ok = False

    print()
    if all_ok:
        print("  RESULT: PRODUCTION-GRADE PASSWORD STORAGE")
        print("  Password TIDAK PERNAH disimpan plaintext.")
        print("  Brute-force attack butuh ~19 MiB RAM + 2 iterasi per attempt.")
        return 0
    else:
        print("  RESULT: Parameter di bawah rekomendasi OWASP 2023")
        return 1


if __name__ == "__main__":
    sys.exit(main())
