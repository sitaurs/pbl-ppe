# 🛡️ Sistem Deteksi Pelanggaran APD — PBL K3

Sistem monitoring Alat Pelindung Diri (APD) berbasis Computer Vision untuk area kerja industri. Menggunakan YOLOv8 untuk mendeteksi helm dan rompi keselamatan secara real-time, dengan notifikasi otomatis via WhatsApp kepada Penanggung Jawab (PIC) setiap sektor.

---

## 📋 Fitur Utama

- **Deteksi Real-time** — Inferensi YOLOv8 di GPU untuk deteksi helm & rompi pada multiple CCTV/IP Camera
- **Multi-Node** — Mendukung banyak kamera sekaligus, masing-masing dengan PIC berbeda
- **Alert WhatsApp** — Notifikasi otomatis + foto pelanggaran ke PIC via GoWA API
- **Enkripsi MQTT** — Data terenkripsi AES128-CBC untuk transmisi aman melalui HiveMQ Cloud
- **Web Dashboard** — Monitoring live streaming, manajemen node/PIC, dan log pelanggaran
- **WebSocket Streaming** — Frame beranotasi dikirim real-time ke browser

---

## 🏗️ Arsitektur Sistem

```
┌─────────────────┐     ┌───────────────────┐     ┌──────────────────┐
│   IP Camera /   │────▶│  ServiceAPDBackend │────▶│   HiveMQ Cloud   │
│     Webcam      │     │  (YOLOv8 + GPU)   │     │   (MQTT + TLS)   │
└─────────────────┘     └─────────┬─────────┘     └──────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
          ┌─────────────┐ ┌────────────┐ ┌───────────────┐
          │  WebSocket  │ │  GoWA API  │ │ Dashboard API │
          │  (port 8765)│ │ (WhatsApp) │ │  (port 3000)  │
          └──────┬──────┘ └──────┬─────┘ └───────┬───────┘
                 ▼               ▼               ▼
          ┌────────────┐  ┌──────────┐   ┌────────────┐
          │   Browser  │  │   PIC    │   │  db.json / │
          │ (Live Feed)│  │ (via WA) │   │violations  │
          └────────────┘  └──────────┘   └────────────┘
```

---

## 📁 Struktur Proyek

```
.
├── config.py                    # Konfigurasi terpusat (baca dari .env)
├── ServiceAPDBackend.py         # Service utama: deteksi APD multi-kamera
├── ServiceAES128FullBackend.py  # Service person detection + WebSocket
├── ServiceAES128.py             # Service person detection (RTSP)
│
├── 1_download_dataset.py        # Download & remap dataset dari Roboflow
├── 2_train_ppe.py               # Training YOLOv8 kustom (GPU-only)
├── 3_prepare_chv_dataset.py     # Konversi CHV_dataset ke format YOLOv8
├── check_cuda.py                # Verifikasi CUDA/GPU
│
├── web-dashboard/               # Frontend Next.js
│   ├── src/app/                 # Halaman & API routes
│   ├── data/db.json             # Database node/PIC
│   └── data/violations.json     # Log pelanggaran
│
├── CHV-YOLOv8/                  # Dataset (2 kelas: helmet, vest)
├── VEST-1/                      # Dataset (4 kelas)
├── runs/detect/ppe_training/    # Output training model
│
├── .env.example                 # Template environment variables
├── .env                         # Konfigurasi aktif (JANGAN commit)
├── .gitignore
├── requirements-global.txt      # Dependensi Python (server GPU)
└── requirements-local.txt       # Dependensi Python (lokal + CUDA)
```

---

## ⚡ Quick Start

### Prasyarat

- Python 3.10+
- NVIDIA GPU + CUDA 12.x
- Node.js 18+
- PyTorch dengan CUDA support

### 1. Setup Environment

```bash
# Clone / masuk ke direktori proyek
cd "pycham pbl"

# Buat virtual environment
python -m venv .venv
.venv\Scripts\activate

# Install dependensi
pip install -r requirements-local.txt

# Salin dan isi konfigurasi
copy .env.example .env
# Edit .env sesuai kredensial
```

### 2. Jalankan Web Dashboard

```bash
cd web-dashboard
npm install
npm run dev
```

Dashboard berjalan di `http://localhost:3000`

### 3. Tambah Node/Kamera

Buka dashboard → **Tambah Node** → isi data sektor, PIC, dan URL kamera.

### 4. Jalankan Backend Deteksi

```bash
# Kembali ke root proyek
cd ..
python ServiceAPDBackend.py
```

---

## 🎯 Training Model (Opsional)

Jika ingin melatih ulang model kustom:

```bash
# 1. Download dataset
python 1_download_dataset.py

# 2. (Opsional) Persiapkan dataset CHV
python 3_prepare_chv_dataset.py

# 3. Training — membutuhkan GPU NVIDIA
python 2_train_ppe.py
```

Model terbaik tersimpan di: `runs/detect/ppe_training/helmet_vest_v1/weights/best.pt`

---

## 🔧 Konfigurasi

Semua konfigurasi dibaca dari file `.env`. Lihat `.env.example` untuk daftar lengkap variabel.

| Variabel | Deskripsi |
|----------|-----------|
| `MQTT_HOSTNAME` | Alamat broker HiveMQ Cloud |
| `MQTT_USERNAME` / `MQTT_PASSWORD` | Kredensial MQTT |
| `WA_API_URL` | URL server GoWA WhatsApp |
| `WA_DEVICE_ID` | ID device WhatsApp yang terdaftar |
| `CONFIDENCE_THRESHOLD` | Threshold deteksi APD (default: 0.65) |
| `WA_COOLDOWN_SECONDS` | Jeda antar notifikasi WA per sektor (default: 120) |
| `WEBSOCKET_PORT` | Port WebSocket untuk streaming (default: 8765) |

---

## 📊 Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Deteksi Objek | YOLOv8 (Ultralytics) |
| Deep Learning | PyTorch + CUDA 12.6 |
| Computer Vision | OpenCV |
| Messaging | MQTT (HiveMQ) + AES128 Encryption |
| Notifikasi | WhatsApp via GoWA REST API |
| Backend Streaming | WebSocket (Python websockets) |
| Frontend | Next.js 16 + React 19 + Tailwind CSS 4 |
| Database | JSON file-based (db.json) |

---

## 📱 Integrasi WhatsApp

Sistem menggunakan [go-whatsapp-web-multidevice](https://github.com/aldinokemal/go-whatsapp-web-multidevice) yang di-host di VPS. Dokumentasi lengkap API ada di file `docs/whatsapp-api.md`.

### Alur Notifikasi
1. Pelanggaran terdeteksi oleh YOLO
2. Frame bukti disimpan sebagai JPEG
3. Pesan + gambar dikirim ke PIC via GoWA API
4. Log dicatat ke dashboard

---

## 🧪 Verifikasi GPU

```bash
python check_cuda.py
```

Output yang diharapkan:
```
PyTorch: 2.9.0+cu126
CUDA available: True
GPU: NVIDIA GeForce ...
GPU computation test: PASSED
```

---

## 📄 Lisensi

Proyek ini dibuat untuk keperluan akademik — Proyek Berbasis Lapangan (PBL) bidang Keselamatan dan Kesehatan Kerja (K3), Politeknik Negeri Malang.
