# SafeGuard APD

**Sistem Monitoring Kepatuhan Alat Pelindung Diri Pekerja Berbasis YOLO**

Sistem ini memantau kepatuhan penggunaan helm dan rompi keselamatan di area industri secara real-time. Kamera IP menangkap video, YOLOv8 mendeteksi pelanggaran, alarm fisik berbunyi via ESP32, notifikasi WhatsApp dikirim ke penanggung jawab, dan seluruh data tercatat di dashboard web yang aman.

> **Proyek Berbasis Lapangan (PBL) — Politeknik Negeri Malang**
> Menggabungkan tiga mata kuliah: Pengolahan Citra Digital, Keamanan Jaringan Cyber, dan IoT/WSN.

---

## Tampilan Singkat

| Komponen | Status |
|---|---|
| Backend Python (YOLOv8 + MQTT) | Production |
| Web Dashboard (Next.js + Prisma + SQLite) | Production |
| Firmware ESP32 (alarm + sensor gas) | Production |
| Cloudflare Tunnel (akses internet) | Production |
| Property Tests | 227+ pass |

```
[Kamera IP]  →  [YOLOv8]  →  [Pelanggaran terdeteksi]  →  [Alarm ESP32 + WA + Dashboard]
[Sensor Gas] →  [MQ-135]  →  [Threshold breach]        →  [LED merah + Alarm + WA]
```

Block diagram lengkap (4 layer arsitektur, sequence flow APD/gas) tersedia di [`docs/BLOCK-DIAGRAM.md`](docs/BLOCK-DIAGRAM.md).

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/sitaurs/pbl-ppe.git
cd pbl-ppe

# 2. Buka TUI manager
python tui.py
```

TUI akan otomatis cek prasyarat (Python, Node.js, env vars). Jika ada yang kurang, ikuti panduan di Setup Wizard (tekan `W`).

Setup pertama kali butuh ~10 menit. Detail lengkap di [`docs/SETUP.md`](docs/SETUP.md).

---

## Dokumentasi

### Untuk Operasional
- [`docs/SETUP.md`](docs/SETUP.md) — Cara install + konfigurasi dari nol (dev maupun demo machine)
- [`docs/USAGE.md`](docs/USAGE.md) — Cara menjalankan sistem sehari-hari, demo, troubleshoot
- [`docs/BLOCK-DIAGRAM.md`](docs/BLOCK-DIAGRAM.md) — Diagram arsitektur (mermaid)

### Untuk Presentasi PBL (per matkul)
- [`docs/PBL-PENGOLAHAN-CITRA.md`](docs/PBL-PENGOLAHAN-CITRA.md) — Bagian deteksi YOLOv8
- [`docs/PBL-KEAMANAN-JARINGAN.md`](docs/PBL-KEAMANAN-JARINGAN.md) — Bagian Argon2id, AES, TLS, RBAC, Cloudflare
- [`docs/PBL-IOT-WSN.md`](docs/PBL-IOT-WSN.md) — Bagian ESP32, MQ-135, MQTT, alarm

### Referensi Teknis
- [`ARSITEKTUR.md`](ARSITEKTUR.md) — Arsitektur teks lengkap + pemetaan ke file/baris
- [`docs/security-talking-points.md`](docs/security-talking-points.md) — Skrip untuk demo keamanan
- [`docs/demo-script.md`](docs/demo-script.md) — Skrip demo lengkap 8 langkah
- [`docs/smoke-test.md`](docs/smoke-test.md) — Skenario E2E test
- [`docs/PRESENTATION_READINESS.md`](docs/PRESENTATION_READINESS.md) — Checklist hari-H

---

## Stack Teknologi

| Layer | Teknologi |
|---|---|
| **Frontend** | Next.js 16, React 19, TailwindCSS |
| **Backend Web** | Next.js API Routes + Prisma ORM + SQLite |
| **Backend AI** | Python 3.10+, Ultralytics YOLOv8, OpenCV |
| **Auth** | Argon2id, TOTP (RFC 6238), Recovery Codes, RBAC sector-scoped |
| **Komunikasi** | MQTT TLS (HiveMQ Cloud), AES-128-CBC + random IV |
| **IoT** | ESP32 + MAX98357A I2S + MQ-135, mbedtls untuk AES |
| **Edge** | Cloudflare Tunnel (HTTPS, no port forward) |
| **Testing** | Vitest + fast-check (property-based testing) |

---

## Struktur Repo

```
pbl-ppe/
├── alarm_apd/           Firmware ESP32 (production)
├── docs/                Semua dokumentasi
├── infra/               Konfigurasi infrastructure (Mosquitto)
├── legacy/              Iterasi pengembangan sebelumnya
├── models/              YOLO weights (yolov8n + ppe_best)
├── other/               Parking lot non-essential
├── scripts/             Demo + utility scripts
├── tests/               Python unit + property tests
├── training/            ML pipeline (download, prepare, train)
├── web-dashboard/       Next.js dashboard
│
├── ServiceAPDBackend.py Backend deteksi (entry point Python)
├── trigger_alarm.py     CLI MQTT trigger untuk demo
├── tui.py               TUI manager (control center)
├── config.py            Konfigurasi global Python
└── requirements.txt     Python dependencies
```

Detail per folder lihat README di masing-masing folder.

---

## Komponen Hardware

| Komponen | Spesifikasi | Fungsi |
|---|---|---|
| ESP32 DevKit | 240 MHz dual-core, WiFi+BT | Mikrokontroler utama |
| MAX98357A | I2S audio amplifier | Output suara alarm |
| Speaker 3W 4Ω | Mono | Pengeras suara |
| MQ-135 | Sensor gas (CO2, NH3, asap) | Deteksi gas berbahaya |
| LED merah + R 220Ω | Indikator visual | Status alarm/gas alert |

Wiring detail + estimasi harga (~Rp 163.000) di [`docs/PBL-IOT-WSN.md`](docs/PBL-IOT-WSN.md).

---

## Lisensi

Proyek akademik untuk Proyek Berbasis Lapangan, Politeknik Negeri Malang. Tidak untuk komersial tanpa izin.
