# USAGE — Cara Pengoperasian

Panduan menjalankan, mengoperasikan, dan demo SafeGuard APD sehari-hari.

## Daftar Isi

1. [Menjalankan Sistem (Operasional Harian)](#menjalankan-sistem-operasional-harian)
2. [TUI Manager — Tombol Penting](#tui-manager--tombol-penting)
3. [Login + Hak Akses](#login--hak-akses)
4. [Manajemen Node + Sektor + User](#manajemen-node--sektor--user)
5. [Live Monitoring](#live-monitoring)
6. [Trigger Alarm Manual (Demo)](#trigger-alarm-manual-demo)
7. [Demo Keamanan Otomatis](#demo-keamanan-otomatis)
8. [Cek Audit Log](#cek-audit-log)
9. [Backup + Reset](#backup--reset)
10. [Troubleshooting](#troubleshooting)

---

## Menjalankan Sistem (Operasional Harian)

### Cara 1: Lewat TUI (Recommended)

```bash
python tui.py
```

Tekan **`S`** untuk Start All Services. TUI akan menjalankan:
- Next.js dashboard (port 3000)
- Backend Python (deteksi YOLO + WebSocket port 8765)
- Cloudflare Tunnel (kalau token sudah di-set di `.env`)

Tunggu ~15 detik. Dashboard siap di `http://localhost:3000`.

### Cara 2: Manual (kalau mau granular)

```bash
# Terminal 1 — Dashboard
cd web-dashboard
npm run dev

# Terminal 2 — Backend Python
python ServiceAPDBackend.py

# Terminal 3 — Cloudflare Tunnel (opsional)
cloudflared tunnel run --token YOUR_TOKEN
```

### Stop Services

TUI: tekan **`X`**. Semua services + tunnel berhenti.

Manual: Ctrl+C di setiap terminal.

### Restart

TUI: tekan **`R`**. Stop → tunggu 0.5 detik → start.

---

## TUI Manager — Tombol Penting

TUI (file [`tui.py`](../tui.py)) adalah control center untuk semua operasi.

### Navigasi Tab

| Tombol | Tab | Fungsi |
|---|---|---|
| `1` | OVERVIEW | Status realtime, readiness check, connections |
| `2` | SERVICES | Status service Next.js + Python + Cloudflare |
| `3` | SETUP | Setup steps individual (A-I) |
| `4` | LOGS | Live tail log dari Python backend + Next.js |
| `5` | CONFIG | View kontent .env dan .env.local |
| `6` | HELP | Daftar shortcut keys |

### Operasi Service

| Tombol | Fungsi |
|---|---|
| `S` | Start all services (Next.js + Python + Cloudflare) |
| `X` | Stop all services |
| `R` | Restart all services |
| `B` | Open browser ke `localhost:3000` |
| `H` | HTTP health check ke `/api/health` |

### Konfigurasi

| Tombol | Fungsi |
|---|---|
| `W` | Setup Wizard (8 step otomatis dari nol) |
| `C` | Quick Config Editor (edit MQTT/AES/WA inline) |
| `E` | Export Config Bundle (ZIP terenkripsi) |
| `I` | Import Config Bundle (restore dengan backup auto) |

### Setup Steps (di tab `3 SETUP`)

| Tombol | Aksi |
|---|---|
| `A` | `npm install` di `web-dashboard/` |
| `B` | `npm run build` (test build production) |
| `C` | Generate `.env.local` baru (auto-create token + key) |
| `D` | `npx prisma migrate deploy` |
| `E` | `npm run seed` (buat admin) |
| `F` | Sync `APD_SERVICE_TOKEN` antara `.env` ⇄ `.env.local` |
| `G` | `pip install -r requirements.txt` |
| `H` | Cloudflare Token Tunnel (paste token) |
| `I` | Cloudflare Quick Tunnel (no domain) |

---

## Login + Hak Akses

### Login Pertama Kali

Username: `admin`
Password: dicetak terminal saat `npm run seed` (catat sekali).

Setelah login pertama, sistem **memaksa ganti password** sebelum bisa akses dashboard.

### 5 Role Default

| Role | Akses |
|---|---|
| **Super_Admin** | Semua, termasuk manajemen user/role/setting |
| **Admin_K3** | Semua kecuali manajemen user/role/setting |
| **Supervisor** | Live monitor + acknowledge pelanggaran (sektor yang ditugaskan) |
| **PIC_Sektor** | Hanya baca data sektor yang ditugaskan |
| **Auditor** | Hanya baca semua data + ekspor laporan + audit log |

Supervisor dan PIC_Sektor **otomatis ter-filter** berdasarkan sektor (sector-scoped). Mereka tidak bisa lihat data sektor lain.

### Aktifkan 2FA (Wajib untuk Admin)

1. Login → klik avatar atas → Account Security
2. Tekan "Aktifkan 2FA" → scan QR code via Google Authenticator / Authy
3. Masukkan 6 digit kode dari authenticator → konfirmasi
4. Catat 8 recovery code (one-time backup, kalau HP hilang)

---

## Manajemen Node + Sektor + User

### Buat Sektor Dulu

`/sectors` → Tambah Sektor → isi nama (misal "Area Produksi A") + kode (`A1`).

### Tambah Node (Wizard 4 Step)

`/nodes` → Tambah Node → ikuti wizard:

1. **Pilih Sektor + PIC** — node akan termasuk sektor mana, PIC siapa yang dapat WA
2. **Konfigurasi Kamera** — RTSP URL, resolusi, confidence threshold (default 0.65)
3. **Konfigurasi ESP32** — MQTT topic (auto-generate `apd/alarm/<id>`), opsi sensor MQ-135
4. **Review** — periksa ringkasan, klik Buat Node

Node aktif berarti backend Python akan langsung mulai monitor stream RTSP-nya.

### Tambah User

`/users` → Tambah User → isi data + assign role + sektor (kalau Supervisor/PIC).

User baru dapat password sementara (acak), wajib ganti saat login pertama.

---

## Live Monitoring

### Lokal

`http://localhost:3000/monitor` → tile per kamera, frame realtime via WebSocket.

Tile berubah merah saat ada pelanggaran APD terdeteksi.

### Internet (via Cloudflare Tunnel)

`https://apd.yourdomain.com/monitor` (kalau tunnel aktif).

WebSocket otomatis connect ke `wss://ws-apd.yourdomain.com` (set di `NEXT_PUBLIC_YOLO_WS_URL`).

### Dashboard Home

`http://localhost:3000/` menampilkan:

- 4 stat card: Node Aktif, Pelanggaran Hari Ini, Compliance Rate, **Gas Alert** (sensor MQ-135)
- **Status Sensor Gas** (per node — raw value, threshold, status OK/ALERT)
- Live Sektor Preview (5 thumbnail node teratas)
- Ringkasan Sektor (tabel pelanggaran per sektor)
- Aktivitas Terbaru (8 pelanggaran terakhir)

---

## Trigger Alarm Manual (Demo)

Untuk demo tanpa harus tunggu deteksi YOLO real.

### Trigger APD Violation

```bash
# Pelanggaran APD (helm + rompi tidak dipakai)
python trigger_alarm.py

# Test alarm (1 putaran saja, lebih pendek)
python trigger_alarm.py --test
```

ESP32 akan:
- Decrypt pesan AES-128
- Validate timestamp (replay protection)
- Putar audio "gunakan APD lengkap" via speaker (4x loop default)

### Trigger Gas Alarm

```bash
python trigger_alarm.py --gas
```

ESP32 simulasi sensor MQ-135 melebihi threshold:
- LED merah nyala
- Putar audio peringatan gas (1 putaran)

### Trigger Berurutan (APD lalu Gas)

```bash
python trigger_alarm.py --all
```

Stage 1: APD test → tunggu 12 detik → Stage 2: Gas. Ideal untuk demo dosen.

### Stop Alarm

```bash
python trigger_alarm.py --stop
```

Langsung hentikan alarm yang sedang aktif.

---

## Demo Keamanan Otomatis

Buat presentasi keamanan jaringan ke dosen, gunakan script ini:

```powershell
powershell -File scripts/demo_security.ps1
```

Script akan menjalankan 4 section dengan pause Enter antar section:

1. **Klaim 1: Argon2id + 2FA + RBAC** — parse hash dari DB, tampilkan parameter, run property tests
2. **Klaim 2: AES-128 + MQTT TLS** — run pytest, encrypt 3x (random IV demo), live trigger alarm
3. **Klaim 3: Service Token** — 4 skenario curl (anonymous/wrong/scope-denied/allowed)
4. **Klaim 4: Cloudflare Tunnel** — cek service running, akses public endpoint

Mode lain:

```powershell
# Tanpa pause (dry-run cepat)
powershell -File scripts/demo_security.ps1 -Auto

# Skip live MQTT (ESP32 tidak terkoneksi)
powershell -File scripts/demo_security.ps1 -SkipMqtt
```

Talking points (apa yang harus diucapkan saat tiap section jalan): [`docs/security-talking-points.md`](security-talking-points.md).

---

## Cek Audit Log

`/audit-log` (perlu permission `audit-log:read` — Auditor / Super_Admin).

Setiap aksi penting ter-log:
- Login berhasil + gagal
- Ganti password / reset password
- 2FA enable / disable
- Buat / ubah / hapus user / role / node / sektor
- Akses sensitif (download CSV, export laporan)

Audit log **append-only** by design — property test `audit-append-only` scan semua API route. Tidak ada UPDATE/DELETE pada tabel `AuditLog` di seluruh kode.

Kolom yang tercatat:
- `userId` (siapa)
- `action` (apa, format `resource:action`)
- `ipAddress` (IP user asli — bukan IP Cloudflare)
- `userAgent` (browser/device)
- `metadata` (JSON detail)
- `timestamp` (UTC)

Export ke CSV: tombol Export di kanan atas.

---

## Backup + Reset

### Backup Manual Database

```bash
copy web-dashboard\data\safeguard.db web-dashboard\data\backup\safeguard-{date}.db
```

Atau pakai TUI: tekan `E` (Export Bundle) — backup database + env + cloudflare config dalam 1 ZIP terenkripsi.

### Reset Password Admin (lupa password)

```bash
cd web-dashboard
npm run reset:admin-password
```

Atau target user spesifik:

```bash
npm run reset:admin-password -- --username admin
```

Output: password baru acak, pencet sekali ke terminal. User dipaksa ganti saat login.

### Reset Database (factory reset)

```bash
cd web-dashboard
del data\safeguard.db
npx prisma migrate deploy
npm run seed
```

⚠️ Semua user, role, audit log akan hilang. Backup dulu kalau perlu.

### Restore dari Backup

```bash
cd web-dashboard
npm run restore-from-backup -- --backup-dir data/backup/{timestamp}
```

---

## Troubleshooting

### Sistem Tidak Mau Start

| Gejala | Solusi |
|---|---|
| TUI bilang env wajib kosong | Tab SETUP → `C` (generate .env.local), `F` (sync token) |
| Next.js error 400 saat login | Hapus `web-dashboard/.next/`, restart |
| Python exit (1) saat start | Cek log: kemungkinan `MQTT_HOSTNAME` / `AES_KEY` / `APD_SERVICE_TOKEN` belum diisi di `.env` |
| Dashboard kosong, tidak muat | Buka DevTools → Console — biasanya ada hint koneksi DB |

### Live Monitor Kosong

| Gejala | Solusi |
|---|---|
| WebSocket gagal connect | Pastikan Python backend running + port 8765 free |
| Akses via IP LAN tidak jalan | Buka via `localhost`, bukan IP. Atau set `NEXT_PUBLIC_YOLO_WS_URL` di .env.local |
| Tile node kosong | Cek RTSP URL di `/nodes` — ping dulu kameranya |

### Alarm ESP32 Tidak Bunyi

| Gejala | Solusi |
|---|---|
| Pesan masuk tapi diam | Cek SPIFFS — file `apd_alert.mp3` belum di-upload? |
| MQTT timeout | Cek serial monitor: NTP sync OK? cert valid? |
| LED tidak nyala | Cek wiring + polaritas LED + resistor 220Ω |
| Audio kresek-kresek | Kabel speaker terlalu panjang / wiring I2S salah |

Detail troubleshoot ESP32: [`alarm_apd/README.md`](../alarm_apd/README.md#troubleshooting).

### WhatsApp Tidak Terkirim

| Gejala | Solusi |
|---|---|
| Log "WA disabled" | `WA_API_URL` belum diisi di `.env` |
| 401 Unauthorized | `WA_API_USER` / `WA_API_PASS` salah, cek kembali |
| 500 di GoWA | Device WhatsApp belum scan QR / disconnect dari WA |

### Cloudflare Tunnel Down

| Gejala | Solusi |
|---|---|
| Domain return 530 | Tunnel belum running. Tab SETUP → `H` lagi |
| `cloudflared not found` | Install MSI dari [github.com/cloudflare/cloudflared/releases](https://github.com/cloudflare/cloudflared/releases) |
| WebSocket gagal di production | `NEXT_PUBLIC_YOLO_WS_URL` salah, harus `wss://ws-apd.yourdomain.com` |

---

## Demo Hari-H — Checklist

Sebelum demo dosen, lakukan dry-run:

- [ ] Bundle restored (env + db sinkron dengan dev)
- [ ] `python tui.py` → READINESS panel hijau semua
- [ ] `S` start all → 3 services hijau
- [ ] Buka dashboard via Cloudflare URL dari HP — login berhasil
- [ ] `python trigger_alarm.py --all` → speaker bunyi 2x (APD + gas)
- [ ] LED merah nyala saat gas alarm
- [ ] WA masuk ke nomor PIC
- [ ] `powershell -File scripts/demo_security.ps1 -Auto` → semua section pass
- [ ] Audit log mencatat IP HP sebagai user IP

Cek [`docs/PRESENTATION_READINESS.md`](PRESENTATION_READINESS.md) untuk checklist hari-H lengkap.
