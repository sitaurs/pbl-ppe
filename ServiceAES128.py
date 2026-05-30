# person_detection_service.py
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "0")
os.makedirs(os.path.join(BASE_DIR, ".ultralytics"), exist_ok=True)
os.environ.setdefault("YOLO_CONFIG_DIR", os.path.join(BASE_DIR, ".ultralytics"))

import cv2
import paho.mqtt.client as mqtt
import json
import time
import logging
import torch
from ultralytics import YOLO
from datetime import datetime
import signal
import sys
import ssl
import base64
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad

# Konfigurasi Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('person_detection.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Konfigurasi MQTT - HiveMQ Cloud (DIPERBAIKI)
MQTT_CONFIG = {
    'hostname': 'f559f825bedc477fa8b74e7375f66fd2.s1.eu.hivemq.cloud',
    'port': 8883,  # Port TLS untuk koneksi aman
    'username': 'aldis',
    'password': 'Polinema2026',
    'topic_person': 'Person',
    'topic_frame': 'VideoFrame'
}

# Konfigurasi AES128
AES_CONFIG = {
    'key': b'16bytekey1234567',  # 16 bytes untuk AES128
    'iv': b'16byteiv12345678',  # 16 bytes IV
    'mode': AES.MODE_CBC
}

# Konfigurasi Camera
CAMERA_CONFIG = {
    'rtsp_url': 'rtsp://10.6.170.119:1945/',
    'reconnect_delay': 5,
    'max_reconnect_attempts': 10
}

# Konfigurasi Deteksi
DETECTION_CONFIG = {
    'confidence_threshold': 0.5,
    'cooldown_seconds': 2,
    'send_frame_interval': 0.1  # Kirim frame setiap 0.1 detik (10 fps) - DIPERBAIKI
}

USE_GPU = True
GPU_DEVICE_INDEX = 0
SHOW_PREVIEW_WINDOW = True


class PersonDetectionService:
    def __init__(self):
        self.model = None
        self.mqtt_client = None
        self.cap = None
        self.device = f"cuda:{GPU_DEVICE_INDEX}"
        self.running = True
        self.last_notification_time = 0
        self.last_frame_send_time = 0
        self.person_detected = False
        self.show_preview_window = SHOW_PREVIEW_WINDOW

    def encrypt_aes128(self, plaintext):
        """Encrypt data using AES128 CBC mode and return Base64 encoded string"""
        try:
            # Create AES cipher in CBC mode
            cipher = AES.new(AES_CONFIG['key'], AES_CONFIG['mode'], AES_CONFIG['iv'])

            # Convert plaintext to bytes if it's a string
            if isinstance(plaintext, str):
                plaintext_bytes = plaintext.encode('utf-8')
            else:
                plaintext_bytes = plaintext

            # Pad the data to be multiple of 16 bytes (AES block size)
            padded_data = pad(plaintext_bytes, AES.block_size)

            # Encrypt the data
            encrypted_bytes = cipher.encrypt(padded_data)

            # Encode to Base64 for safe transmission
            encrypted_base64 = base64.b64encode(encrypted_bytes).decode('utf-8')

            return encrypted_base64

        except Exception as e:
            logger.error(f"Encryption error: {e}")
            return None

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
            logger.info(f"Loading YOLO model on device: {self.device}...")
            self.model = YOLO(os.path.join(BASE_DIR, 'yolov8n.pt'))
            self.model.to(self.device)
            logger.info(f"YOLO model loaded successfully on {self.device.upper()}")
            return True

        except Exception as e:
            logger.error(f"Failed to load YOLO model: {e}")
            return False

    def setup_mqtt(self):
        """Setup MQTT connection to HiveMQ Cloud"""
        try:
            self.mqtt_client = mqtt.Client(
                client_id=f"person_detection_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                clean_session=True
            )

            # Set username dan password
            self.mqtt_client.username_pw_set(
                MQTT_CONFIG['username'],
                MQTT_CONFIG['password']
            )

            # Konfigurasi TLS untuk koneksi aman (port 8883)
            self.mqtt_client.tls_set(cert_reqs=ssl.CERT_REQUIRED)

            # Callback functions
            self.mqtt_client.on_connect = self.on_connect
            self.mqtt_client.on_disconnect = self.on_disconnect
            self.mqtt_client.on_publish = self.on_publish

            # Connect ke broker HiveMQ
            logger.info(f"Connecting to HiveMQ at {MQTT_CONFIG['hostname']}:{MQTT_CONFIG['port']}")
            self.mqtt_client.connect(
                MQTT_CONFIG['hostname'],
                MQTT_CONFIG['port'],
                60
            )
            self.mqtt_client.loop_start()

            return True

        except Exception as e:
            logger.error(f"Failed to setup MQTT: {e}")
            return False

    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            logger.info("✅ Connected to HiveMQ broker successfully")
        else:
            logger.error(f"Failed to connect to HiveMQ broker with code: {rc}")

    def on_disconnect(self, client, userdata, rc):
        logger.warning(f"Disconnected from HiveMQ broker with code: {rc}")
        if self.running:
            logger.info("Attempting to reconnect...")

    def on_publish(self, client, userdata, mid):
        logger.debug(f"Message published with ID: {mid}")

    def connect_camera(self):
        """Connect to RTSP camera"""
        try:
            logger.info(f"Connecting to camera: {CAMERA_CONFIG['rtsp_url']}")
            self.cap = cv2.VideoCapture(CAMERA_CONFIG['rtsp_url'])

            # Set buffer size untuk mengurangi delay
            self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

            if not self.cap.isOpened():
                logger.error("Cannot open camera")
                return False

            logger.info("Camera connected successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to connect camera: {e}")
            return False

    def send_mqtt_notification(self, has_person, num_person, frame=None):
        """Send MQTT notification when person detected"""
        current_time = time.time()

        # Kirim notifikasi Person dengan cooldown
        if has_person and (current_time - self.last_notification_time) > DETECTION_CONFIG['cooldown_seconds']:
            # Buat message dengan struktur asli
            message = {
                'event': 'person_detected',
                'message': 'Kamera mendeteksi manusia',
                'timestamp': datetime.now().isoformat(),
                'num_person': num_person,
                'camera_url': CAMERA_CONFIG['rtsp_url']
            }

            try:
                # Konversi message ke JSON string
                json_message = json.dumps(message)

                # ENKRIPSI seluruh JSON message
                encrypted_message = self.encrypt_aes128(json_message)

                if encrypted_message:
                    # Kirim encrypted message
                    result = self.mqtt_client.publish(
                        MQTT_CONFIG['topic_person'],
                        encrypted_message,
                        qos=1
                    )

                    if result.rc == mqtt.MQTT_ERR_SUCCESS:
                        logger.info(
                            f"🔴 Published encrypted to {MQTT_CONFIG['topic_person']}: "
                            f"{message['message']} (Person count: {num_person})"
                        )
                        self.last_notification_time = current_time
                        self.person_detected = True
                    else:
                        logger.error(f"Failed to publish message: {result.rc}")
                else:
                    logger.error("Encryption failed, message not sent")

            except Exception as e:
                logger.error(f"Error publishing MQTT message: {e}")

        # Kirim frame secara periodik
        if frame is not None and (current_time - self.last_frame_send_time) > DETECTION_CONFIG['send_frame_interval']:
            self.send_frame_via_mqtt(frame, has_person, num_person)
            self.last_frame_send_time = current_time

    def send_frame_via_mqtt(self, frame, has_person, num_person):
        """Send frame as base64 via MQTT with encryption"""
        try:
            # Resize frame untuk mengurangi ukuran
            height, width = frame.shape[:2]
            new_width = 640
            new_height = int(height * (new_width / width))
            frame_resized = cv2.resize(frame, (new_width, new_height))

            # Encode ke JPEG dengan kualitas 70%
            _, buffer = cv2.imencode(
                '.jpg',
                frame_resized,
                [cv2.IMWRITE_JPEG_QUALITY, 70]
            )
            frame_base64 = base64.b64encode(buffer).decode('utf-8')

            # Buat message dengan struktur asli
            message = {
                'event': 'video_frame',
                'frame': frame_base64,
                'has_person': has_person,
                'num_person': num_person,
                'timestamp': datetime.now().isoformat()
            }

            # Konversi message ke JSON string
            json_message = json.dumps(message)

            # ENKRIPSI seluruh JSON message
            encrypted_message = self.encrypt_aes128(json_message)

            if encrypted_message:
                # Kirim encrypted message
                self.mqtt_client.publish(
                    MQTT_CONFIG['topic_frame'],
                    encrypted_message,
                    qos=0
                )
                logger.debug(f"📹 Encrypted frame sent (Person: {has_person}, Count: {num_person})")
            else:
                logger.error("Encryption failed, frame not sent")

        except Exception as e:
            logger.error(f"Failed to send frame: {e}")

    def detect_person(self, frame):
        """Detect person in frame using YOLO"""
        try:
            results = self.model(
                frame,
                conf=DETECTION_CONFIG['confidence_threshold'],
                device=self.device
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
                                'bbox': [x1, y1, x2, y2],
                                'confidence': confidence
                            })

                            # Draw bounding box HIJAU
                            cv2.rectangle(
                                annotated_frame,
                                (x1, y1),
                                (x2, y2),
                                (0, 255, 0),
                                3
                            )

                            label = f"Person: {confidence:.2f}"

                            # Background label
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

            # Info text
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

    def show_preview(self, frame):
        """Tampilkan preview OpenCV jika HighGUI tersedia."""
        if not self.show_preview_window:
            return False

        try:
            cv2.imshow('Person Detection - RTSP Stream', frame)
            return cv2.waitKey(1) & 0xFF == ord('q')
        except cv2.error as e:
            self.show_preview_window = False
            logger.warning(
                "OpenCV HighGUI tidak tersedia, preview window dinonaktifkan. "
                "Deteksi tetap berjalan via MQTT."
            )
            logger.debug(f"OpenCV preview error: {e}")
            return False

    def process_stream(self):
        """Main loop to process camera stream"""
        if not self.connect_camera():
            logger.error("Cannot start stream processing")
            return

        frame_count = 0
        fps_start_time = time.time()
        fps = 0

        logger.info("Starting person detection stream processing...")
        logger.info("AES128 Encryption enabled - CBC mode with Base64 output")
        logger.info("Message structure preserved, content encrypted")

        while self.running:
            try:
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

                has_person, num_person, annotated_frame, detections = self.detect_person(frame)

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

                if self.show_preview(annotated_frame):
                    break

                time.sleep(0.01)

            except Exception as e:
                logger.error(f"Error in process stream: {e}")
                time.sleep(1)

        if self.show_preview_window:
            cv2.destroyAllWindows()

    def reconnect_camera(self):
        """Reconnect to camera if connection lost"""
        if self.cap:
            self.cap.release()

        for attempt in range(CAMERA_CONFIG['max_reconnect_attempts']):
            logger.info(
                f"Reconnection attempt {attempt + 1}/"
                f"{CAMERA_CONFIG['max_reconnect_attempts']}"
            )

            if self.connect_camera():
                logger.info("Reconnected successfully")
                return True

            time.sleep(CAMERA_CONFIG['reconnect_delay'])

        logger.error("Max reconnection attempts reached")
        return False

    def stop_service(self):
        """Stop the service gracefully"""
        logger.info("Stopping person detection service...")
        self.running = False

        if self.cap:
            self.cap.release()

        if self.mqtt_client:
            self.mqtt_client.loop_stop()
            self.mqtt_client.disconnect()

        if self.show_preview_window:
            cv2.destroyAllWindows()
        logger.info("Service stopped")

    def run(self):
        """Main entry point"""
        if not self.load_model():
            logger.error("Cannot start service without model")
            return

        if not self.setup_mqtt():
            logger.error("Cannot start service without MQTT")
            return

        try:
            self.process_stream()

        except KeyboardInterrupt:
            logger.info("Received interrupt signal")

        finally:
            self.stop_service()


def signal_handler(sig, frame):
    logger.info("Received shutdown signal")
    sys.exit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    service = PersonDetectionService()
    service.run()
