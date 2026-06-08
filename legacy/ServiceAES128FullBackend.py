# ServiceAES128FullBackend.py
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
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "0")
os.makedirs(os.path.join(BASE_DIR, ".ultralytics"), exist_ok=True)
os.environ.setdefault("YOLO_CONFIG_DIR", os.path.join(BASE_DIR, ".ultralytics"))

import cv2
import paho.mqtt.client as mqtt
import torch
import websockets
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad
from ultralytics import YOLO


# =========================
# Konfigurasi Logging
# =========================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("person_detection.log"),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)


# =========================
# Konfigurasi MQTT HiveMQ
# =========================
MQTT_HOSTNAME: str = "f559f825bedc477fa8b74e7375f66fd2.s1.eu.hivemq.cloud"
MQTT_PORT: int = 8883
MQTT_USERNAME: str = "aldis"
MQTT_PASSWORD: str = "Polinema2026"
MQTT_TOPIC_PERSON: str = "Person"
MQTT_TOPIC_FRAME: str = "VideoFrame"


# =========================
# Konfigurasi AES128
# Wajib 16 byte untuk key dan iv
# =========================
AES_KEY: bytes = b"16bytekey1234567"
AES_IV: bytes = b"16byteiv12345678"
AES_MODE: int = AES.MODE_CBC


# =========================
# Konfigurasi Camera
# Menggunakan webcam laptop (index 0)
# Ganti index jika punya lebih dari 1 webcam
# =========================
CAMERA_INDEX: int = 0
CAMERA_RECONNECT_DELAY: int = 5
CAMERA_MAX_RECONNECT_ATTEMPTS: int = 10


# =========================
# Konfigurasi GPU
# Wajib pakai CUDA agar inference tidak membebani CPU.
# =========================
USE_GPU: bool = True
GPU_DEVICE_INDEX: int = 0


# =========================
# Konfigurasi Deteksi
# =========================
CONFIDENCE_THRESHOLD: float = 0.5
COOLDOWN_SECONDS: int = 2
SEND_FRAME_INTERVAL: float = 0.1
SHOW_PREVIEW_WINDOW: bool = True


# =========================
# Konfigurasi WebSocket Server
# =========================
WEBSOCKET_HOST: str = "0.0.0.0"
WEBSOCKET_PORT: int = 8765
WEBSOCKET_MAX_CLIENTS: int = 10


class PersonDetectionService:
    def __init__(self):
        self.model = None
        self.mqtt_client = None
        self.cap = None
        self.device = f"cuda:{GPU_DEVICE_INDEX}"

        self.running = True
        self.last_notification_time = 0.0
        self.last_frame_send_time = 0.0
        self.person_detected = False
        self.show_preview_window = SHOW_PREVIEW_WINDOW

        self.websocket_clients = set()
        self.loop = None
        self.websocket_thread = None

    @staticmethod
    def encrypt_aes128(plaintext):
        """Encrypt data using AES128 CBC mode and return Base64 encoded string."""
        try:
            cipher = AES.new(AES_KEY, AES_MODE, AES_IV)

            if isinstance(plaintext, str):
                plaintext_bytes = plaintext.encode("utf-8")
            else:
                plaintext_bytes = plaintext

            padded_data = pad(plaintext_bytes, AES.block_size)
            encrypted_bytes = cipher.encrypt(padded_data)
            encrypted_base64 = base64.b64encode(encrypted_bytes).decode("utf-8")

            return encrypted_base64

        except Exception as e:
            logger.error(f"Encryption error: {e}")
            return None

    @staticmethod
    def create_mqtt_client(client_id):
        """
        Membuat MQTT client yang kompatibel dengan paho-mqtt versi lama dan baru.
        """
        try:
            return mqtt.Client(
                mqtt.CallbackAPIVersion.VERSION1,
                client_id=client_id,
                clean_session=True
            )
        except Exception:
            return mqtt.Client(
                client_id=client_id,
                clean_session=True
            )

    def load_model(self):
        """Load YOLO model. Inference wajib berjalan di GPU CUDA."""
        try:
            if not USE_GPU:
                logger.error("USE_GPU=False. Service ini dikonfigurasi GPU-only.")
                return False

            if not torch.cuda.is_available():
                logger.error("CUDA tidak tersedia. Service dibatalkan supaya inference tidak berjalan di CPU.")
                logger.error("Install PyTorch CUDA, contoh: pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121")
                return False

            torch.cuda.set_device(GPU_DEVICE_INDEX)
            torch.backends.cudnn.benchmark = True
            self.device = f"cuda:{GPU_DEVICE_INDEX}"

            gpu_name = torch.cuda.get_device_name(GPU_DEVICE_INDEX)
            gpu_memory = torch.cuda.get_device_properties(GPU_DEVICE_INDEX).total_memory / (1024**3)
            logger.info(f"GPU detected: {gpu_name} ({gpu_memory:.1f} GB)")
            logger.info("YOLO inference will run on GPU (CUDA)")

            logger.info(f"Loading YOLO model on device: {self.device}...")
            self.model = YOLO(os.path.join(BASE_DIR, "yolov8n.pt"))
            self.model.to(self.device)
            logger.info(f"YOLO model loaded successfully on {self.device.upper()}")
            return True

        except Exception as e:
            logger.error(f"Failed to load YOLO model: {e}")
            return False

    def setup_mqtt(self):
        """Setup MQTT connection to HiveMQ Cloud."""
        try:
            client_id = f"person_detection_{datetime.now().strftime('%Y%m%d%H%M%S')}"
            self.mqtt_client = self.create_mqtt_client(client_id)

            self.mqtt_client.username_pw_set(
                MQTT_USERNAME,
                MQTT_PASSWORD
            )

            self.mqtt_client.tls_set(cert_reqs=ssl.CERT_REQUIRED)

            self.mqtt_client.on_connect = self.on_connect
            self.mqtt_client.on_disconnect = self.on_disconnect
            self.mqtt_client.on_publish = self.on_publish

            logger.info(f"Connecting to MQTT at {MQTT_HOSTNAME}:{MQTT_PORT}")

            self.mqtt_client.connect(
                MQTT_HOSTNAME,
                MQTT_PORT,
                60
            )

            self.mqtt_client.loop_start()

            return True

        except Exception as e:
            logger.error(f"Failed to setup MQTT: {e}")
            return False

    def on_connect(self, _client, _userdata, _flags, rc):
        if rc == 0:
            logger.info("Connected to HiveMQ broker successfully")
        else:
            logger.error(f"Failed to connect to HiveMQ broker with code: {rc}")

    def on_disconnect(self, _client, _userdata, rc):
        logger.warning(f"Disconnected from HiveMQ broker with code: {rc}")

        if self.running:
            logger.info("Attempting to reconnect...")

    @staticmethod
    def on_publish(_client, _userdata, mid):
        logger.debug(f"Message published with ID: {mid}")

    def connect_camera(self):
        """Connect to laptop webcam."""
        try:
            logger.info(f"Connecting to webcam (index: {CAMERA_INDEX})...")

            self.cap = cv2.VideoCapture(CAMERA_INDEX, cv2.CAP_DSHOW)
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
            self.cap.set(cv2.CAP_PROP_FPS, 30)

            if not self.cap.isOpened():
                logger.error("Cannot open webcam. Make sure no other app is using it.")
                return False

            actual_w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            actual_fps = self.cap.get(cv2.CAP_PROP_FPS)
            logger.info(f"Webcam connected: {actual_w}x{actual_h} @ {actual_fps:.0f}fps")
            return True

        except Exception as e:
            logger.error(f"Failed to connect webcam: {e}")
            return False

    async def broadcast_to_websocket(self, data):
        """Broadcast data to all connected WebSocket clients."""
        if not self.websocket_clients:
            return

        message = json.dumps(data)
        disconnected_clients = set()

        for client in list(self.websocket_clients):
            try:
                await client.send(message)
            except Exception:
                disconnected_clients.add(client)

        self.websocket_clients -= disconnected_clients

        if disconnected_clients:
            logger.info(f"Removed {len(disconnected_clients)} disconnected clients")

    def broadcast_plain_to_frontend(self, message):
        """Kirim data plain JSON ke frontend melalui WebSocket."""
        if self.loop and self.websocket_clients:
            asyncio.run_coroutine_threadsafe(
                self.broadcast_to_websocket(message),
                self.loop
            )

    def send_mqtt_notification(self, has_person, num_person, frame=None):
        """
        Kirim notifikasi MQTT terenkripsi dan broadcast data plain ke frontend.
        """
        if self.mqtt_client is None:
            logger.error("MQTT client is not initialized")
            return

        current_time = time.time()

        if has_person and (current_time - self.last_notification_time) > COOLDOWN_SECONDS:
            message = {
                "event": "person_detected",
                "message": "Kamera mendeteksi manusia",
                "timestamp": datetime.now().isoformat(),
                "num_person": num_person,
                "camera_source": f"Webcam (index: {CAMERA_INDEX})"
            }

            try:
                json_message = json.dumps(message)
                encrypted_message = self.encrypt_aes128(json_message)

                if encrypted_message:
                    result = self.mqtt_client.publish(
                        MQTT_TOPIC_PERSON,
                        encrypted_message,
                        qos=1
                    )

                    self.broadcast_plain_to_frontend(message)

                    if result.rc == mqtt.MQTT_ERR_SUCCESS:
                        logger.info(f"Person detected: {num_person} person(s)")
                        self.last_notification_time = current_time
                        self.person_detected = True
                    else:
                        logger.error(f"Failed to publish message: {result.rc}")
                else:
                    logger.error("Encryption failed, message not sent")

            except Exception as e:
                logger.error(f"Error publishing MQTT message: {e}")

        if frame is not None and (current_time - self.last_frame_send_time) > SEND_FRAME_INTERVAL:
            self.send_frame_via_mqtt(frame, has_person, num_person)
            self.last_frame_send_time = current_time

    def send_frame_via_mqtt(self, frame, has_person, num_person):
        """
        Kirim frame terenkripsi ke MQTT dan broadcast frame plain ke frontend.
        """
        if self.mqtt_client is None:
            logger.error("MQTT client is not initialized")
            return

        try:
            height, width = frame.shape[:2]

            new_width = 640
            new_height = int(height * (new_width / width))
            frame_resized = cv2.resize(frame, (new_width, new_height))

            success, buffer = cv2.imencode(
                ".jpg",
                frame_resized,
                [int(cv2.IMWRITE_JPEG_QUALITY), 70]
            )

            if not success:
                logger.error("Failed to encode frame")
                return

            frame_base64 = base64.b64encode(buffer).decode("utf-8")

            message = {
                "event": "video_frame",
                "frame": frame_base64,
                "has_person": has_person,
                "num_person": num_person,
                "timestamp": datetime.now().isoformat()
            }

            json_message = json.dumps(message)
            encrypted_message = self.encrypt_aes128(json_message)

            if encrypted_message:
                self.mqtt_client.publish(
                    MQTT_TOPIC_FRAME,
                    encrypted_message,
                    qos=0
                )

                self.broadcast_plain_to_frontend(message)

                logger.debug(
                    f"Frame sent. Person: {has_person}, Count: {num_person}"
                )
            else:
                logger.error("Encryption failed, frame not sent")

        except Exception as e:
            logger.error(f"Failed to send frame: {e}")

    def detect_person(self, frame):
        """Detect person in frame using YOLO."""
        try:
            if self.model is None:
                logger.error("YOLO model is not loaded")
                return False, 0, frame, []

            results = self.model(
                frame,
                conf=CONFIDENCE_THRESHOLD,
                device=self.device,
                verbose=False
            )

            person_detections = []
            annotated_frame = frame.copy()

            for result in results:
                if result.boxes is not None:
                    for box in result.boxes:
                        if int(box.cls[0]) == 0:
                            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                            confidence = float(box.conf[0])

                            person_detections.append({
                                "bbox": [x1, y1, x2, y2],
                                "confidence": confidence
                            })

                            cv2.rectangle(
                                annotated_frame,
                                (x1, y1),
                                (x2, y2),
                                (0, 255, 0),
                                3
                            )

                            label = f"Person: {confidence:.2f}"

                            (label_w, label_h), _ = cv2.getTextSize(
                                label,
                                cv2.FONT_HERSHEY_SIMPLEX,
                                0.6,
                                2
                            )

                            cv2.rectangle(
                                annotated_frame,
                                (x1, y1 - 25),
                                (x1 + label_w, y1),
                                (0, 255, 0),
                                -1
                            )

                            cv2.putText(
                                annotated_frame,
                                label,
                                (x1, y1 - 8),
                                cv2.FONT_HERSHEY_SIMPLEX,
                                0.6,
                                (0, 0, 0),
                                2
                            )

            has_person = len(person_detections) > 0

            cv2.putText(
                annotated_frame,
                f"Person Count: {len(person_detections)}",
                (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                1,
                (0, 255, 0) if has_person else (0, 0, 255),
                2
            )

            cv2.putText(
                annotated_frame,
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                (10, 70),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255, 255, 255),
                2
            )

            return has_person, len(person_detections), annotated_frame, person_detections

        except Exception as e:
            logger.error(f"Error in detection: {e}")
            return False, 0, frame, []

    async def websocket_handler(self, websocket, _path=None):
        """
        Handle WebSocket connections from frontend.
        Parameter _path dibuat optional agar kompatibel dengan berbagai versi websockets.
        """
        client_address = websocket.remote_address

        if len(self.websocket_clients) >= WEBSOCKET_MAX_CLIENTS:
            await websocket.send(json.dumps({
                "event": "error",
                "message": "Maximum WebSocket clients reached"
            }))
            await websocket.close()
            return

        logger.info(f"New WebSocket client connected from {client_address}")

        self.websocket_clients.add(websocket)

        try:
            await websocket.send(json.dumps({
                "event": "connection",
                "status": "connected",
                "message": "Connected to Person Detection Service Proxy"
            }))

            async for message in websocket:
                try:
                    data = json.loads(message)

                    if data.get("command") == "ping":
                        await websocket.send(json.dumps({
                            "event": "pong",
                            "timestamp": datetime.now().isoformat()
                        }))
                        logger.debug(f"Ping from {client_address}")

                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON from client: {message}")

                except Exception as e:
                    logger.error(f"Error handling WebSocket message: {e}")

        except websockets.exceptions.ConnectionClosed as e:
            logger.info(f"WebSocket client disconnected: {e}")

        except Exception as e:
            logger.error(f"WebSocket error: {e}")

        finally:
            self.websocket_clients.discard(websocket)
            logger.info(
                f"Client {client_address} removed. "
                f"Total clients: {len(self.websocket_clients)}"
            )

    async def start_websocket_server(self):
        """Start WebSocket server."""
        self.loop = asyncio.get_running_loop()

        async with websockets.serve(
            self.websocket_handler,
            WEBSOCKET_HOST,
            WEBSOCKET_PORT,
            ping_interval=20,
            ping_timeout=60
        ):
            logger.info(
                f"WebSocket server started on ws://{WEBSOCKET_HOST}:{WEBSOCKET_PORT}"
            )
            logger.info("Waiting for client connections...")
            await asyncio.Future()

    def run_websocket_server(self):
        """Run WebSocket server in separate thread."""
        try:
            asyncio.run(self.start_websocket_server())

        except Exception as e:
            logger.error(f"WebSocket server error: {e}")

    def show_preview(self, frame):
        """Tampilkan preview OpenCV jika HighGUI tersedia."""
        if not self.show_preview_window:
            return False

        try:
            cv2.imshow("Person Detection - Webcam (GPU Accelerated)", frame)
            return cv2.waitKey(1) & 0xFF == ord("q")
        except cv2.error as e:
            self.show_preview_window = False
            logger.warning(
                "OpenCV HighGUI tidak tersedia, preview window dinonaktifkan. "
                "Deteksi tetap berjalan via MQTT/WebSocket."
            )
            logger.debug(f"OpenCV preview error: {e}")
            return False

    def process_stream(self):
        """Main loop to process camera stream."""
        if not self.connect_camera():
            logger.error("Cannot start stream processing")
            return

        frame_count = 0
        fps_start_time = time.time()
        fps = 0.0

        logger.info("Starting person detection stream processing...")
        logger.info(f"WebSocket proxy server running on port {WEBSOCKET_PORT}")
        logger.info(f"Connect browser to ws://localhost:{WEBSOCKET_PORT}")
        logger.info(f"Or use ws://YOUR_IP:{WEBSOCKET_PORT}")

        while self.running:
            try:
                if self.cap is None:
                    logger.error("Camera is not initialized")
                    break

                ret, frame = self.cap.read()

                if not ret:
                    logger.warning("Failed to read frame, attempting to reconnect...")
                    self.reconnect_camera()
                    continue

                frame_count += 1

                if frame_count % 30 == 0:
                    fps_end_time = time.time()
                    fps = 30 / (fps_end_time - fps_start_time)
                    fps_start_time = fps_end_time

                has_person, num_person, annotated_frame, _detections = self.detect_person(frame)

                self.send_mqtt_notification(
                    has_person,
                    num_person,
                    annotated_frame
                )

                if fps > 0:
                    cv2.putText(
                        annotated_frame,
                        f"FPS: {fps:.1f}",
                        (10, 110),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.6,
                        (255, 255, 255),
                        2
                    )

                cv2.putText(
                    annotated_frame,
                    f"WS Clients: {len(self.websocket_clients)}",
                    (10, 140),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (255, 255, 0),
                    2
                )

                if self.show_preview(annotated_frame):
                    break

                time.sleep(0.01)

            except Exception as e:
                logger.error(f"Error in process stream: {e}")
                time.sleep(1)

        if self.show_preview_window:
            cv2.destroyAllWindows()

    def reconnect_camera(self):
        """Reconnect to camera if connection lost."""
        if self.cap:
            self.cap.release()

        for attempt in range(CAMERA_MAX_RECONNECT_ATTEMPTS):
            logger.info(
                f"Reconnection attempt {attempt + 1}/"
                f"{CAMERA_MAX_RECONNECT_ATTEMPTS}"
            )

            if self.connect_camera():
                logger.info("Reconnected successfully")
                return True

            time.sleep(CAMERA_RECONNECT_DELAY)

        logger.error("Max reconnection attempts reached")
        return False

    def stop_service(self):
        """Stop the service gracefully."""
        logger.info("Stopping person detection service...")

        self.running = False

        if self.cap:
            self.cap.release()

        if self.mqtt_client:
            self.mqtt_client.loop_stop()
            self.mqtt_client.disconnect()

        if self.websocket_clients and self.loop:
            logger.info(f"Closing {len(self.websocket_clients)} WebSocket connections...")

            for client in list(self.websocket_clients):
                try:
                    asyncio.run_coroutine_threadsafe(
                        client.close(),
                        self.loop
                    )
                except Exception:
                    pass

        if self.show_preview_window:
            cv2.destroyAllWindows()
        logger.info("Service stopped")

    def run(self):
        """Main entry point."""
        if not self.load_model():
            logger.error("Cannot start service without model")
            return

        if not self.setup_mqtt():
            logger.error("Cannot start service without MQTT")
            return

        self.websocket_thread = threading.Thread(
            target=self.run_websocket_server,
            daemon=True
        )
        self.websocket_thread.start()

        time.sleep(2)

        try:
            self.process_stream()

        except KeyboardInterrupt:
            logger.info("Received interrupt signal")

        finally:
            self.stop_service()


def signal_handler(_sig, _frame):
    logger.info("Received shutdown signal")
    sys.exit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    service = PersonDetectionService()
    service.run()
