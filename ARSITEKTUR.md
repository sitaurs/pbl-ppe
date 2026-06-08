# Arsitektur SafeGuard APD

Dokumen ini menjelaskan cara kerja sistem SafeGuard APD secara teknis namun mudah dipahami: komponen apa saja yang ada, siapa mengerjakan apa, dan bagaimana mereka saling berkomunikasi.

---

## 1. Gambaran Umum

SafeGuard APD adalah sistem deteksi pelanggaran Alat Pelindung Diri (helm dan rompi) di area kerja. Sistem menangkap video dari kamera, mendeteksi orang yang tidak memakai APD lengkap menggunakan YOLOv8, lalu mengirim alarm ke perangkat ESP32 dan notifikasi WhatsApp ke penanggung jawab.

Sistem terdiri dari dua aplikasi utama yang berjalan di satu laptop, ditambah perangkat keras dan layanan eksternal pendukung.

---

## 2. Dua Aplikasi Utama

### Aplikasi 1: Next.js (Web Dashboard)

Satu proses Node.js pada port 3000. Menangani seluruh kebutuhan web dalam satu kesatuan:

- Menyajikan halaman antarmuka (React)
- Menyediakan API di jalur `/api/*`
- Login, sesi, dan kontrol akses berbasis peran (RBAC)
- Membaca dan menulis database SQLite melalui Prisma
- Mencatat audit log untuk setiap aksi penting

Perintah menjalankan: `npm run dev` (mode pengembangan) atau `npm run start` (mode produksi).

### Aplikasi 2: Python (Deteksi YOLO)

Satu proses Python. Menangani kecerdasan deteksi dan komunikasi perangkat keras:

- Membuka aliran video dari kamera (RTSP, HTTP, atau webcam)
- Menjalankan inferensi YOLOv8 untuk mendeteksi helm dan rompi
- Menggambar kotak penanda pada frame (hijau untuk aman, merah untuk pelanggaran)
- Menyiarkan frame ke browser melalui WebSocket pada port 8765
- Mengirim notifikasi WhatsApp ke PIC melalui gateway GoWA
- Mempublikasikan alarm ke ESP32 melalui MQTT
- Melaporkan pelanggaran ke Next.js melalui HTTP

Perintah menjalankan: `python ServiceAPDBackend.py`.

> Next.js adalah framework fullstack, sehingga frontend dan backend web menjadi satu proses dengan satu port. Inilah alasan jumlah aplikasi inti hanya dua, bukan tiga.

---

## 3. Komponen Pendukung

| Komponen | Fungsi |
|----------|--------|
| SQLite (`data/safeguard.db`) | Penyimpanan data permanen: pengguna, peran, izin, sesi, node, pelanggaran, pengaturan, audit log. Hanya diakses oleh Next.js melalui Prisma. |
| IP Camera / Webcam | Sumber video untuk deteksi. Hanya diakses oleh Python. |
| ESP32 | Mikrokontroler dengan speaker. Berlangganan topik MQTT dan membunyikan alarm saat ada pelanggaran. |
| HiveMQ Cloud (MQTT) | Perantara pesan antara Python dan ESP32. Port 8883 dengan TLS. Alternatif: Mosquitto lokal port 1883. |
| GoWA VPS | Gateway WhatsApp swakelola. Python mengirim foto pelanggaran dan pesan ke gateway ini. |
| Cloudflare Tunnel | Pintu akses jarak jauh. Mengekspos layanan lokal ke internet melalui TLS tanpa membuka port pada router. |

---

## 4. Pembagian Tugas

| Pekerjaan | Next.js | Python | SQLite |
|-----------|:-------:|:------:|:------:|
| Menyajikan halaman web | Ya | | |
| Form login dan verifikasi password Argon2 | Ya | | |
| Pemeriksaan izin (RBAC) | Ya | | |
| Pencatatan audit log | Ya | | |
| CRUD node, pengguna, peran, sektor | Ya | | |
| Halaman dashboard dan statistik | Ya | | |
| Uji koneksi RTSP dan MQTT | Ya | | |
| Pengaturan sistem | Ya | | |
| Halaman dan ekspor audit log | Ya | | |
| Daftar dan acknowledge pelanggaran | Ya | | |
| Menangkap frame dari kamera | | Ya | |
| Inferensi YOLO (deteksi APD) | | Ya | |
| Menggambar penanda pada frame | | Ya | |
| Menyiarkan frame ke browser (WebSocket) | | Ya | |
| Mengirim WhatsApp ke PIC | | Ya | |
| Publikasi alarm MQTT ke ESP32 | | Ya | |
| Melaporkan pelanggaran ke dashboard | Penerima | Ya | |
| Menyimpan data permanen | | | Ya |

---

## 5. Jalur Komunikasi

### Browser ke Next.js (HTTP)
Untuk login, navigasi halaman, dan operasi data. Menggunakan cookie sesi dan token CSRF. Melalui HTTPS jika diakses lewat Cloudflare Tunnel.

### Browser ke Python (WebSocket)
Halaman live monitor membuka koneksi WebSocket langsung ke `ws://host:8765` milik Python untuk menerima frame video. Tidak melewati Next.js agar latensi rendah dan hemat bandwidth.

### Python ke Next.js (HTTP loopback)
Python memanggil `http://127.0.0.1:3000/api/...` dengan header `Authorization: Bearer <APD_SERVICE_TOKEN>` untuk mengambil daftar node dan melaporkan pelanggaran baru. Koneksi loopback lokal, tidak melewati Cloudflare Tunnel.

### Python ke ESP32 (MQTT)
Python mempublikasikan pesan terenkripsi AES-128 ke topik `APD_Violation` di broker MQTT. ESP32 berlangganan topik yang sama dan membunyikan alarm.

### Python ke GoWA (HTTP)
Python mengirim `POST` ke endpoint GoWA untuk meneruskan foto pelanggaran dan pesan ke WhatsApp.

---

## 6. Alur Skenario Penting

### Skenario A: Login
1. Pengguna membuka `/login` dan mengisi username serta password.
2. Form mengirim `POST /api/auth/login`.
3. Next.js memeriksa rate limit, mencari pengguna di database, dan memverifikasi password dengan Argon2id.
4. Jika 2FA aktif, sistem meminta kode TOTP.
5. Sesi dibuat, cookie diset, token CSRF dikembalikan, audit log dicatat.
6. Pengguna diarahkan ke halaman sesuai perannya.

### Skenario B: Tambah Node
1. Pengguna membuka wizard tambah node di halaman `/nodes`.
2. Mengisi info sektor, konfigurasi kamera, dan konfigurasi ESP32.
3. Next.js memvalidasi data, memeriksa izin `node:create`, lalu menyimpan ke SQLite.
4. Python pada siklus refresh berikutnya mengambil daftar node terbaru melalui `GET /api/nodes` dan mulai memantau kamera baru.

### Skenario C: Deteksi Pelanggaran
1. Python menangkap frame dari kamera.
2. YOLOv8 mendeteksi orang, helm, dan rompi.
3. Python menentukan apakah ada orang tanpa APD lengkap.
4. Jika ada pelanggaran, Python melakukan empat aksi paralel:
   - Mengirim WhatsApp ke PIC melalui GoWA.
   - Mempublikasikan alarm MQTT yang memicu ESP32.
   - Melaporkan pelanggaran ke Next.js (`POST /api/violations` dengan service token), tersimpan ke SQLite dan audit log.
   - Menyiarkan frame dengan penanda merah ke browser via WebSocket.

### Skenario D: Acknowledge Pelanggaran
1. Pengguna membuka `/violations` dan menekan tombol acknowledge.
2. Next.js memeriksa sesi, token CSRF, izin `violation:acknowledge`, dan isolasi sektor.
3. Status pelanggaran diperbarui di SQLite, audit log dicatat.

---

## 7. Keamanan

- Password disimpan dengan hashing Argon2id (memory-hard, rekomendasi OWASP).
- Lima peran default dengan total 34 izin granular berformat `resource:action`.
- Isolasi data per sektor: Supervisor dan PIC hanya melihat data sektor yang ditugaskan.
- Token CSRF pada setiap permintaan mutasi.
- Pembatasan percobaan login dan penguncian akun sementara.
- Audit log bersifat hanya-tambah untuk seluruh aksi penting.
- 2FA TOTP opsional dengan kode pemulihan sekali pakai.
- Header keamanan dan Content Security Policy pada setiap respons.
- Service token terpisah untuk akses mesin-ke-mesin dari Python.

---

## 8. Deployment Singkat

1. Jalankan Next.js lebih dulu: `npm run start` di folder `web-dashboard`.
2. Jalankan Python: `python ServiceAPDBackend.py` di folder root proyek.
3. Opsional, jalankan Cloudflare Tunnel untuk akses jarak jauh.

Urutan penting: Next.js harus siap sebelum Python, karena Python mengambil daftar node dari API Next.js saat mulai.

Panduan lengkap deployment ada di `web-dashboard/README.md`.

---

## 9. Pemetaan ke Mata Kuliah PBL

| Mata Kuliah | Komponen di Proyek |
|-------------|--------------------|
| Pengolahan Citra Digital | YOLOv8 deteksi helm dan rompi, frame skip, resize, threshold confidence. File `ServiceAPDBackend.py` fungsi `detect_ppe()`. |
| Keamanan Jaringan Cyber | Argon2id, RBAC, CSRF, rate limit, 2FA TOTP, audit log, TLS via Cloudflare Tunnel, service token. Folder `web-dashboard/src/lib/auth` dan `src/middleware.ts`. |
| IoT dan WSN | Multi-node kamera, ESP32, MQTT TLS HiveMQ, WebSocket. File `esp32_alarm.ino` dan bagian MQTT di `ServiceAPDBackend.py`. |

---

## 10. Visualisasi Interaktif

Buka `arsitektur-visual/index.html` di browser untuk melihat diagram interaktif, animasi alur permintaan, dan penjelasan tiap komponen secara visual.

---

## Pemetaan Mata Kuliah → File & Kode

Tabel berikut memetakan setiap topik mata kuliah ke file dan fungsi spesifik dalam kodebase, memudahkan penelusuran implementasi teknis untuk keperluan penilaian atau tinjauan akademik.

| Mata Kuliah / Fitur | File | Fungsi / Baris | Keterangan |
|---------------------|------|----------------|------------|
| Keamanan Jaringan — Argon2id | `web-dashboard/src/lib/auth/argon2.ts` | `hashPassword()`, `verifyPassword()` | Password hashing KDF |
| Keamanan Jaringan — 2FA TOTP | `web-dashboard/src/lib/auth/totp.ts` | `generateTotpSecret()`, `verifyTotp()` | RFC 6238 TOTP |
| Keamanan Jaringan — RBAC | `web-dashboard/src/lib/rbac/permission-map.ts` | `PERMISSION_MAP`, `lookupPermission()` | 34 permissions granular |
| Keamanan Jaringan — AES-128-CBC (Python) | `ServiceAPDBackend.py` | `encrypt_aes128()`, `decrypt_aes128()` | Random IV per pesan |
| Keamanan Jaringan — AES-128-CBC (ESP32) | `alarm_apd/alarm_apd.ino` | `aesDecrypt()`, `encryptAndPublish()` | mbedtls built-in |
| Keamanan Jaringan — Cloudflare Tunnel | `web-dashboard/cloudflared/config.yml` + `src/lib/proxy/cloudflare-ips.ts` | `resolveClientIp()` | TLS termination + IP validation |
| Pengolahan Citra — YOLO inference | `ServiceAPDBackend.py` | `detect_ppe()`, `process_camera_node()` | YOLOv8 + frame skip |
| IoT & WSN — MQTT TLS + per-node routing | `ServiceAPDBackend.py` | `setup_mqtt()`, `process_camera_node()` | HiveMQ Cloud TLS |
| IoT & WSN — ESP32 firmware | `alarm_apd/alarm_apd.ino` | `setup()`, `loop()`, `connectMQTT()` | Production firmware |
| IoT & WSN — Sensor gas MQ-135 | `alarm_apd/alarm_apd.ino` | `sampleGas()`, `handleGasAlert()`, `publishGasTelemetry()` | ADC + moving avg |
