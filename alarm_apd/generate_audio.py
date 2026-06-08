"""
generate_audio.py — Buat file audio APD alert untuk SPIFFS ESP32
================================================================
Jalankan sekali untuk (re-)generate apd_alert.mp3:
    python alarm_apd/generate_audio.py

Requirements:
    pip install gtts

Output:
    alarm_apd/data/apd_alert.mp3  (MP3, bahasa Indonesia, TTS Google)
"""

import os
import sys
from pathlib import Path

# ── Konfigurasi ──────────────────────────────────────────────────────────────
TEKS = (
    "Peringatan, gunakan APD lengkap. "
    "Pastikan helm, rompi, dan sepatu safety Anda sudah terpasang."
)
LANG = "id"           # Indonesian
OUTPUT = Path(__file__).parent / "data" / "apd_alert.mp3"
# ─────────────────────────────────────────────────────────────────────────────


def generate_with_gtts() -> bool:
    """Generate MP3 menggunakan Google Text-to-Speech (membutuhkan koneksi internet)."""
    try:
        from gtts import gTTS  # type: ignore

        print(f"[gTTS] Membuat audio: \"{TEKS}\"")
        tts = gTTS(text=TEKS, lang=LANG, slow=False)
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        tts.save(str(OUTPUT))
        size_kb = OUTPUT.stat().st_size / 1024
        print(f"[gTTS] Berhasil! File: {OUTPUT}  ({size_kb:.1f} KB)")
        return True
    except ImportError:
        print("[gTTS] Module 'gtts' tidak ditemukan.")
        print("       Install dengan:  pip install gtts")
        return False
    except Exception as exc:
        print(f"[gTTS] Gagal: {exc}")
        return False


def print_manual_instructions() -> None:
    """Tampilkan instruksi alternatif jika gTTS tidak tersedia."""
    print()
    print("=" * 65)
    print("  INSTRUKSI PEMBUATAN AUDIO MANUAL")
    print("=" * 65)
    print()
    print("Konten yang diucapkan:")
    print(f"  \"{TEKS}\"")
    print()
    print("Opsi 1 — Google Cloud TTS (online, gratis dengan API key):")
    print("  https://cloud.google.com/text-to-speech")
    print("  - Pilih bahasa: id-ID")
    print("  - Export sebagai MP3")
    print()
    print("Opsi 2 — ElevenLabs (online, free tier):")
    print("  https://elevenlabs.io")
    print("  - Paste teks di atas")
    print("  - Download MP3")
    print()
    print("Opsi 3 — Rekam manual (Audacity / HP):")
    print("  - Rekam suara Anda mengucapkan teks di atas")
    print("  - Export: MP3, mono, 64 kbps, ~5 detik")
    print()
    print(f"Simpan hasil ke: {OUTPUT}")
    print()
    print("Setelah file tersedia, upload ke ESP32 dengan:")
    print("  Arduino IDE: Tools > ESP32 Sketch Data Upload")
    print("  PlatformIO : pio run -t uploadfs")
    print("=" * 65)


if __name__ == "__main__":
    print("=== APD Alert Audio Generator ===")
    print()

    if OUTPUT.exists():
        size_kb = OUTPUT.stat().st_size / 1024
        print(f"File sudah ada: {OUTPUT} ({size_kb:.1f} KB)")
        if "--force" not in sys.argv:
            print("Gunakan --force untuk regenerate.")
            sys.exit(0)
        print("--force terdeteksi, regenerating...")

    success = generate_with_gtts()

    if not success:
        print_manual_instructions()
        sys.exit(1)
