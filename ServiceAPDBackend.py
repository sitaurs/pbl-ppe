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
from datetime import datetime

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
from Crypto.Util.Padding import pad
from ultralytics import YOLO

# Konfigurasi terpusat dari .env
import config

# =========================
# Konfigurasi Logging
# =========================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(threadName)s - %(message)s",
    handlers=[
        logging.FileHandler("apd_detection.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# =========================
# Konfigurasi dari config.py (dibaca dari .env)
# =========================
DASHBOARD_API_URL = config.DASHBOARD_API_URL
WA_API_URL = config.WA_API_URL
WA_API_USER = config.WA_API_USER
WA_API_PASS = config.WA_API_PASS
WA_DEVICE_ID = config.WA_DEVICE_ID

def get_registered_nodes():
    """Membaca semua data Node/Kamera dari db.json Web Dashboard."""
    db_path = os.path.join(BASE_DIR, "web-dashboard", "data", "db.json")
    try:
        if os.path.exists(db_path):
            with open(db_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("nodes", [])
    except Exception as e:
        logger.error(f"Failed to read db.json for Nodes: {e}")
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

def log_violation_to_dashboard(sektor_id, sektor_name, pic_name, pic_phone, violations, camera_source, wa_status):
    """Mencatat pelanggaran ke halaman Log Pelanggaran di Dashboard."""
    try:
        payload = {
            "sektorId": sektor_id,
            "sektorName": sektor_name,
            "picName": pic_name,
            "picPhone": pic_phone,
            "violations": violations,
            "cameraSource": camera_source,
            "waStatus": wa_status
        }
        requests.post(f"{DASHBOARD_API_URL}/api/violations", json=payload, timeout=5)
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
AES_IV: bytes = config.AES_IV
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

    @staticmethod
    def encrypt_aes128(plaintext):
        try:
            cipher = AES.new(AES_KEY, AES_MODE, AES_IV)
            plaintext_bytes = plaintext.encode("utf-8") if isinstance(plaintext, str) else plaintext
            padded_data = pad(plaintext_bytes, AES.block_size)
            encrypted_bytes = cipher.encrypt(padded_data)
            return base64.b64encode(encrypted_bytes).decode("utf-8")
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
        sektor_name = node.get("sektorName", f"Kamera {camera_source}")
        logger.info(f"[{sektor_name}] Thread started. Connecting to {camera_source}")
        
        cap = self.connect_camera(camera_source)
        if not cap:
            logger.error(f"[{sektor_name}] Gagal terkoneksi ke kamera!")
            return

        last_notification_time = 0.0
        last_wa_notification_time = 0.0
        last_frame_send_time = 0.0
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
                    self._last_annotated = annotated_frame
                    self._last_safe = safe
                    self._last_violations = violations
                else:
                    annotated_frame = getattr(self, '_last_annotated', frame)
                    safe = getattr(self, '_last_safe', [])
                    violations = getattr(self, '_last_violations', [])

                current_time = time.time()
                has_violation = len(violations) > 0

                # 1. Notifikasi Pelanggaran (MQTT & WA)
                if has_violation and (current_time - last_notification_time) > COOLDOWN_SECONDS:
                    violation_names = [v["class"].replace("_", " ") for v in violations]
                    
                    # Kirim MQTT Alert Terenkripsi
                    if self.mqtt_client is not None:
                        msg = json.dumps({"event": "apd_violation", "violations": violation_names, "camera_source": camera_source})
                        enc_msg = self.encrypt_aes128(msg)
                        if enc_msg:
                            self.mqtt_client.publish(MQTT_TOPIC_VIOLATION, enc_msg, qos=1)

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
                                
                            # Simpan Log ke Dashboard
                            log_violation_to_dashboard(sektor_id, sektor_name, pic_name, pic_phone, violation_names, camera_source, wa_status)

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
                            "node_id": camera_source,
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
            logger.warning("Tidak ada Node aktif terdaftar di db.json. Menjalankan fallback webcam 0.")
            nodes = [{"sektorName": "Default Webcam", "cameraSource": "0"}]

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
