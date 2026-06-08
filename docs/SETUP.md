# SETUP — Instalasi dan Konfigurasi

Panduan lengkap menyiapkan SafeGuard APD dari nol, baik untuk laptop development maupun laptop demo.

## Daftar Isi

1. [Prasyarat](#prasyarat)
2. [Instalasi Otomatis (via TUI)](#instalasi-otomatis-via-tui)
3. [Instalasi Manual (langkah-demi-langkah)](#instalasi-manual-langkah-demi-langkah)
4. [Konfigurasi Environment](#konfigurasi-environment)
5. [Setup Cloudflare Tunnel](#setup-cloudflare-tunnel)
6. [Setup ESP32 + Hardware](#setup-esp32--hardware)
7. [Pindahan ke Laptop Demo (Config Bundle)](#pindahan-ke-laptop-demo-config-bundle)
8. [Verifikasi Sistem Siap](#verifikasi-sistem-siap)

---

## Prasyarat

| Software | Versi Minimum | Cara Cek |
|---|---|---|
| Python | 3.10+ | `python --version` |
| Node.js | 18 LTS | `node --version` |
| npm | 9+ | `npm --version` |
| Git | 2.30+ | `git --version` |
| (Opsional) NVIDIA GPU + CUDA | CUDA 12.x | `nvidia-smi` |
| (Opsional) cloudflared | Latest | `cloudflared --version` |

**Akun eksternal yang diperlukan:**
- HiveMQ Cloud (broker MQTT, gratis)
- Cloudflare (untuk tunnel, gratis)
- VPS untuk GoWA WhatsApp Gateway (atau pakai service yang sudah ada di `157.245.206.36`)

---

## Instalasi Otomatis (via TUI)

Cara termudah. TUI akan menjalankan semua langkah secara berurutan.

```bash
# 1. Clone repo
git clone https://github.com/sitaurs/pbl-ppe.git
cd pbl-ppe

# 2. Buat virtual environment Python
python -m venv .venv
.venv\Scripts\Activate.ps1     # Windows
# source .venv/bin/activate    # Linux/macOS

# 3. Install Python deps minimal untuk TUI
pip install rich python-dotenv pyzipper

# 4. Jalankan TUI
python tui.py
```

Setelah TUI terbuka, ikuti urutan ini:

### Pertama Kali Setup (Wizard)

Tekan **`W`** untuk masuk Setup Wizard (8 langkah otomatis):

1. Install Node.js dependencies (`npm install`)
2. Install Python dependencies (`pip install -r requirements.txt`)
3. Generate `.env` + `.env.local` dengan random AES key + Service Token
4. Konfigurasi MQTT broker (HiveMQ Cloud credentials)
5. Konfigurasi WhatsApp gateway GoWA
6. Cloudflare Tunnel (opsional — bisa skip kalau belum punya domain)
7. Prisma migrate + seed admin account
8. Generate ringkasan setup

Setelah selesai, password admin ditampilkan di terminal **sekali saja** — catat sebelum menutup.

### Setup Step Manual (kalau wizard gagal)

Tab **`3 SETUP`** lalu tekan tombol per langkah:

| Tombol | Aksi |
|---|---|
| `A` | `npm install` di `web-dashboard/` |
| `B` | Test build Next.js |
| `C` | Generate fresh `.env.local` (auto-generate token + key) |
| `D` | `npx prisma migrate deploy` |
| `E` | `npm run seed` (buat admin) |
| `F` | Sync `APD_SERVICE_TOKEN` antara `.env` ⇄ `.env.local` |
| `G` | `pip install -r requirements.txt` |
| `H` | Cloudflare Token Tunnel |
| `I` | Cloudflare Quick Tunnel (no domain) |

---

## Instalasi Manual (Langkah-demi-Langkah)

Untuk yang ingin kontrol setiap langkah.

### 1. Clone + Virtual Environment

```bash
git clone https://github.com/sitaurs/pbl-ppe.git
cd pbl-ppe
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Setup Environment Backend Python

```bash
copy .env.example .env
```

Edit `.env`. Variabel wajib (kalau kosong, backend akan exit dengan error):

```ini
MQTT_HOSTNAME=your-cluster.s1.eu.hivemq.cloud
MQTT_PORT=8883
MQTT_USERNAME=your_username
MQTT_PASSWORD=your_password
AES_KEY=<32 hex chars — generate via: python -c "import secrets; print(secrets.token_hex(16))">
APD_SERVICE_TOKEN=<32+ chars — generate sama-sama dengan .env.local nanti>
```

### 3. Setup Web Dashboard

```bash
cd web-dashboard
npm install
```

Generate `.env.local` otomatis (sekaligus generate `APD_SERVICE_TOKEN` dan `APD_ENCRYPTION_KEY`):

```bash
npm run setup:env
```

Salin nilai `APD_SERVICE_TOKEN` dari `web-dashboard/.env.local` ke `.env` di root supaya kedua sisi sinkron.

### 4. Database Migration + Seed

```bash
# Masih di web-dashboard/
npx prisma migrate deploy
npm run seed
```

`seed` membuat 5 role default + 1 akun admin. Password admin ditampilkan **sekali** — catat.

### 5. Verifikasi

```bash
# Terminal 1 — Dashboard
cd web-dashboard
npm run dev

# Terminal 2 — Backend Python
cd ..
python ServiceAPDBackend.py
```

Buka `http://localhost:3000/api/health` — harus return `{"status":"ok"}`.

---

## Konfigurasi Environment

### `.env` (Backend Python)

| Variabel | Wajib | Deskripsi |
|---|---|---|
| `MQTT_HOSTNAME` | ✅ | Host broker MQTT |
| `MQTT_PORT` | ✅ | 1883 lokal / 8883 TLS |
| `MQTT_USERNAME` | ✅ | Username MQTT |
| `MQTT_PASSWORD` | ✅ | Password MQTT |
| `AES_KEY` | ✅ | 32 hex chars (= 16 bytes) untuk AES-128-CBC |
| `APD_SERVICE_TOKEN` | ✅ | Token autentikasi Python ke Next.js (sama dengan .env.local) |
| `WA_API_URL` | ⚠️ | URL GoWA gateway (kosong = WhatsApp dimatikan) |
| `WA_API_USER` | ⚠️ | Username Basic Auth GoWA |
| `WA_API_PASS` | ⚠️ | Password Basic Auth GoWA |
| `WA_DEVICE_ID` | ⚠️ | Device ID WhatsApp terdaftar |
| `CONFIDENCE_THRESHOLD` | ❌ | Default 0.65 |
| `PERSON_CONFIDENCE_THRESHOLD` | ❌ | Default 0.60 |
| `WA_COOLDOWN_SECONDS` | ❌ | Default 120 (2 menit antar WA per sektor) |
| `WEBSOCKET_PORT` | ❌ | Default 8765 |
| `DASHBOARD_API_URL` | ❌ | Default `http://127.0.0.1:3000` |
| `PPE_MODEL_PATH` | ❌ | Default `models/ppe_best.pt` |
| `PERSON_MODEL_PATH` | ❌ | Default `models/yolov8n.pt` |
| `CF_TUNNEL_TOKEN` | ❌ | Token Cloudflare Tunnel (kalau pakai) |

### `web-dashboard/.env.local` (Next.js)

| Variabel | Wajib | Deskripsi |
|---|---|---|
| `DATABASE_URL` | ✅ | Path SQLite, default `file:./data/safeguard.db` |
| `APD_SERVICE_TOKEN` | ✅ | Bearer token (sama dengan `.env` root) |
| `APD_ENCRYPTION_KEY` | ✅ | 32 byte (64 hex) untuk encrypt TOTP secret di DB |
| `BEHIND_PROXY` | ❌ | Set `cloudflare` saat di belakang tunnel |
| `NEXTAUTH_URL` | ❌ | Production URL kalau pakai tunnel |
| `NEXT_PUBLIC_YOLO_WS_URL` | ❌ | WebSocket URL untuk live monitor (production) |
| `NODE_ENV` | ❌ | `development` atau `production` |

---

## Setup Cloudflare Tunnel

### Cara A: Token Tunnel (Recommended)

1. Login [Cloudflare Zero Trust](https://one.dash.cloudflare.com/) → Networks → Tunnels → Create Tunnel
2. Pilih nama (misal `safeguard-apd`), copy token (string panjang dimulai `eyJhI...`)
3. Install cloudflared: download MSI dari [github.com/cloudflare/cloudflared/releases](https://github.com/cloudflare/cloudflared/releases)
4. Konfigurasi public hostname di CF Dashboard:
   - `apd.yourdomain.com` → `http://localhost:3000`
   - `ws-apd.yourdomain.com` → `http://localhost:8765`
5. Di TUI: tab `3 SETUP` → tekan `H` → paste token → tunnel auto-start

### Cara B: Quick Tunnel (Tanpa Domain)

Cocok untuk demo cepat tanpa domain Cloudflare.

```bash
# Di TUI: tab 3 SETUP → tekan I
# Output: random https://xxx.trycloudflare.com URL (berubah tiap restart)
```

### Setelah Tunnel Aktif

Edit `web-dashboard/.env.local`:

```ini
BEHIND_PROXY=cloudflare
NEXTAUTH_URL=https://apd.yourdomain.com
NEXT_PUBLIC_YOLO_WS_URL=wss://ws-apd.yourdomain.com
NODE_ENV=production
```

Restart Next.js. Akses dashboard via `https://apd.yourdomain.com`.

---

## Setup ESP32 + Hardware

### 1. Wiring

```
ESP32 DevKit         Komponen
─────────────       ─────────────
GPIO 26  ─────────── BCLK   (MAX98357A)
GPIO 25  ─────────── LRC    (MAX98357A)
GPIO 22  ─────────── DIN    (MAX98357A)
5V       ─────────── VIN    (MAX98357A)
GND      ─────────── GND    (MAX98357A)

GPIO 34  ─────────── AOUT   (MQ-135)
5V       ─────────── VCC    (MQ-135)
GND      ─────────── GND    (MQ-135)

GPIO 13  ─[220Ω]──── LED(+) (LED merah)
GND      ─────────── LED(-) (LED merah)
```

### 2. Konfigurasi Firmware

Buka `alarm_apd/alarm_apd.ino` dengan Arduino IDE atau VS Code (PlatformIO). Edit konstanta di bagian atas:

```cpp
const char* WIFI_SSID   = "your_wifi_ssid";
const char* WIFI_PASS   = "your_wifi_password";
const char* MQTT_HOST   = "your-cluster.s1.eu.hivemq.cloud";
const char* MQTT_USER   = "your_mqtt_username";
const char* MQTT_PASS   = "your_mqtt_password";
const char* AES_KEY_HEX = "your_32_hex_chars";   // sama dengan AES_KEY di .env
const int   MY_NODE_ID  = 1;                     // sesuaikan per perangkat
```

### 3. Compile + Flash

**Arduino IDE:**
1. Tools → Board → ESP32 Dev Module
2. Tools → Partition Scheme → Default 4MB with spiffs
3. Sketch → Upload (Ctrl+U)
4. Tools → ESP32 Sketch Data Upload (untuk file audio SPIFFS)

**PlatformIO (CLI):**
```bash
cd alarm_apd
pio run -e esp32dev
pio run -e esp32dev -t upload
pio run -e esp32dev -t uploadfs
```

### 4. Verifikasi

```bash
pio device monitor -e esp32dev
# atau Arduino IDE → Tools → Serial Monitor (115200 baud)
```

Output yang diharapkan:
```
[wifi] connected. IP: 192.168.x.x
[ntp] syncing OK
[tls] root CA verified (Let's Encrypt R13)
[mqtt] connected.
[mqtt] subscribe 'apd/alarm/1' -> OK
```

---

## Pindahan ke Laptop Demo (Config Bundle)

Setelah laptop dev sudah terkonfigurasi penuh, pindah ke laptop demo (yang ada GPU NVIDIA) tanpa setup ulang manual.

### Di Laptop Dev

```bash
python tui.py
# tekan E → Export Config Bundle
# isi password ZIP, tunggu file .zip jadi
```

Bundle berisi: `.env`, `.env.local`, SQLite database, Cloudflare config + credentials. Di-encrypt AES via password.

### Pindahkan File Bundle

Salin file `safeguard-bundle-{host}-{timestamp}.zip` ke laptop demo (USB, email, cloud storage).

### Di Laptop Demo

```bash
git clone https://github.com/sitaurs/pbl-ppe.git
cd pbl-ppe

# Install minimum (TUI butuh ini)
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install rich python-dotenv pyzipper

# Buka TUI
python tui.py
# tekan I → Import Bundle → pilih file ZIP → masukkan password
```

TUI akan:
1. Backup file lama ke `*.before-import-{ts}.bak`
2. Restore env + database + cloudflare
3. Tampilkan status hijau di panel READINESS

Sisa langkah (yang harus regenerate per-machine):
- `npm install` di `web-dashboard/` → tab SETUP step `A`
- `pip install -r requirements.txt` → tab SETUP step `G`
- Install cloudflared MSI → tab SETUP step `H`

Detail teknis bundle: [`scripts/config_bundle.py`](../scripts/config_bundle.py).

---

## Verifikasi Sistem Siap

Buka TUI. Panel **READINESS** di tab Overview harus semua hijau:

```
┌─ READINESS CHECK ─────────────────────────────┐
│ [+] .env exists                               │
│ [+] .env.local exists                         │
│ [+] APD_SERVICE_TOKEN sync                    │
│ [+] AES_KEY (32 hex)                          │
│ [+] MQTT credentials                          │
│ [+] WhatsApp GoWA configured                  │
│ [+] cloudflared installed                     │
│ [+] models/ppe_best.pt                        │
│ [+] models/yolov8n.pt                         │
│ [+] SQLite database                           │
└───────────────────────────────────────────────┘
```

Panel **CONNECTIONS** menunjukkan status realtime:

```
┌─ CONNECTIONS ─────────────────────────────────┐
│ [+] CF Tunnel    : CONNECTED (apd.example.me) │
│ [+] MQTT Broker  : OK                         │
│ [+] WhatsApp GoWA: CONFIGURED                 │
└───────────────────────────────────────────────┘
```

Tekan `S` untuk Start All Services. Dalam 10-15 detik, dashboard siap di `http://localhost:3000`.

---

## Troubleshooting Setup

| Gejala | Solusi |
|---|---|
| `python tui.py` error import | Pastikan virtualenv aktif + `pip install rich python-dotenv pyzipper` |
| `npm install` lambat | Pakai mirror: `npm install --registry=https://registry.npmmirror.com` |
| MQTT TLS error -15202 | Cert HiveMQ rotated. Update `HIVEMQ_ROOT_CA` di firmware ke intermediate cert R13 atau R14 |
| Prisma migrate gagal | Hapus `web-dashboard/data/safeguard.db` lalu `npm run seed` ulang |
| Login 400 | Hapus `web-dashboard/.next/` lalu `npm run dev` |
| Service token mismatch | Tab SETUP → step `F` (sync token otomatis) |

Lebih lengkap di [`docs/USAGE.md`](USAGE.md#troubleshooting).
