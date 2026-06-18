"""
config.py — Konfigurasi terpusat untuk semua service.

Semua nilai dibaca dari file .env menggunakan python-dotenv.
Salin .env.example ke .env lalu isi sesuai environment masing-masing.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# ============================================================
# Base paths
# ============================================================
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

# ============================================================
# MQTT Broker (HiveMQ Cloud TLS)
# ============================================================
MQTT_HOSTNAME: str = os.getenv("MQTT_HOSTNAME", "")
MQTT_PORT: int = int(os.getenv("MQTT_PORT", "8883"))
MQTT_USERNAME: str = os.getenv("MQTT_USERNAME", "")
MQTT_PASSWORD: str = os.getenv("MQTT_PASSWORD", "")
MQTT_TOPIC_PERSON: str = os.getenv("MQTT_TOPIC_PERSON", "Person")
MQTT_TOPIC_VIOLATION: str = os.getenv("MQTT_TOPIC_VIOLATION", "APD_Violation")
MQTT_TOPIC_FRAME: str = os.getenv("MQTT_TOPIC_FRAME", "VideoFrame")

# ============================================================
# AES-128-CBC Encryption
#
# AES_KEY harus berupa string hex 32 karakter (= 16 byte setelah decode).
# Generate dengan:
#   python -c "import secrets; print(secrets.token_hex(16))"
#
# IV di-randomize per pesan dan di-prepend ke ciphertext (lihat
# encrypt_aes128 di ServiceAPDBackend.py), jadi AES_IV TIDAK lagi disimpan
# di .env. Lihat requirements 4.1, 4.2, 5.4.
# ============================================================
_AES_KEY_HEX: str = os.getenv("AES_KEY", "").strip()

if _AES_KEY_HEX:
    try:
        AES_KEY: bytes = bytes.fromhex(_AES_KEY_HEX)
    except ValueError as exc:
        raise ValueError(
            "AES_KEY in .env must be a hexadecimal string. "
            "Generate one with: "
            'python -c "import secrets; print(secrets.token_hex(16))"'
        ) from exc

    if len(AES_KEY) != 16:
        raise ValueError(
            f"AES_KEY must decode to exactly 16 bytes (got {len(AES_KEY)} bytes "
            f"from {len(_AES_KEY_HEX)} hex chars). Use a 32-character hex string."
        )
else:
    # Kosong → dibiarkan agar startup validation di ServiceAPDBackend.py
    # (REQUIRED_ENV) memunculkan error yang konsisten dengan env wajib lain.
    AES_KEY: bytes = b""

# ============================================================
# WhatsApp API (GoWA self-hosted)
# ============================================================
WA_API_URL: str = os.getenv("WA_API_URL", "http://localhost:3000")
WA_API_USER: str = os.getenv("WA_API_USER", "admin")
WA_API_PASS: str = os.getenv("WA_API_PASS", "")
WA_DEVICE_ID: str = os.getenv("WA_DEVICE_ID", "pbl-alarm")

# ============================================================
# Detection Thresholds
# ============================================================
CONFIDENCE_THRESHOLD: float = float(os.getenv("CONFIDENCE_THRESHOLD", "0.65"))
PERSON_CONFIDENCE_THRESHOLD: float = float(os.getenv("PERSON_CONFIDENCE_THRESHOLD", "0.60"))
COOLDOWN_SECONDS: int = int(os.getenv("COOLDOWN_SECONDS", "20"))
WA_COOLDOWN_SECONDS: int = int(os.getenv("WA_COOLDOWN_SECONDS", "120"))
# Default dibuat lebih hemat untuk laptop GPU entry-level seperti MX350.
SEND_FRAME_INTERVAL: float = float(os.getenv("SEND_FRAME_INTERVAL", "0.12"))
STREAM_MAX_WIDTH: int = int(os.getenv("STREAM_MAX_WIDTH", "320"))
STREAM_JPEG_QUALITY: int = int(os.getenv("STREAM_JPEG_QUALITY", "45"))
WS_BROADCAST_EVERY_N: int = int(os.getenv("WS_BROADCAST_EVERY_N", "2"))
CAMERA_INPUT_MAX_WIDTH_GPU: int = int(os.getenv("CAMERA_INPUT_MAX_WIDTH_GPU", "512"))
CAMERA_INPUT_MAX_WIDTH_CPU: int = int(os.getenv("CAMERA_INPUT_MAX_WIDTH_CPU", "384"))

# ============================================================
# Detection Quality (lihat docs/plans/detection-quality-fix.md)
# ============================================================
# Jumlah frame BERTURUT-TURUT dengan violation sebelum publish MQTT/WA.
# Default 5 frame (~0.25 detik di 20 FPS) — mengurangi false positive
# akibat jitter satu-frame (motion blur, oklusi sementara).
MIN_VIOLATION_STREAK: int = int(os.getenv("MIN_VIOLATION_STREAK", "5"))

# Aktifkan inference half-precision (FP16) di GPU untuk percepatan 1.5–2×.
# Otomatis di-disable saat CPU mode (CPU tidak support FP16 di YOLOv8).
# Set USE_FP16=0 untuk debug atau kalau model tidak support half.
USE_FP16: bool = os.getenv("USE_FP16", "1").strip() not in ("0", "false", "False", "")

# Class-specific confidence threshold. Negative class (no_helmet, no_vest)
# lebih rawan false positive (sering muncul di dada padahal harusnya di
# kepala), jadi threshold-nya dinaikkan dibanding positive class.
# HELMET_CONF default 0.55 setelah lapangan menemukan model false-positive
# helmet di rambut/kepala dengan conf 0.41-0.57.
HELMET_CONF: float = float(os.getenv("HELMET_CONF", "0.55"))
VEST_CONF: float = float(os.getenv("VEST_CONF", "0.40"))
NO_HELMET_CONF: float = float(os.getenv("NO_HELMET_CONF", "0.60"))
NO_VEST_CONF: float = float(os.getenv("NO_VEST_CONF", "0.60"))

# Sliding window untuk temporal smoothing. Dipakai di
# ServiceAPDBackend.process_camera_node — alarm hanya publish kalau
# minimal `VIOLATION_CONFIRM_FRAMES` dari `VIOLATION_WINDOW_FRAMES` frame
# inference terakhir adalah violation dengan missing type yang sama.
# Lebih tahan jitter daripada consecutive streak.
VIOLATION_WINDOW_FRAMES: int = int(os.getenv("VIOLATION_WINDOW_FRAMES", "8"))
VIOLATION_CONFIRM_FRAMES: int = int(os.getenv("VIOLATION_CONFIRM_FRAMES", "6"))

# Interval (detik) Python me-refresh threshold dari `/api/settings`.
# Operator yang ubah slider di dashboard akan ter-apply maks N detik
# kemudian tanpa perlu restart backend.
SETTINGS_REFRESH_INTERVAL_S: int = int(os.getenv("SETTINGS_REFRESH_INTERVAL_S", "300"))


# ============================================================
# WebSocket Server
# ============================================================
WEBSOCKET_HOST: str = os.getenv("WEBSOCKET_HOST", "0.0.0.0")
WEBSOCKET_PORT: int = int(os.getenv("WEBSOCKET_PORT", "8765"))

# ============================================================
# MJPEG Server
# ============================================================
MJPEG_HOST: str = os.getenv("MJPEG_HOST", "127.0.0.1")
MJPEG_PORT: int = int(os.getenv("MJPEG_PORT", "8766"))

# ============================================================
# Dashboard
# ============================================================
DASHBOARD_API_URL: str = os.getenv("DASHBOARD_API_URL", "http://127.0.0.1:3000")
APD_SERVICE_TOKEN: str = os.getenv("APD_SERVICE_TOKEN", "")

# ============================================================
# GPU
# ============================================================
GPU_DEVICE_INDEX: int = int(os.getenv("GPU_DEVICE_INDEX", "0"))

# ============================================================
# Model Paths
# ============================================================
# Weights disimpan di models/ (lihat models/README.md untuk cara dapat).
# PPE_MODEL_PATH di-override jadi runs/.../best.pt jika user habis training
# (output ultralytics) — fallback ke models/ppe_best.pt yang stable.
PPE_MODEL_PATH: str = os.getenv(
    "PPE_MODEL_PATH",
    str(BASE_DIR / "models" / "ppe_best.pt"),
)
PERSON_MODEL_PATH: str = os.getenv(
    "PERSON_MODEL_PATH",
    str(BASE_DIR / "models" / "yolov8n.pt"),
)

# ============================================================
# Dataset
# ============================================================
ROBOFLOW_API_KEY: str = os.getenv("ROBOFLOW_API_KEY", "")
DATA_YAML: str = os.getenv("DATA_YAML", str(BASE_DIR / "CHV-YOLOv8" / "data.yaml"))

# ============================================================
# PPE Classes
# ============================================================
PPE_CLASSES = {0: "helmet", 1: "no_helmet", 2: "vest", 3: "no_vest"}
SAFE_CLASSES = {"helmet", "vest"}
VIOLATION_CLASSES = {"no_helmet", "no_vest"}
