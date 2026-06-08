"""
config_bundle.py — Export/Import konfigurasi runtime SafeGuard APD.

Tujuan: pindahkan semua state per-machine (env, database, cloudflare config)
dari laptop dev ke laptop demo dalam 1 file ZIP terenkripsi.

Yang DI-bundle:
  * .env                                          (root)
  * web-dashboard/.env.local                      (Next.js env)
  * web-dashboard/data/safeguard.db (+wal/+shm)   (SQLite snapshot)
  * web-dashboard/cloudflared/config.yml          (tunnel config, optional)
  * cloudflared credentials JSON                  (tunnel UUID + secret, optional)
  * manifest.json                                 (timestamp, hostname, hash sha256)

Yang TIDAK di-bundle (regenerate di laptop tujuan):
  * node_modules/, .venv/, .pio/                  (puluhan ribu file, OS-specific)
  * runs/, .ultralytics/                          (training artifacts)
  * web-dashboard/.next/                          (build cache)

Format: ZIP (deflate) + AES-encrypted via password (pyzipper).

Dipakai dari TUI (key E / I) atau standalone CLI:
    python -m scripts.config_bundle export safeguard-bundle.zip
    python -m scripts.config_bundle import safeguard-bundle.zip
"""
from __future__ import annotations

import argparse
import getpass
import hashlib
import json
import os
import shutil
import socket
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

# Try import pyzipper for AES-encrypted ZIP. Fallback: plain ZIP + password is ignored.
try:
    import pyzipper  # type: ignore
    HAS_PYZIPPER = True
except ImportError:
    HAS_PYZIPPER = False


ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT / "web-dashboard"

# Daftar item untuk di-bundle. Format: (label, source_path, archive_path, optional)
BUNDLE_ITEMS: list[tuple[str, Path, str, bool]] = [
    ("env_root",          ROOT / ".env",                                       "env/.env",                         False),
    ("env_local",         WEB_DIR / ".env.local",                              "env/web-dashboard.env.local",      False),
    ("db_main",           WEB_DIR / "data" / "safeguard.db",                   "database/safeguard.db",            False),
    ("db_wal",            WEB_DIR / "data" / "safeguard.db-wal",               "database/safeguard.db-wal",        True),
    ("db_shm",            WEB_DIR / "data" / "safeguard.db-shm",               "database/safeguard.db-shm",        True),
    ("cf_config",         WEB_DIR / "cloudflared" / "config.yml",              "cloudflare/config.yml",            True),
]


# ────────────────────────────────────────────────────────────────────────────
#  HELPERS
# ────────────────────────────────────────────────────────────────────────────

def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _read_cf_token_path() -> Path | None:
    """Cloudflared menyimpan tunnel credential di %USERPROFILE%\\.cloudflared\\<UUID>.json
    setelah `cloudflared tunnel create`. Coba cari yang paling baru."""
    cf_dir = Path.home() / ".cloudflared"
    if not cf_dir.exists():
        return None
    json_files = list(cf_dir.glob("*.json"))
    if not json_files:
        return None
    return max(json_files, key=lambda p: p.stat().st_mtime)


def _ensure_pyzipper():
    if not HAS_PYZIPPER:
        print("\n  [!] Module 'pyzipper' belum terinstall.")
        print("      Install dulu:  pip install pyzipper")
        print("      Tanpa pyzipper, bundle tidak akan ter-encrypt.\n")
        return False
    return True


# ────────────────────────────────────────────────────────────────────────────
#  EXPORT
# ────────────────────────────────────────────────────────────────────────────

def export_bundle(output_path: Path, password: str) -> int:
    """Export config jadi 1 file ZIP terenkripsi. Return 0 sukses, !=0 fail."""
    items_to_include: list[tuple[str, Path, str]] = []
    missing_required: list[str] = []

    for label, src, arc, optional in BUNDLE_ITEMS:
        if src.exists():
            items_to_include.append((label, src, arc))
        elif not optional:
            missing_required.append(f"{label} ({src})")

    # Cloudflare credentials JSON (otomatis dideteksi)
    cf_cred = _read_cf_token_path()
    if cf_cred:
        items_to_include.append(("cf_credentials", cf_cred, f"cloudflare/{cf_cred.name}"))

    if missing_required:
        print("\n  [!] File wajib tidak ditemukan:")
        for m in missing_required:
            print(f"      - {m}")
        print("\n  Jalankan setup lengkap dulu (TUI step W: wizard).\n")
        return 1

    # Build manifest
    manifest = {
        "schema_version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "exported_by_host": socket.gethostname(),
        "exported_by_user": os.getlogin() if hasattr(os, "getlogin") else "unknown",
        "encrypted": HAS_PYZIPPER,
        "items": [],
    }
    for label, src, arc in items_to_include:
        manifest["items"].append({
            "label": label,
            "archive_path": arc,
            "source_path": str(src.relative_to(ROOT) if src.is_relative_to(ROOT) else src),
            "size_bytes": src.stat().st_size,
            "sha256": _sha256(src),
        })

    output_path.parent.mkdir(parents=True, exist_ok=True)

    if HAS_PYZIPPER and password:
        zf_class = pyzipper.AESZipFile
        zf_kwargs = {
            "mode": "w",
            "compression": pyzipper.ZIP_DEFLATED,
            "encryption": pyzipper.WZ_AES,
        }
    else:
        zf_class = zipfile.ZipFile
        zf_kwargs = {"mode": "w", "compression": zipfile.ZIP_DEFLATED}

    with zf_class(output_path, **zf_kwargs) as zf:
        if HAS_PYZIPPER and password:
            zf.setpassword(password.encode())

        # Tulis manifest dulu
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))

        # Tulis README.txt cara restore
        zf.writestr("README.txt",
            "SafeGuard APD Configuration Bundle\n"
            "=" * 50 + "\n"
            f"Exported: {manifest['exported_at']}\n"
            f"Host    : {manifest['exported_by_host']}\n"
            f"Encrypted: {manifest['encrypted']}\n\n"
            "Cara import di laptop tujuan:\n"
            "  1. Pastikan repo sudah di-clone dan up-to-date (git pull)\n"
            "  2. Jalankan: python tui.py\n"
            "  3. Tekan tombol [I] untuk Import Config\n"
            "  4. Pilih file bundle ini\n"
            "  5. Masukkan password (kalau encrypted)\n\n"
            "Atau via CLI:\n"
            "  python -m scripts.config_bundle import safeguard-bundle.zip\n"
        )

        # Tulis semua file
        for label, src, arc in items_to_include:
            zf.write(src, arcname=arc)

    size_mb = output_path.stat().st_size / 1024 / 1024
    print(f"\n  [OK] Bundle dibuat: {output_path}")
    print(f"       Ukuran : {size_mb:.2f} MB")
    print(f"       Items  : {len(items_to_include)} file")
    print(f"       Encrypted: {HAS_PYZIPPER and bool(password)}")
    return 0


# ────────────────────────────────────────────────────────────────────────────
#  IMPORT
# ────────────────────────────────────────────────────────────────────────────

def _backup_target(target: Path) -> Path | None:
    """Backup file yang akan ditimpa ke <name>.before-import-<ts>.bak."""
    if not target.exists():
        return None
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    bak_path = target.with_suffix(target.suffix + f".before-import-{ts}.bak")
    shutil.copy2(target, bak_path)
    return bak_path


def import_bundle(bundle_path: Path, password: str, dry_run: bool = False) -> int:
    """Restore config dari ZIP bundle. Backup file lama ke .bak. Return 0 sukses."""
    if not bundle_path.exists():
        print(f"\n  [!] File bundle tidak ditemukan: {bundle_path}\n")
        return 1

    # Open ZIP
    try:
        if HAS_PYZIPPER:
            zf = pyzipper.AESZipFile(bundle_path, "r")
            if password:
                zf.setpassword(password.encode())
        else:
            zf = zipfile.ZipFile(bundle_path, "r")
            if password:
                zf.setpassword(password.encode())
    except Exception as e:
        print(f"\n  [!] Gagal membuka ZIP: {e}\n")
        return 1

    try:
        # Read manifest
        try:
            manifest_data = zf.read("manifest.json")
        except (KeyError, RuntimeError) as e:
            print(f"\n  [!] Manifest tidak terbaca (password salah?): {e}\n")
            zf.close()
            return 1

        manifest = json.loads(manifest_data)

        print("\n  Bundle info:")
        print(f"    Exported     : {manifest.get('exported_at', '?')}")
        print(f"    Host         : {manifest.get('exported_by_host', '?')}")
        print(f"    Items        : {len(manifest.get('items', []))}")
        print()

        # Map archive_path -> target Path
        arc_to_target: dict[str, Path] = {}
        for item in manifest["items"]:
            arc = item["archive_path"]
            label = item["label"]

            if label == "env_root":
                arc_to_target[arc] = ROOT / ".env"
            elif label == "env_local":
                arc_to_target[arc] = WEB_DIR / ".env.local"
            elif label == "db_main":
                arc_to_target[arc] = WEB_DIR / "data" / "safeguard.db"
            elif label == "db_wal":
                arc_to_target[arc] = WEB_DIR / "data" / "safeguard.db-wal"
            elif label == "db_shm":
                arc_to_target[arc] = WEB_DIR / "data" / "safeguard.db-shm"
            elif label == "cf_config":
                arc_to_target[arc] = WEB_DIR / "cloudflared" / "config.yml"
            elif label == "cf_credentials":
                cf_dir = Path.home() / ".cloudflared"
                cf_dir.mkdir(exist_ok=True)
                arc_to_target[arc] = cf_dir / Path(arc).name
            else:
                print(f"    [skip] label tidak dikenal: {label}")

        # Tampilkan rencana restore
        print("  Rencana restore:")
        for arc, target in arc_to_target.items():
            status = "TIMPA (backup ke .bak)" if target.exists() else "BUAT BARU      "
            print(f"    {status}  ->  {target}")
        print()

        if dry_run:
            print("  [dry-run] Tidak ada perubahan. Hapus --dry-run untuk eksekusi.\n")
            zf.close()
            return 0

        # Backup + extract
        backups: list[Path] = []
        for arc, target in arc_to_target.items():
            target.parent.mkdir(parents=True, exist_ok=True)
            bak = _backup_target(target)
            if bak:
                backups.append(bak)
            with zf.open(arc) as src, open(target, "wb") as dst:
                shutil.copyfileobj(src, dst)
            print(f"    [OK] {target}")

        zf.close()

        print()
        print(f"  [SELESAI] Restore {len(arc_to_target)} file.")
        print(f"            Backup file lama: {len(backups)} file (cari *.before-import-*.bak)")
        print()
        print("  Langkah berikutnya:")
        print("    1. Restart Next.js + Python backend (TUI -> tekan [r])")
        print("    2. Kalau cloudflared belum ter-install: TUI -> Setup -> [H]")
        print("    3. Verifikasi: TUI Overview panel CONNECTIONS jadi hijau")
        print()
        return 0
    except Exception as e:
        zf.close()
        print(f"\n  [!] Gagal restore: {e}\n")
        return 1


# ────────────────────────────────────────────────────────────────────────────
#  CLI
# ────────────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(
        prog="config_bundle",
        description="Export/Import konfigurasi runtime SafeGuard APD.",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_export = sub.add_parser("export", help="Export config jadi ZIP bundle")
    p_export.add_argument("output", type=Path, help="Output path (mis. safeguard-bundle.zip)")
    p_export.add_argument("--password", "-p", default=None,
                          help="Password ZIP (kalau kosong akan diminta)")

    p_import = sub.add_parser("import", help="Restore config dari ZIP bundle")
    p_import.add_argument("bundle", type=Path, help="Path ke file bundle .zip")
    p_import.add_argument("--password", "-p", default=None,
                          help="Password ZIP (kalau kosong akan diminta)")
    p_import.add_argument("--dry-run", action="store_true",
                          help="Tampilkan rencana restore tanpa eksekusi")

    args = parser.parse_args()

    if args.cmd == "export":
        if not _ensure_pyzipper() and args.password:
            print("  Tetap lanjut tanpa enkripsi (pyzipper tidak ada)?")
            ans = input("  [y/N]: ").strip().lower()
            if ans != "y":
                return 1
        password = args.password
        if password is None and HAS_PYZIPPER:
            password = getpass.getpass("  Password ZIP (kosong = no encryption): ")
        return export_bundle(args.output, password or "")

    if args.cmd == "import":
        password = args.password
        if password is None and HAS_PYZIPPER:
            password = getpass.getpass("  Password ZIP (kosong kalau tidak encrypted): ")
        return import_bundle(args.bundle, password or "", dry_run=args.dry_run)

    parser.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
