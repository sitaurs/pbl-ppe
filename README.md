# SafeGuard APD — Sistem Deteksi Pelanggaran APD

Sistem monitoring Alat Pelindung Diri (APD) berbasis computer vision untuk area kerja industri. Mendeteksi penggunaan helm dan rompi keselamatan secara real-time menggunakan YOLOv8, dengan notifikasi WhatsApp ke penanggung jawab, alarm fisik melalui ESP32, dan dashboard web yang dilengkapi autentikasi serta kontrol akses berbasis peran.

Proyek ini dikerjakan sebagai Proyek Berbasis Lapangan (PBL) yang menggabungkan tiga mata kuliah: Pengolahan Citra Digital, Keamanan Jaringan Cyber, serta IoT dan WSN.

---

## Daftar Isi

1. [Arsitektur Singkat](#arsitektur-singkat)
2. [Prasyarat](#prasyarat)
3. [Instalasi dari Nol](#instalasi-dari-nol)
4. [Menjalankan Sistem](#menjalankan-sistem)
5. [Konfigurasi Environment](#konfigurasi-environment)
6. [Akun dan Hak Akses](#akun-dan-hak-akses)
7. [Deployment Jarak Jauh (Cloudflare Tunnel)](#deployment-jarak-jauh-cloudflare-tunnel)
8. [Pemulihan Akses](#pemulihan-akses)
9. [Pengujian](#pengujian)
10. [Struktur Proyek](#struktur-proyek)
11. [Pemecahan Masalah](#pemecahan-masalah)

---

## Arsitektur Singkat

Sistem terdiri dari dua aplikasi utama yang berjalan di satu laptop, ditambah perangkat dan layanan pendukung.

| Aplikasi | Teknologi | Port | Tanggung Jawab |
|----------|-----------|------|----------------|
| Web Dashboard | Next.js 16, React 19, Prisma, SQLite | 3000 | Antarmuka, API, login, RBAC, audit log, database |
| Backend Deteksi | Python, YOLOv8, OpenCV | 8765 (WebSocket) | Tangkap video, deteksi APD, notifikasi WhatsApp, alarm MQTT |

Komunikasi antar komponen:

- Browser ke Next.js melalui HTTP untuk antarmuka dan operasi data.
- Browser ke Python melalui WebSocket untuk frame video live.
- Python ke Next.js melalui HTTP loopback dengan service token untuk melaporkan pelanggaran.
- Python ke ESP32 melalui MQTT untuk alarm.
- Python ke GoWA melalui HTTP untuk notifikasi WhatsApp.

Penjelasan lengkap dan visualisasi interaktif tersedia di `ARSITEKTUR.md` dan `arsitektur-visual/index.html`.

---

## Prasyarat

Pastikan perangkat berikut terpasang sebelum instalasi.

| Kebutuhan | Versi Minimum | Catatan |
|-----------|---------------|---------|
| Python | 3.10 | Untuk backend deteksi |
| Node.js | 18 LTS | Untuk web dashboard |
| npm | 9 | Terpasang bersama Node.js |
| Git | 2.30 | Untuk clone repositori |
| NVIDIA GPU + CUDA | CUDA 12.x | Opsional. Tanpa GPU, deteksi berjalan di CPU dengan kecepatan lebih rendah |

Layanan eksternal yang digunakan (sudah disiapkan, kredensial ada di file `.env`):

- Broker MQTT HiveMQ Cloud, atau Mosquitto lokal.
- Gateway WhatsApp GoWA pada VPS.

---

## Instalasi dari Nol

### 1. Clone Repositori

```bash
git clone https://github.com/sitaurs/pbl-ppe.git
cd pbl-ppe
```

### 2. Siapkan Backend Python

```bash
python -m venv .venv
```

Aktifkan virtual environment.

Windows (PowerShell):

```powershell
.venv\Scripts\Activate.ps1
```

Linux atau macOS:

```bash
source .venv/bin/activate
```

Pasang dependensi Python:

```bash
pip install -r requirements-local.txt
```

Salin template konfigurasi dan sesuaikan:

```bash
copy .env.example .env
```

Pada Linux atau macOS gunakan `cp .env.example .env`. Edit file `.env` sesuai kredensial Anda. Lihat bagian [Konfigurasi Environment](#konfigurasi-environment).

### 3. Siapkan Web Dashboard

```bash
cd web-dashboard
npm install
```

Buat berkas environment lokal yang berisi service token dan kunci enkripsi:

```bash
npm run setup:env
```

Perintah ini menghasilkan `web-dashboard/.env.local` dengan `APD_SERVICE_TOKEN` dan `APD_ENCRYPTION_KEY` yang sudah dibangkitkan secara acak.

Terapkan skema database dan isi data awal:

```bash
npx prisma migrate deploy
npm run seed
```

Perintah `npm run seed` membuat lima peran default dan satu akun admin. Password admin ditampilkan satu kali di terminal. Catat password tersebut.

Opsional, jika sebelumnya memakai penyimpanan berbasis JSON, pindahkan datanya ke database:

```bash
npm run migrate:json-to-db
```

### 4. Sinkronkan Service Token ke Python

Salin nilai `APD_SERVICE_TOKEN` dari `web-dashboard/.env.local` ke file `.env` di root proyek pada baris `APD_SERVICE_TOKEN`. Kedua nilai harus sama agar Python dapat melapor ke dashboard.

---

## Menjalankan Sistem

Urutan menjalankan penting. Next.js harus siap lebih dulu karena Python mengambil daftar node dari API Next.js saat mulai.

### Terminal 1 — Web Dashboard

```bash
cd web-dashboard
npm run dev
```

Mode pengembangan akan otomatis memuat ulang saat kode berubah. Untuk mode produksi gunakan `npm run build` lalu `npm run start`.

Akses dashboard di `http://localhost:3000`.

### Terminal 2 — Backend Deteksi

```bash
python ServiceAPDBackend.py
```

Tunggu hingga model YOLO selesai dimuat dan WebSocket aktif pada port 8765.

### Verifikasi

- Buka `http://localhost:3000/api/health`, harus mengembalikan status ok.
- Buka `http://localhost:3000/login`, halaman login muncul.
- Pada terminal Python, muncul log bahwa kamera dan WebSocket aktif.

---

## Konfigurasi Environment

### Backend Python (`.env` di root)

| Variabel | Deskripsi |
|----------|-----------|
| `MQTT_HOSTNAME` | Alamat broker MQTT. `localhost` untuk Mosquitto lokal, atau host HiveMQ Cloud |
| `MQTT_PORT` | 1883 untuk lokal tanpa TLS, 8883 untuk HiveMQ Cloud dengan TLS |
| `MQTT_USERNAME`, `MQTT_PASSWORD` | Kredensial MQTT |
| `MQTT_TOPIC_VIOLATION` | Topik publikasi alarm, default `APD_Violation` |
| `AES_KEY`, `AES_IV` | Kunci enkripsi AES-128, masing-masing 16 karakter |
| `WA_API_URL` | URL gateway GoWA WhatsApp |
| `WA_API_USER`, `WA_API_PASS` | Kredensial Basic Auth GoWA |
| `WA_DEVICE_ID` | ID device WhatsApp terdaftar |
| `CONFIDENCE_THRESHOLD` | Ambang deteksi APD, default 0.65 |
| `PERSON_CONFIDENCE_THRESHOLD` | Ambang deteksi orang, default 0.60 |
| `WA_COOLDOWN_SECONDS` | Jeda antar notifikasi per sektor, default 120 |
| `WEBSOCKET_PORT` | Port WebSocket streaming, default 8765 |
| `DASHBOARD_API_URL` | Origin Next.js, default `http://127.0.0.1:3000` |
| `APD_SERVICE_TOKEN` | Token untuk autentikasi ke API Next.js, harus sama dengan `.env.local` |

### Web Dashboard (`.env.local`)

| Variabel | Deskripsi |
|----------|-----------|
| `DATABASE_URL` | Lokasi database SQLite, default `file:../data/safeguard.db` |
| `APD_SERVICE_TOKEN` | Token untuk akses dari backend Python |
| `APD_ENCRYPTION_KEY` | Kunci AES-256 untuk enkripsi secret 2FA TOTP |
| `BEHIND_PROXY` | Kosong untuk lokal, `cloudflare` saat di belakang Cloudflare Tunnel |
| `NODE_ENV` | `development` atau `production` |

---

## Akun dan Hak Akses

Sistem memiliki lima peran default dengan total 34 izin granular berformat `resource:action`.

| Peran | Ringkasan |
|-------|-----------|
| Super_Admin | Akses penuh, termasuk manajemen pengguna, peran, dan pengaturan sistem |
| Admin_K3 | Semua kecuali manajemen pengguna, peran, dan pengaturan sistem |
| Supervisor | Live monitor, acknowledge pelanggaran, dan laporan pada sektor yang ditugaskan |
| PIC_Sektor | Hanya baca data sektor yang ditugaskan |
| Auditor | Hanya baca seluruh data, ekspor laporan, dan baca audit log |

Supervisor dan PIC_Sektor hanya melihat data sektor yang ditugaskan kepada mereka. Pengguna baru dipaksa mengganti password saat login pertama.

Halaman utama dashboard:

| Rute | Izin | Fungsi |
|------|------|--------|
| `/` | Sesi valid | Ringkasan dashboard |
| `/monitor` | `live:view` | Live streaming kamera |
| `/violations` | `violation:read` | Log pelanggaran, acknowledge, ekspor |
| `/nodes` | `node:read` | Manajemen node dan wizard konfigurasi |
| `/reports` | `report:read` | Laporan |
| `/sectors` | `sector:read` | Manajemen sektor dan penugasan pengguna |
| `/users` | `user:read` | Manajemen akun |
| `/roles` | `role:read` | Editor peran dan izin |
| `/audit-log` | `audit-log:read` | Audit log dan ekspor CSV |
| `/settings` | `setting:read` | Pengaturan branding, notifikasi, sistem |
| `/account/security` | Sesi valid | Pengaturan 2FA dan ganti password |

---

## Deployment Jarak Jauh (Cloudflare Tunnel)

Mode ini mengekspos dashboard ke internet tanpa membuka port pada router. Cocok untuk demonstrasi jarak jauh.

### Prasyarat

- Akun Cloudflare gratis dengan domain terdaftar di Cloudflare DNS, atau quick tunnel dengan subdomain `trycloudflare.com`.
- `cloudflared` terpasang. Unduh dari halaman rilis resmi Cloudflare.

### Langkah

```powershell
cloudflared tunnel login
cloudflared tunnel create safeguard-apd
```

Catat UUID tunnel yang dicetak. Berkas kredensial tersimpan di `C:\Users\<USER>\.cloudflared\<UUID>.json`.

Edit `web-dashboard/cloudflared/config.yml`, ganti placeholder `<tunnel-uuid>` dan `<USER>`, lalu sesuaikan hostname target.

Arahkan DNS dan pasang sebagai service Windows:

```powershell
cloudflared tunnel route dns safeguard-apd safeguard.example.com
cloudflared service install
```

Pada `web-dashboard/.env.local`, set `BEHIND_PROXY=cloudflare` agar middleware membaca `CF-Connecting-IP` dan memaksa cookie `Secure`. Jalankan ulang dashboard, lalu akses melalui hostname Cloudflare.

Akses lokal `http://127.0.0.1:3000` tetap berfungsi penuh meskipun tunnel mati. Deteksi YOLO dan alarm MQTT tidak terpengaruh oleh status tunnel.

---

## Pemulihan Akses

Jika akun admin terkunci atau password hilang, jalankan dari folder `web-dashboard`:

```bash
npm run reset:admin-password
```

Untuk target pengguna tertentu:

```bash
npm run reset:admin-password -- --username admin
```

Skrip membangkitkan password acak yang memenuhi kebijakan, menyetel paksa-ganti-password, dan mencetak password baru satu kali ke terminal.

Untuk mengembalikan ke kondisi sebelum migrasi database:

```bash
npm run restore-from-backup -- --backup-dir data/backup/{timestamp}
```

---

## Pengujian

Dari folder `web-dashboard`:

```bash
npm test
npx tsc --noEmit
npm run lint
```

Perintah `npm test` menjalankan unit test dan property-based test yang memverifikasi invarian kritis seperti idempotensi seed, rehash Argon2id, kebijakan password, cakupan permission map, keputusan RBAC, isolasi sektor, konsistensi cache, sesi sliding, rate limiter, keunikan token CSRF, round-trip AES-GCM, audit log hanya-tambah, validasi trusted proxy, keamanan redirect, dan idempotensi logout.

---

## Struktur Proyek

```
pbl-ppe/
  ServiceAPDBackend.py        Backend deteksi APD multi-kamera
  config.py                   Konfigurasi terpusat dibaca dari .env
  requirements-local.txt      Dependensi Python untuk lingkungan lokal
  .env.example                Template environment Python
  ARSITEKTUR.md               Penjelasan arsitektur
  arsitektur-visual/          Visualisasi interaktif (HTML/CSS/JS)
  esp32-alarm/                Firmware ESP32 untuk alarm
  web-dashboard/
    src/app/                  Halaman dan API route Next.js
    src/lib/auth/             Argon2, password policy, sesi, CSRF, TOTP
    src/lib/rbac/             Permission map, cache, isolasi sektor
    src/middleware.ts         Middleware auth, CSRF, RBAC
    prisma/schema.prisma      Skema database
    scripts/                  Skrip migrasi dan pemulihan
    data/                     Database SQLite dan backup JSON
    cloudflared/config.yml    Konfigurasi Cloudflare Tunnel
```

---

## Pemecahan Masalah

| Gejala | Penyebab dan Solusi |
|--------|---------------------|
| Login mengembalikan 400 | Pastikan dashboard memakai kode terbaru. Hapus cache build dengan menghapus folder `.next` lalu jalankan ulang |
| Python gagal lapor pelanggaran (401) | `APD_SERVICE_TOKEN` di `.env` Python berbeda dengan `web-dashboard/.env.local`. Samakan keduanya |
| Live monitor kosong | Pastikan backend Python berjalan dan WebSocket port 8765 aktif. Akses dashboard melalui `localhost`, bukan IP jaringan, agar koneksi WebSocket pengembangan stabil |
| Kamera RTSP timeout | Pastikan laptop berada pada jaringan yang sama dengan IP camera. Untuk pengujian gunakan webcam dengan sumber `0` |
| Notifikasi WhatsApp gagal | Periksa koneksi ke VPS GoWA dan pastikan nomor PIC valid serta terdaftar di WhatsApp |
| Build gagal mengunduh font | Build tidak memerlukan akses Google Fonts. Jika terjadi error font, hapus folder `.next` dan build ulang |

---

## Lisensi

Proyek akademik untuk Proyek Berbasis Lapangan bidang Keselamatan dan Kesehatan Kerja, Politeknik Negeri Malang.
