# ServiceAPDBackend.py
# Backend untuk deteksi APD (Helmet & Vest) menggunakan YOLOv8 custom model
import asyncio
import base64
import json
import logging
import os
import signal
import ssl
import sys
import threading
import time
import requests
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "0")
os.makedirs(os.path.join(BASE_DIR, ".ultralytics"), exist_ok=True)
os.environ.setdefault("YOLO_CONFIG_DIR", os.path.join(BASE_DIR, ".ultralytics"))
# Stabilkan RTSP IP camera: paksa TCP agar paket H.264 tidak mudah hilang
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp|stimeout;5000000")
os.environ.setdefault("OPENCV_FFMPEG_LOGLEVEL", "16")

import cv2
import paho.mqtt.client as mqtt
import torch
import websockets
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad
from ultralytics import YOLO

# Konfigurasi terpusat dari .env
import config

# =========================
# Konfigurasi Logging
# =========================
# Paksa stdout/stderr ke UTF-8 agar emoji (⚠ 🚨 dll) tidak error di
# terminal Windows yang default-nya cp1252.
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(threadName)s - %(message)s",
    handlers=[
        logging.FileHandler("apd_detection.log", encoding="utf-8"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# =========================
# Konfigurasi dari config.py (dibaca dari .env)
# =========================
DASHBOARD_API_URL = config.DASHBOARD_API_URL
APD_SERVICE_TOKEN = config.APD_SERVICE_TOKEN
WA_API_URL = config.WA_API_URL
WA_API_USER = config.WA_API_USER
WA_API_PASS = config.WA_API_PASS
WA_DEVICE_ID = config.WA_DEVICE_ID

# Header default untuk request ke Next.js Dashboard.
# Semua endpoint /api/* di Next.js kini diproteksi middleware auth/RBAC.
# Python backend pakai Service Token (bypass session + CSRF) lewat loopback 127.0.0.1.
DASHBOARD_HEADERS = {"Authorization": f"Bearer {APD_SERVICE_TOKEN}"} if APD_SERVICE_TOKEN else {}

# =========================
# Validasi env wajib (Requirement 5.4)
# =========================
# Service tidak boleh jalan dengan kredensial default lemah. Bila salah satu env
# critical kosong, log error eksplisit dan exit dengan code != 0 supaya operator
# segera memperbaiki .env (bukan diam-diam jalan dengan fallback).
REQUIRED_ENV = [
    "MQTT_HOSTNAME",
    "MQTT_USERNAME",
    "MQTT_PASSWORD",
    "AES_KEY",
    "APD_SERVICE_TOKEN",
]
_missing_env = [k for k in REQUIRED_ENV if not os.getenv(k)]
if _missing_env:
    logger.error(
        "Missing required env vars: %s. Periksa file .env (lihat .env.example).",
        _missing_env,
    )
    sys.exit(1)


def get_registered_nodes():
    """Ambil daftar node aktif dari Dashboard API (sumber tunggal kebenaran).

    Setelah migrasi JSON → SQLite (spec auth-rbac-system Req 2), `data/db.json`
    hanya berfungsi sebagai backup; data live ada di SQLite dan diakses lewat
    HTTP API. Python perlu menyertakan header `Authorization: Bearer <token>`
    karena middleware Next.js menolak request anonim.
    """
    if not APD_SERVICE_TOKEN:
        logger.error("APD_SERVICE_TOKEN tidak terkonfigurasi di .env. Tidak dapat memuat daftar node.")
        return []
    try:
        url = f"{DASHBOARD_API_URL}/api/nodes"
        resp = requests.get(url, headers=DASHBOARD_HEADERS, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            # Endpoint mengembalikan langsung array node (lihat src/app/api/nodes/route.ts).
            # Filter node yang enabled saja (default True bila field tidak ada).
            nodes = data if isinstance(data, list) else data.get("nodes", [])
            return [n for n in nodes if n.get("enabled", True)]
        if resp.status_code == 401:
            logger.error(
                "GET /api/nodes ditolak 401. Cek APD_SERVICE_TOKEN apakah sama "
                "dengan web-dashboard/.env.local"
            )
        else:
            logger.error(f"GET /api/nodes mengembalikan status {resp.status_code}: {resp.text[:200]}")
    except requests.exceptions.ConnectionError:
        logger.error(
            f"Tidak dapat terhubung ke Dashboard di {DASHBOARD_API_URL}. "
            "Pastikan Next.js sudah jalan (npm run start) sebelum start Python."
        )
    except Exception as e:
        logger.error(f"Failed to fetch nodes from Dashboard API: {e}")

    # Fallback: baca db.json langsung kalau API tidak tersedia.
    # Berguna untuk troubleshooting saat Next.js belum siap.
    db_path = os.path.join(BASE_DIR, "web-dashboard", "data", "db.json")
    try:
        if os.path.exists(db_path):
            logger.warning("Fallback: membaca db.json langsung (mode degraded).")
            with open(db_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                nodes = data.get("nodes", [])
                return [n for n in nodes if n.get("enabled", True)]
    except Exception as e:
        logger.error(f"Fallback db.json juga gagal: {e}")
    return []

def send_whatsapp_alert(phone: str, message: str, image_frame=None, camera_source="default"):
    """Mengirim pesan WA & gambar menggunakan GoWA REST API sesuai spesifikasi dokumentasi."""
    phone_jid = f"{phone}@s.whatsapp.net"
    headers = {"X-Device-Id": WA_DEVICE_ID}
    auth = (WA_API_USER, WA_API_PASS)
    
    try:
        if image_frame is not None:
            # Gunakan nama file sementara yang unik per kamera untuk hindari race condition
            safe_source = str(camera_source).replace("/", "_").replace(":", "_")
            tmp_path = os.path.join(BASE_DIR, f"tmp_violation_{safe_source}.jpg")
            
            # Compress image to save bandwidth and API limits
            cv2.imwrite(tmp_path, image_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
            
            # API GoWA mensyaratkan multipart/form-data via files parameter di requests
            with open(tmp_path, "rb") as f:
                files = {"image": ("violation.jpg", f, "image/jpeg")}
                data = {
                    "phone": phone_jid, 
                    "caption": message,
                    "compress": "true"
                }
                resp = requests.post(f"{WA_API_URL}/send/image", auth=auth, headers=headers, data=data, files=files, timeout=15)
            
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
                
            success = resp.status_code == 200
            if not success:
                logger.error(f"GoWA Error Response: {resp.text}")
            return success, "sent" if success else "failed"
            
        else:
            payload = {"phone": phone_jid, "message": message}
            headers["Content-Type"] = "application/json"
            resp = requests.post(f"{WA_API_URL}/send/message", auth=auth, headers=headers, json=payload, timeout=10)
            
            success = resp.status_code == 200
            if not success:
                logger.error(f"GoWA Error Response: {resp.text}")
            return success, "sent" if success else "failed"
            
    except Exception as e:
        logger.error(f"Exception sending WA Notification: {e}")
        return False, "failed"

def log_violation_to_dashboard(node_id, sektor_id, sektor_name, pic_name, pic_phone, violations, camera_source, wa_status):
    """Mencatat pelanggaran ke Dashboard via POST /api/violations.

    Endpoint ini memerlukan header `Authorization: Bearer <APD_SERVICE_TOKEN>`
    karena middleware Next.js menolak request anonim. Service Token
    sudah di-whitelist untuk endpoint ini di permission-map.ts.

    node_id WAJIB id asli node di DB (Node.id, contoh: 1), BUKAN camera_source
    ("0") — karena Next.js mencari node by id.
    """
    if not APD_SERVICE_TOKEN:
        logger.error("APD_SERVICE_TOKEN kosong. Skip logging violation.")
        return
    if node_id is None:
        logger.error("node_id None. Skip logging violation (node tanpa id).")
        return
    try:
        # Mapping ke kontrak Next.js POST /api/violations:
        # { timestamp?, nodeId (string|number), sektorId?, ppeMissing[], imageRef? }
        payload = {
            "nodeId": node_id,
            "sektorId": sektor_id,
            "ppeMissing": violations,
            "imageRef": "",
        }
        headers = dict(DASHBOARD_HEADERS)
        headers["Content-Type"] = "application/json"
        resp = requests.post(
            f"{DASHBOARD_API_URL}/api/violations",
            json=payload,
            headers=headers,
            timeout=5,
        )
        if resp.status_code != 200:
            logger.error(
                f"POST /api/violations gagal status={resp.status_code}: {resp.text[:200]}"
            )
        else:
            logger.info(
                f"Violation logged: node={node_id} sektor={sektor_name} pic={pic_name} "
                f"missing={violations} wa={wa_status}"
            )
    except Exception as e:
        logger.error(f"Failed to log violation to dashboard API: {e}")

# =========================
# Konfigurasi dari config.py
# =========================
MQTT_HOSTNAME: str = config.MQTT_HOSTNAME
MQTT_PORT: int = config.MQTT_PORT
MQTT_USERNAME: str = config.MQTT_USERNAME
MQTT_PASSWORD: str = config.MQTT_PASSWORD
MQTT_TOPIC_VIOLATION: str = config.MQTT_TOPIC_VIOLATION
MQTT_TOPIC_FRAME: str = config.MQTT_TOPIC_FRAME
MQTT_ENABLED: bool = True

AES_KEY: bytes = config.AES_KEY
AES_MODE: int = AES.MODE_CBC

CONFIDENCE_THRESHOLD: float = config.CONFIDENCE_THRESHOLD
PERSON_CONFIDENCE_THRESHOLD: float = config.PERSON_CONFIDENCE_THRESHOLD
COOLDOWN_SECONDS: int = config.COOLDOWN_SECONDS
WA_COOLDOWN_SECONDS: int = config.WA_COOLDOWN_SECONDS
SEND_FRAME_INTERVAL: float = config.SEND_FRAME_INTERVAL

USE_GPU: bool = True
GPU_DEVICE_INDEX: int = config.GPU_DEVICE_INDEX
PPE_MODEL_PATH: str = config.PPE_MODEL_PATH
PERSON_MODEL_PATH: str = config.PERSON_MODEL_PATH

PPE_CLASSES = config.PPE_CLASSES
SAFE_CLASSES = config.SAFE_CLASSES
VIOLATION_CLASSES = config.VIOLATION_CLASSES

COLOR_SAFE = (0, 255, 0)        # Hijau
COLOR_VIOLATION = (0, 0, 255)   # Merah

WEBSOCKET_HOST: str = config.WEBSOCKET_HOST
WEBSOCKET_PORT: int = config.WEBSOCKET_PORT

# =========================
# Gas telemetry (Requirement 8.3, 8.4, 8.7)
# =========================
# Wildcard topic untuk telemetri MQ-135 dari semua ESP32. Setiap node publish
# ke `apd/telemetry/gas/<nodeId>` dengan payload JSON terenkripsi AES-128-CBC.
GAS_TELEMETRY_TOPIC: str = "apd/telemetry/gas/+"
# Setelah alert sustained selama N detik, kirim WA. Sesuai requirement 8.7.
GAS_ALERT_SUSTAIN_SECONDS: int = 30
# Cooldown antar WA gas alert per-node supaya tidak spam saat alert lama bertahan.
GAS_ALERT_WA_COOLDOWN_SECONDS: int = 600  # 10 menit
# Refresh interval cache nodes untuk lookup PIC saat kirim WA.
NODES_CACHE_TTL_SECONDS: int = 60

class APDDetectionService:
    def __init__(self):
        self.model = None
        self.person_model = None
        self.mqtt_client = None
        self.device = f"cuda:{GPU_DEVICE_INDEX}"

        self.running = True
        self.websocket_clients = set()
        self.loop = None
        self.websocket_thread = None
        
        # Lock inference karena YOLO dipanggil dari banyak thread kamera bersamaan
        self.inference_lock = threading.Lock()
        # Thread kamera
        self.camera_threads = []

        # State gas telemetry per-node untuk deteksi alert sustained > 30 detik
        # (Requirement 8.7). Key = nodeId (int), value = dict:
        #   { "alert_since": float | None, "last_wa_at": float, "sektor_id": str }
        self.gas_alert_state = {}
        self.gas_alert_lock = threading.Lock()

        # Cache daftar node untuk lookup PIC saat kirim WA gas. Refresh setiap
        # NODES_CACHE_TTL_SECONDS supaya perubahan PIC di dashboard ter-pickup
        # tanpa restart service.
        self._nodes_cache = []
        self._nodes_cache_at = 0.0
        self._nodes_cache_lock = threading.Lock()

    @staticmethod
    def encrypt_aes128(plaintext):
        """Encrypt plaintext dengan AES-128-CBC dan random IV per-pesan.

        Format output: base64(IV[16 byte] || ciphertext). IV bukan rahasia,
        tapi WAJIB unik per pesan untuk mencegah pola CBC yang bisa dianalisis.
        ESP32 firmware mengekstrak 16 byte pertama sebagai IV lalu decrypt
        sisanya. Lihat requirements 4.2 dan 4.6.
        """
        try:
            iv = os.urandom(16)
            cipher = AES.new(AES_KEY, AES_MODE, iv)
            plaintext_bytes = plaintext.encode("utf-8") if isinstance(plaintext, str) else plaintext
            padded_data = pad(plaintext_bytes, AES.block_size)
            encrypted_bytes = cipher.encrypt(padded_data)
            return base64.b64encode(iv + encrypted_bytes).decode("utf-8")
        except Exception:
            return None

    @staticmethod
    def decrypt_aes128(b64_str):
        """Decrypt base64(IV || ciphertext) yang diterima dari ESP32.

        Dipakai untuk telemetri masuk (misal payload sensor gas MQ-135 yang
        di-publish ESP32 ke topic `apd/telemetry/gas/{nodeId}`). Return
        plaintext string UTF-8 atau None bila gagal.
        """
        try:
            raw = base64.b64decode(b64_str)
            if len(raw) < 32:  # min 16 IV + 16 satu blok ciphertext
                return None
            iv, ct = raw[:16], raw[16:]
            cipher = AES.new(AES_KEY, AES_MODE, iv)
            plaintext = unpad(cipher.decrypt(ct), AES.block_size)
            return plaintext.decode("utf-8")
        except Exception:
            return None

    def load_model(self):
        try:
            if USE_GPU and torch.cuda.is_available():
                torch.cuda.set_device(GPU_DEVICE_INDEX)
                self.device = f"cuda:{GPU_DEVICE_INDEX}"
                self.model = YOLO(PPE_MODEL_PATH)
                self.model.to(self.device)
                self.person_model = YOLO(PERSON_MODEL_PATH)
                self.person_model.to(self.device)
                gpu_name = torch.cuda.get_device_name(GPU_DEVICE_INDEX)
                logger.info(f"Models loaded on GPU: {gpu_name}")
            else:
                # CPU fallback — lambat tapi jalan untuk testing
                self.device = "cpu"
                self.model = YOLO(PPE_MODEL_PATH)
                self.person_model = YOLO(PERSON_MODEL_PATH)
                logger.warning("⚠ CUDA tidak tersedia. Berjalan di CPU mode (lambat, untuk testing).")
                logger.warning("  Untuk performa optimal, gunakan laptop dengan GPU NVIDIA.")
            return True
        except Exception as e:
            logger.error(f"Failed to load YOLO models: {e}")
            return False

    # =========================
    # Gas telemetry helpers
    # =========================

    def _get_cached_nodes(self):
        """Kembalikan daftar node dari cache; refresh jika sudah kedaluwarsa.

        Cache TTL diatur via NODES_CACHE_TTL_SECONDS supaya perubahan PIC di
        dashboard ter-pickup tanpa restart service (Requirement 8.7).
        """
        now = time.time()
        with self._nodes_cache_lock:
            if now - self._nodes_cache_at > NODES_CACHE_TTL_SECONDS:
                try:
                    self._nodes_cache = get_registered_nodes()
                    self._nodes_cache_at = now
                except Exception as e:
                    logger.warning(f"Gagal refresh nodes cache: {e}")
            return list(self._nodes_cache)

    def handle_gas_telemetry(self, data: dict):
        """Proses satu pesan telemetri gas yang sudah di-decrypt.

        Langkah:
        1. Forward ke POST /api/telemetry/gas (Requirement 8.4).
        2. Track alert sustained > 30 detik → kirim WA ke PIC sektor
           (Requirement 8.7).
        """
        node_id = data.get("nodeId")
        sektor_id = data.get("sektorId", "")
        is_alert = data.get("alert", False)
        raw_value = data.get("raw", 0)

        # 1. Forward ke Next.js Dashboard (Requirement 8.4)
        try:
            headers = dict(DASHBOARD_HEADERS)
            headers["Content-Type"] = "application/json"
            resp = requests.post(
                f"{DASHBOARD_API_URL}/api/telemetry/gas",
                json=data,
                headers=headers,
                timeout=5,
            )
            if resp.status_code not in (200, 201):
                logger.warning(
                    f"[GasTelemetry] POST /api/telemetry/gas gagal status={resp.status_code}: "
                    f"{resp.text[:200]}"
                )
            else:
                logger.debug(
                    f"[GasTelemetry] nodeId={node_id} raw={raw_value} alert={is_alert} → forwarded."
                )
        except Exception as e:
            logger.error(f"[GasTelemetry] Gagal forward ke dashboard: {e}")

        # 2. Sustained-alert tracking → WA notification (Requirement 8.7)
        now = time.time()
        with self.gas_alert_lock:
            state = self.gas_alert_state.setdefault(
                node_id,
                {"alert_since": None, "last_wa_at": 0.0, "sektor_id": sektor_id},
            )
            state["sektor_id"] = sektor_id  # update jaga-jaga berubah

            if is_alert:
                if state["alert_since"] is None:
                    # Alert baru mulai
                    state["alert_since"] = now
                    logger.info(
                        f"[GasTelemetry] nodeId={node_id} sektor={sektor_id} — "
                        f"gas alert dimulai (raw={raw_value})."
                    )

                alert_duration = now - state["alert_since"]
                wa_cooldown_ok = (now - state["last_wa_at"]) > GAS_ALERT_WA_COOLDOWN_SECONDS

                if alert_duration >= GAS_ALERT_SUSTAIN_SECONDS and wa_cooldown_ok:
                    # Alert sudah bertahan > 30 detik dan cooldown WA selesai → kirim WA
                    state["last_wa_at"] = now
                    # Jalankan di thread terpisah agar tidak blokir loop MQTT
                    threading.Thread(
                        target=self._send_gas_alert_wa,
                        args=(node_id, sektor_id, raw_value, int(alert_duration)),
                        daemon=True,
                    ).start()
            else:
                if state["alert_since"] is not None:
                    logger.info(
                        f"[GasTelemetry] nodeId={node_id} sektor={sektor_id} — "
                        f"gas alert selesai (kembali normal)."
                    )
                state["alert_since"] = None

    def _send_gas_alert_wa(self, node_id, sektor_id: str, raw_value: int, duration_sec: int):
        """Kirim notifikasi WA untuk gas alert yang sudah bertahan > 30 detik.

        Lookup PIC dari cache nodes; jika tidak ketemu, tetap log peringatan.
        Sesuai Requirement 8.7.
        """
        # Cari PIC berdasarkan nodeId atau sektorId
        nodes = self._get_cached_nodes()
        pic_phone = None
        pic_name = "Unknown"
        sektor_name = sektor_id

        for n in nodes:
            if n.get("id") == node_id or n.get("sektorId") == sektor_id:
                pic_phone = n.get("picPhone")
                pic_name = n.get("picName", "Unknown")
                sektor_name = n.get("sektorName", sektor_id)
                break

        if not pic_phone:
            logger.warning(
                f"[GasTelemetry] Gas alert sustained nodeId={node_id} sektor={sektor_id} "
                f"tapi tidak ada picPhone terdaftar. Skip WA."
            )
            return

        message = (
            f"⚠️ *ALERT GAS BERBAHAYA* ⚠️\n\n"
            f"📍 Sektor: {sektor_name}\n"
            f"👤 PIC: {pic_name}\n"
            f"🌡 Nilai Sensor (ADC raw): {raw_value}\n"
            f"⏱ Durasi alert: {duration_sec} detik\n"
            f"🕐 Waktu: {datetime.now().strftime('%d/%m/%Y %H:%M:%S WIB')}\n\n"
            f"Segera periksa kondisi udara di area tersebut!"
        )
        logger.info(
            f"[GasTelemetry] Mengirim WA gas alert ke {pic_name} ({pic_phone}), "
            f"nodeId={node_id}, durasi={duration_sec}s."
        )
        success, status = send_whatsapp_alert(pic_phone, message)
        if success:
            logger.info(f"[GasTelemetry] WA gas alert terkirim ke {pic_phone}.")
        else:
            logger.error(f"[GasTelemetry] WA gas alert GAGAL dikirim ke {pic_phone} (status={status}).")

    # =========================
    # MQTT callbacks
    # =========================

    def _on_mqtt_connect(self, client, userdata, flags, rc):
        """Callback setelah MQTT connect. Subscribe ke wildcard gas telemetry topic.

        Menggunakan on_connect agar re-subscribe otomatis terjadi bila broker
        disconnect lalu reconnect (behavior standar paho-mqtt). Requirement 8.3.
        """
        if rc == 0:
            logger.info(
                f"[MQTT] Connected ke broker. "
                f"Subscribing ke wildcard topic: {GAS_TELEMETRY_TOPIC}"
            )
            client.subscribe(GAS_TELEMETRY_TOPIC, qos=1)
        else:
            logger.warning(f"[MQTT] Connect callback rc={rc} (non-zero = gagal).")

    def _on_mqtt_message(self, client, userdata, msg):
        """Callback routing pesan MQTT masuk berdasarkan topic.

        Saat ini hanya handle gas telemetry. Struktur if/elif memudahkan
        penambahan handler lain di masa depan (misal heartbeat, OTA ack).
        Requirement 8.3, 8.4.
        """
        topic: str = msg.topic
        try:
            if topic.startswith("apd/telemetry/gas/"):
                raw_payload = msg.payload.decode("utf-8").strip()
                plain = self.decrypt_aes128(raw_payload)
                if plain is None:
                    logger.warning(
                        f"[MQTT] Gagal decrypt pesan dari {topic}. "
                        f"Payload (truncated): {raw_payload[:80]}"
                    )
                    return
                data = json.loads(plain)
                self.handle_gas_telemetry(data)
            # Tambah elif untuk topic lain di sini bila perlu
        except json.JSONDecodeError as e:
            logger.warning(f"[MQTT] JSON parse error dari {topic}: {e}")
        except Exception as e:
            logger.warning(f"[MQTT] Error handle pesan dari {topic}: {e}")

    def setup_mqtt(self):
        if not MQTT_ENABLED: return False
        try:
            client_id = f"apd_multi_{datetime.now().strftime('%Y%m%d%H%M%S')}"
            try:
                self.mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, client_id=client_id, clean_session=True)
            except Exception:
                self.mqtt_client = mqtt.Client(client_id=client_id, clean_session=True)

            self.mqtt_client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
            # Hanya pakai TLS kalau port 8883 (cloud broker)
            if MQTT_PORT == 8883:
                self.mqtt_client.tls_set(cert_reqs=ssl.CERT_REQUIRED)

            # Daftarkan callbacks sebelum connect supaya on_connect dipanggil
            # saat TCP handshake selesai (termasuk saat reconnect otomatis).
            self.mqtt_client.on_connect = self._on_mqtt_connect
            self.mqtt_client.on_message = self._on_mqtt_message

            logger.info(f"Connecting to MQTT at {MQTT_HOSTNAME}:{MQTT_PORT}")
            self.mqtt_client.connect(MQTT_HOSTNAME, MQTT_PORT, 60)
            self.mqtt_client.loop_start()
            return True
        except Exception as e:
            logger.error(f"Failed to setup MQTT: {e}")
            self.mqtt_client = None
            return False

    def connect_camera(self, camera_source):
        try:
            # Parse jika numerik
            source = int(camera_source) if str(camera_source).isdigit() else camera_source
            
            if isinstance(source, int):
                cap = cv2.VideoCapture(source, cv2.CAP_DSHOW)
            else:
                cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)

            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            
            if not cap.isOpened():
                return None
            return cap
        except Exception:
            return None

    def detect_ppe(self, frame):
        """Deteksi dengan Locking agar multi-thread tidak berebut GPU context"""
        try:
            with self.inference_lock:
                ppe_results = self.model(frame, conf=CONFIDENCE_THRESHOLD, device=self.device, verbose=False)
                person_results = self.person_model(frame, conf=PERSON_CONFIDENCE_THRESHOLD, device=self.device, classes=[0], verbose=False)

            ppe_detections = []
            person_detections = []
            annotated_frame = frame.copy()

            for result in ppe_results:
                if result.boxes is not None:
                    for box in result.boxes:
                        class_id = int(box.cls[0])
                        class_name = PPE_CLASSES.get(class_id, f"class_{class_id}")
                        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                        ppe_detections.append({"class": class_name, "bbox": [x1, y1, x2, y2]})

            for result in person_results:
                if result.boxes is not None:
                    for box in result.boxes:
                        x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                        person_detections.append({"class": "person", "bbox": [x1, y1, x2, y2]})

            safe_detections = []
            violation_detections = []

            for person in person_detections:
                px1, py1, px2, py2 = person["bbox"]
                related_ppe = []
                
                # Cek intersection bounding box
                for ppe in ppe_detections:
                    x1, y1, x2, y2 = ppe["bbox"]
                    overlap_w = max(0, min(x2, px2) - max(x1, px1))
                    overlap_h = max(0, min(y2, py2) - max(y1, py1))
                    overlap_area = overlap_w * overlap_h
                    ppe_area = max(0, x2 - x1) * max(0, y2 - y1)
                    if ppe_area > 0 and (overlap_area / ppe_area) >= 0.35:
                        related_ppe.append(ppe)

                has_helmet = any(item["class"] == "helmet" for item in related_ppe)
                has_vest = any(item["class"] == "vest" for item in related_ppe)
                explicit_no_helmet = any(item["class"] == "no_helmet" for item in related_ppe)
                explicit_no_vest = any(item["class"] == "no_vest" for item in related_ppe)

                missing = []
                if explicit_no_helmet or not has_helmet: missing.append("helmet")
                if explicit_no_vest or not has_vest: missing.append("vest")

                if missing:
                    violation_detections.append({"class": "missing_" + "_".join(missing), "bbox": person["bbox"]})
                    # Gambar Kotak Merah
                    cv2.rectangle(annotated_frame, (px1, py1), (px2, py2), COLOR_VIOLATION, 3)
                    label = "APD TIDAK LENGKAP"
                    (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                    cv2.rectangle(annotated_frame, (px1, py1 - lh - 10), (px1 + lw, py1), COLOR_VIOLATION, -1)
                    cv2.putText(annotated_frame, label, (px1, py1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                else:
                    safe_detections.append({"class": "apd_complete", "bbox": person["bbox"]})

            # Jika tidak ada person, fallback ke deteksi object saja
            if not person_detections:
                safe_detections = [d for d in ppe_detections if d["class"] in SAFE_CLASSES]
                violation_detections = [d for d in ppe_detections if d["class"] in VIOLATION_CLASSES]

            cv2.putText(annotated_frame, f"APD OK: {len(safe_detections)} | Violation: {len(violation_detections)}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255,255,0), 2)
            
            return safe_detections, violation_detections, annotated_frame

        except Exception as e:
            logger.error(f"Error in PPE detection: {e}")
            return [], [], frame

    def process_camera_node(self, node):
        """Thread Worker per Kamera/Node."""
        camera_source = str(node.get("cameraSource", "0"))
        node_id = node.get("id")  # id asli node di DB (dipakai untuk POST violation)
        sektor_name = node.get("sektorName", f"Kamera {camera_source}")
        logger.info(f"[{sektor_name}] Thread started. Connecting to {camera_source}")
        
        cap = self.connect_camera(camera_source)
        if not cap:
            logger.error(f"[{sektor_name}] Gagal terkoneksi ke kamera!")
            return

        last_notification_time = 0.0
        last_wa_notification_time = 0.0
        last_frame_send_time = 0.0
        last_annotated = None
        last_safe = []
        last_violations = []
        frame_count = 0
        # Skip frames untuk hemat CPU — proses deteksi tiap N frame saja
        DETECT_EVERY_N = 3 if not torch.cuda.is_available() else 1

        while self.running:
            try:
                ret, frame = cap.read()
                if not ret:
                    logger.warning(f"[{sektor_name}] Stream putus. Mencoba reconnect...")
                    cap.release()
                    time.sleep(2)
                    cap = self.connect_camera(camera_source)
                    if not cap:
                        time.sleep(3)
                    continue

                frame_count += 1
                
                # Resize frame agar ringan (720p max)
                h, w = frame.shape[:2]
                if w > 720:
                    scale = 720 / w
                    frame = cv2.resize(frame, (720, int(h * scale)))

                # Skip frame — hanya deteksi setiap N frame, sisanya kirim frame terakhir
                if frame_count % DETECT_EVERY_N == 0:
                    safe, violations, annotated_frame = self.detect_ppe(frame)
                    last_annotated = annotated_frame
                    last_safe = safe
                    last_violations = violations
                else:
                    annotated_frame = last_annotated if last_annotated is not None else frame
                    safe = last_safe
                    violations = last_violations

                current_time = time.time()
                has_violation = len(violations) > 0

                # 1. Notifikasi Pelanggaran (MQTT & WA)
                if has_violation and (current_time - last_notification_time) > COOLDOWN_SECONDS:
                    violation_names = [v["class"].replace("_", " ") for v in violations]
                    
                    # Kirim MQTT Alert Terenkripsi ke topic per-node (Requirement 3.1-3.3).
                    # Backend tidak lagi publish ke topic global `APD_Violation`. Setiap
                    # ESP32 punya topic sendiri (`apd/alarm/<nodeId>`) yang disimpan di
                    # `node.esp32.mqttTopic`. Ini supaya hanya ESP32 di sektor terkait
                    # yang berbunyi — bukan semua unit di lapangan.
                    if self.mqtt_client is not None:
                        esp32_cfg = node.get("esp32") or {}
                        mqtt_topic = (esp32_cfg.get("mqttTopic") or "").strip()
                        esp32_enabled = esp32_cfg.get("enabled", True)

                        if not mqtt_topic or not esp32_enabled:
                            # Skip MQTT publish (ESP32 disabled / topic kosong) tapi
                            # log + WA tetap jalan supaya operator masih dapat alert.
                            logger.info(
                                f"[{sektor_name}] Skip MQTT publish — "
                                f"esp32.enabled={esp32_enabled}, mqttTopic={'<empty>' if not mqtt_topic else mqtt_topic!r}"
                            )
                        else:
                            payload = {
                                "event": "apd_violation",
                                "nodeId": node_id,
                                "sektorId": node.get("sektorId"),
                                "violations": violation_names,
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            }
                            enc_msg = self.encrypt_aes128(json.dumps(payload))
                            if enc_msg:
                                self.mqtt_client.publish(mqtt_topic, enc_msg, qos=1)
                                logger.debug(
                                    f"[{sektor_name}] MQTT publish ke {mqtt_topic} "
                                    f"(nodeId={node_id}, violations={violation_names})"
                                )

                    # Kirim WA jika cooldown selesai
                    if (current_time - last_wa_notification_time) > WA_COOLDOWN_SECONDS:
                        def wa_task():
                            pic_phone = node.get("picPhone")
                            pic_name = node.get("picName", "Unknown")
                            sektor_id = node.get("sektorId", "Unknown")
                            
                            if pic_phone:
                                wa_msg = (
                                    f"🚨 *ALERT PELANGGARAN APD*\n\n"
                                    f"📍 Sektor: {sektor_name}\n"
                                    f"👤 PIC: {pic_name}\n"
                                    f"⚠️ Jenis: {', '.join(violation_names)}\n"
                                    f"🕐 Waktu: {datetime.now().strftime('%d/%m/%Y %H:%M:%S WIB')}\n\n"
                                    f"Segera lakukan pengecekan di lokasi!"
                                )
                                logger.info(f"[{sektor_name}] Mengirim WA ke {pic_name} ({pic_phone})...")
                                success, wa_status = send_whatsapp_alert(pic_phone, wa_msg, annotated_frame, camera_source)
                                if success:
                                    logger.info(f"[{sektor_name}] WA terkirim sukses.")
                            else:
                                logger.warning(f"[{sektor_name}] Tidak ada nomor WA terdaftar.")
                                wa_status = "failed"
                                
                            # Simpan Log ke Dashboard (pakai node_id asli, bukan camera_source)
                            log_violation_to_dashboard(node_id, sektor_id, sektor_name, pic_name, pic_phone, violation_names, camera_source, wa_status)

                        # Jalankan kirim WA di background
                        threading.Thread(target=wa_task, daemon=True).start()
                        last_wa_notification_time = current_time

                    last_notification_time = current_time

                # 2. Kirim Frame Stream ke Dashboard (WebSocket)
                if (current_time - last_frame_send_time) > SEND_FRAME_INTERVAL:
                    # Resize sebelum dikirim via socket untuk hemat CPU/Bandwidth
                    h, w = annotated_frame.shape[:2]
                    fw = 480
                    fh = int(h * (fw / w))
                    resized = cv2.resize(annotated_frame, (fw, fh))
                    
                    success, buffer = cv2.imencode(".jpg", resized, [int(cv2.IMWRITE_JPEG_QUALITY), 65])
                    if success:
                        frame_b64 = base64.b64encode(buffer).decode("utf-8")
                        message = {
                            "event": "video_frame",
                            "node_id": str(node_id) if node_id is not None else camera_source,
                            "camera_source": camera_source,
                            "sector_name": sektor_name,
                            "frame": frame_b64,
                            "violations": [v["class"] for v in violations],
                            "safe_items": [s["class"] for s in safe],
                            "timestamp": datetime.now().isoformat()
                        }
                        
                        # Broadcast ke websocket
                        if self.loop and self.websocket_clients:
                            asyncio.run_coroutine_threadsafe(
                                self.broadcast_to_websocket(message), self.loop
                            )
                            
                    last_frame_send_time = current_time

                # Istirahatkan CPU sedikit
                time.sleep(0.01)

            except Exception as e:
                logger.error(f"[{sektor_name}] Error stream loop: {e}")
                time.sleep(1)

        if cap:
            cap.release()
        logger.info(f"[{sektor_name}] Thread stopped.")

    async def broadcast_to_websocket(self, data):
        if not self.websocket_clients: return
        message = json.dumps(data)
        disconnected = set()
        for client in list(self.websocket_clients):
            try: await client.send(message)
            except Exception: disconnected.add(client)
        self.websocket_clients -= disconnected

    async def websocket_handler(self, websocket, _path=None):
        self.websocket_clients.add(websocket)
        try:
            await websocket.send(json.dumps({"event": "connection", "status": "connected"}))
            async for _ in websocket: pass
        except Exception: pass
        finally:
            self.websocket_clients.discard(websocket)

    async def start_websocket_server(self):
        self.loop = asyncio.get_running_loop()
        async with websockets.serve(self.websocket_handler, WEBSOCKET_HOST, WEBSOCKET_PORT):
            logger.info(f"WebSocket server started on ws://{WEBSOCKET_HOST}:{WEBSOCKET_PORT}")
            await asyncio.Future()

    def run_websocket_server(self):
        asyncio.run(self.start_websocket_server())

    def stop_service(self):
        logger.info("Stopping Multi-Node APD Service...")
        self.running = False
        if self.mqtt_client:
            self.mqtt_client.loop_stop()
            self.mqtt_client.disconnect()
        sys.exit(0)

    def run(self):
        if not self.load_model(): return
        self.setup_mqtt()

        # Start WebSocket
        self.websocket_thread = threading.Thread(target=self.run_websocket_server, daemon=True)
        self.websocket_thread.start()
        time.sleep(1)

        # Start Camera Threads
        nodes = get_registered_nodes()
        # Only start enabled nodes
        nodes = [n for n in nodes if n.get("enabled", True)]
        if not nodes:
            logger.warning(
                "Tidak ada node aktif terdaftar. WebSocket tetap aktif, "
                "tetapi tidak ada kamera yang dijalankan sampai node ditambahkan."
            )

        logger.info(f"Mempersiapkan {len(nodes)} kamera/node untuk dimonitoring...")
        for node in nodes:
            t = threading.Thread(target=self.process_camera_node, args=(node,), daemon=True)
            self.camera_threads.append(t)
            t.start()

        try:
            while self.running: time.sleep(1)
        except KeyboardInterrupt:
            self.stop_service()

def signal_handler(_sig, _frame):
    sys.exit(0)

if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    service = APDDetectionService()
    service.run()
