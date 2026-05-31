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
# AES128 Encryption (key dan iv HARUS 16 bytes)
# ============================================================
AES_KEY: bytes = os.getenv("AES_KEY", "16bytekey1234567").encode("utf-8")[:16]
AES_IV: bytes = os.getenv("AES_IV", "16byteiv12345678").encode("utf-8")[:16]

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
COOLDOWN_SECONDS: int = int(os.getenv("COOLDOWN_SECONDS", "2"))
WA_COOLDOWN_SECONDS: int = int(os.getenv("WA_COOLDOWN_SECONDS", "120"))
SEND_FRAME_INTERVAL: float = 0.1

# ============================================================
# WebSocket Server
# ============================================================
WEBSOCKET_HOST: str = os.getenv("WEBSOCKET_HOST", "0.0.0.0")
WEBSOCKET_PORT: int = int(os.getenv("WEBSOCKET_PORT", "8765"))

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
PPE_MODEL_PATH: str = str(
    BASE_DIR / "runs" / "detect" / "ppe_training" / "helmet_vest_v1" / "weights" / "best.pt"
)
PERSON_MODEL_PATH: str = str(BASE_DIR / "yolov8n.pt")

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
