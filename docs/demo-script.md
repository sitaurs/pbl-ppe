# Demo Script — IoT Security Monitoring System (SafeGuard APD)

> **Refs:** Requirements 11.1, 11.2 | Design §10.3  
> **Total waktu estimasi:** ±4 menit 30 detik  
> **Backup:** Video rekaman demo tersimpan di `docs/demo-video/` sebagai fallback hardware failure

---

## Pre-Demo Checklist

Lakukan sebelum presentasi dimulai (5–10 menit lebih awal):

- [ ] ESP32 sudah di-flash firmware `alarm_apd.ino` terbaru
- [ ] SPIFFS sudah di-upload (file `apd_alert.mp3` ada di flash)
- [ ] Wiring ESP32 lengkap: MAX98357A (audio), LED merah (GPIO13), buzzer (GPIO27), MQ-135 (GPIO34)
- [ ] Speaker terhubung ke MAX98357A dan volume cukup keras
- [ ] Laptop tersambung ke WiFi yang sama dengan ESP32
- [ ] Jalankan: `cd web-dashboard && npm run start` (Next.js production)
- [ ] Jalankan: `python ServiceAPDBackend.py` (cek log — tidak ada error startup)
- [ ] Jalankan: `cloudflared service start` atau `Start-Service cloudflared`
- [ ] Buka serial monitor Arduino IDE (baud 115200) — siap di layar kedua/tab tersembunyi
- [ ] Buka dashboard di browser: `https://safeguard.<domain>` — belum login
- [ ] Kamera posisi sudah membidik area demo (orang tanpa helm/vest)
- [ ] HP/tablet dosen dalam jangkauan dan nomor WA sudah di-whitelist
- [ ] Koneksi internet stabil (Cloudflare butuh internet aktif)

---

## Langkah 1 — Start Semua Service

**Estimasi waktu: 30 detik**

### Checklist

- [ ] Buka terminal 1: jalankan Next.js
  ```powershell
  cd "d:\vscode-chat\pycham pbl\pycham pbl\web-dashboard"
  npm run start
  ```
- [ ] Buka terminal 2: jalankan Python backend
  ```powershell
  cd "d:\vscode-chat\pycham pbl\pycham pbl"
  python ServiceAPDBackend.py
  ```
- [ ] Buka terminal 3: pastikan cloudflared jalan
  ```powershell
  Get-Service cloudflared
  # Status harus: Running
  ```
- [ ] Konfirmasi ESP32 terkoneksi: LED built-in **solid ON** (STANDBY state)

### Expected Outcome

- Log Python: `✓ MQTT connected to xxxxx.hivemq.cloud:8883`
- Log Python: `✓ Subscribed apd/telemetry/gas/+`
- Log Python: `✓ All required env vars present`
- Next.js: `ready - started server on http://localhost:3000`
- Cloudflare: `GET Status: Running`
- Serial monitor ESP32: `WiFi connected. IP: 192.168.x.x` → `MQTT connected` → `Subscribed to apd/alarm/1`

### Screenshot Placeholder

```
┌──────────────────────────────────────────────────────────┐
│  [SS-01] Terminal Python — startup log                   │
│  Tampil:                                                  │
│  - "All required env vars present"                       │
│  - "MQTT connected to hivemq.cloud:8883"                 │
│  - "Subscribed to apd/telemetry/gas/+"                   │
│  - Tidak ada baris merah ERROR                           │
└──────────────────────────────────────────────────────────┘
```

### Backup / Fallback

Jika cloudflared tidak start: jalankan quick tunnel
```powershell
cloudflared tunnel --url http://127.0.0.1:3000
```
Pakai URL `https://random-name.trycloudflare.com` yang muncul untuk langkah 2.

---

## Langkah 2 — Buka Dashboard via Cloudflare Hostname (HTTPS)

**Estimasi waktu: 20 detik**

### Checklist

- [ ] Buka browser di perangkat **berbeda** (HP dosen atau laptop lain)
- [ ] Navigasi ke `https://safeguard.<domain>`
- [ ] Pastikan URL bar menunjukkan 🔒 (HTTPS, bukan HTTP)
- [ ] Halaman login SafeGuard APD muncul

### Expected Outcome

- Browser menampilkan halaman login dengan HTTPS lock icon
- Tidak ada warning "Not Secure" atau certificate error
- URL bukan `http://localhost:3000` — ini membuktikan akses dari luar via Cloudflare

### Screenshot Placeholder

```
┌──────────────────────────────────────────────────────────┐
│  [SS-02] Browser — halaman login dashboard               │
│  Tampil:                                                  │
│  - URL bar: https://safeguard.<domain> dengan 🔒         │
│  - Form login SafeGuard APD                              │
│  - Bukan localhost                                       │
└──────────────────────────────────────────────────────────┘
```

### Backup / Fallback

Jika domain belum propagate: pakai `https://random-name.trycloudflare.com` dari quick tunnel (langkah 1 fallback). HTTPS tetap valid.

---

## Langkah 3 — Login (Audit Log Mencatat IP User)

**Estimasi waktu: 30 detik**

### Checklist

- [ ] Di browser (HP/laptop dosen), masukkan credentials admin
- [ ] Klik Login
- [ ] Dashboard home berhasil tampil
- [ ] Buka halaman **Audit Log** di dashboard (menu admin)
- [ ] Tunjukkan entry login terbaru — kolom `ipAddress` menunjukkan **IP publik user** (bukan IP Cloudflare edge)

### Expected Outcome

- Login berhasil, session cookie `apd_session` ter-set dengan flag `Secure`
- Audit log entry terbaru: `action: LOGIN`, `ipAddress: <IP publik dosen>`, bukan `104.x.x.x` (Cloudflare range)
- Untuk verifikasi IP dosen: buka `https://ifconfig.me` di HP dosen — cocokkan dengan audit log

### Screenshot Placeholder

```
┌──────────────────────────────────────────────────────────┐
│  [SS-03a] Dashboard audit log entry                      │
│  Tampil:                                                  │
│  - Kolom: timestamp | user | action | ipAddress          │
│  - Entry teratas: action=LOGIN, ip=<IP nyata dosen>      │
│  - IP bukan 104.x.x.x (Cloudflare) atau 127.0.0.1       │
│                                                          │
│  [SS-03b] Browser DevTools > Application > Cookies       │
│  Tampil:                                                  │
│  - Cookie apd_session dengan flag "Secure" ✓             │
└──────────────────────────────────────────────────────────┘
```

### Backup / Fallback

Jika akses via localhost (fallback langkah 1): cookie tidak akan `Secure` karena HTTP. Tunjukkan audit log IP saja sebagai bukti.

---

## Langkah 4 — Trigger Pelanggaran APD (Kamera Deteksi)

**Estimasi waktu: 30 detik**

### Checklist

- [ ] Pastikan live monitor terbuka di halaman `/monitor` dashboard
- [ ] Masuk area frame kamera **tanpa helm dan/atau vest**
- [ ] Tunggu YOLO detection (frame skip 3s) — bounding box merah muncul di video stream
- [ ] Pelanggaran terdaftar di dashboard (`violations[]` ditampilkan)

### Expected Outcome

- Video stream di `/monitor` menunjukkan bounding box merah dengan label `no_helmet` / `no_vest`
- Log Python: `[S-01] APD violation detected: ['helmet', 'vest'] → publishing to apd/alarm/1`
- Dashboard `/violations` atau notifikasi banner muncul dengan timestamp dan foto snapshot

### Screenshot Placeholder

```
┌──────────────────────────────────────────────────────────┐
│  [SS-04] Dashboard halaman /monitor                      │
│  Tampil:                                                  │
│  - Video feed live dengan bounding box merah             │
│  - Label: "no_helmet" / "no_vest" dengan confidence %    │
│  - Timestamp deteksi                                     │
└──────────────────────────────────────────────────────────┘
```

### Backup / Fallback

Jika kamera tidak detect: gunakan mode test manual di Python
```python
# Di Python REPL atau tambahan script kecil
import requests, json
requests.post("http://127.0.0.1:3000/api/violations/test", 
    json={"nodeId": 1, "violations": ["helmet"]},
    headers={"Authorization": "Bearer <APD_SERVICE_TOKEN>"})
```

---

## Langkah 5 — ESP32 Alarm Bunyi dalam < 3 Detik

**Estimasi waktu: 20 detik**

### Checklist

- [ ] Setelah deteksi langkah 4, perhatikan ESP32
- [ ] LED built-in berubah dari **solid ON** → **kedip ganda** (alarm state)
- [ ] Speaker berbunyi: *"Peringatan, gunakan APD lengkap"*
- [ ] Waktu dari deteksi ke bunyi ≤ 3 detik (stopwatch jika perlu)

### Expected Outcome

- Serial monitor: `[ALARM] Received encrypted payload` → `[ALARM] Decrypt OK` → `[ALARM] nodeId=1 OK` → `[ALARM] Playing audio...`
- Audio terdengar jelas dari speaker
- LED kedip pola double-blink (dua kedip cepat, pause, dua kedip lagi)
- Setelah audio selesai: LED kembali solid ON (STANDBY)

### Screenshot Placeholder

```
┌──────────────────────────────────────────────────────────┐
│  [SS-05] Serial monitor ESP32 saat alarm trigger         │
│  Tampil:                                                  │
│  - "[ALARM] Received encrypted payload (len=XX)"        │
│  - "[ALARM] Base64 decode OK"                           │
│  - "[ALARM] AES-128-CBC decrypt OK"                     │
│  - "[ALARM] JSON parse OK. event=apd_violation"         │
│  - "[ALARM] nodeId=1 verified"                          │
│  - "[ALARM] Playing /apd_alert.mp3 from SPIFFS"         │
└──────────────────────────────────────────────────────────┘
```

### Backup / Fallback

Jika audio tidak bunyi (SPIFFS issue): firmware otomatis fallback ke buzzer pattern (tone series). Tetap visible di serial monitor. Untuk demo: tekan tombol BOOT di ESP32 untuk trigger test alarm manual tanpa MQTT.

---

## Langkah 6 — WA Notification Masuk dengan Foto

**Estimasi waktu: 30 detik**

### Checklist

- [ ] Cek HP PIC/operator yang terdaftar di konfigurasi WA
- [ ] Notifikasi WhatsApp masuk dalam ~5–10 detik setelah deteksi
- [ ] Pesan berisi: nama sektor, jenis pelanggaran, timestamp
- [ ] Foto snapshot pelanggaran ter-attach di pesan WA

### Expected Outcome

- WA message diterima dari nomor Fonnte/WA Business API
- Teks: "⚠️ Pelanggaran APD terdeteksi di Sektor S-01. Pelanggaran: helmet, vest. Waktu: 2025-XX-XX XX:XX:XX"
- Gambar snapshot frame yang dideteksi

### Screenshot Placeholder

```
┌──────────────────────────────────────────────────────────┐
│  [SS-06] HP — notifikasi WhatsApp                        │
│  Tampil:                                                  │
│  - Pesan teks dengan info sektor + pelanggaran           │
│  - Foto/gambar snapshot pelanggaran ter-attach           │
│  - Timestamp sesuai waktu deteksi                       │
└──────────────────────────────────────────────────────────┘
```

### Backup / Fallback

Jika WA tidak masuk dalam 15 detik: tunjukkan log Python `WA notification sent: status=200` sebagai bukti pengiriman. Lanjutkan demo tanpa menunggu — WA delivery bisa delay karena server Fonnte.

---

## Langkah 7 — Tiup Gas → LED Merah + Telemetri di Dashboard

**Estimasi waktu: 45 detik**

### Checklist

- [ ] Siapkan sumber gas: lighter (jangan dinyalakan) / deodorant spray di dekat MQ-135
- [ ] Tiup/semprot gas ke sensor MQ-135 di ESP32
- [ ] LED merah (GPIO13) menyala dalam ≤ 2 detik
- [ ] Buzzer berbunyi beep 200ms (satu kali saat alert mulai)
- [ ] Buka dashboard `/nodes` — badge "Gas: ALERT" muncul di node terkait
- [ ] Serial monitor menunjukkan publish telemetry `alert=true`

### Expected Outcome

- Serial monitor: `[GAS] avg=2756 > threshold=2200, ALERT! Publishing telemetry...`
- Log Python: `[gas] nodeId=1 raw=2756 alert=true → saved to DB`
- Dashboard `/nodes`: badge node berubah dari "Gas: OK" → "Gas: ALERT" (dalam ~5 detik polling)
- LED GPIO13 menyala merah
- Beep 200ms terdengar

### Screenshot Placeholder

```
┌──────────────────────────────────────────────────────────┐
│  [SS-07a] Serial monitor ESP32 — gas telemetry           │
│  Tampil:                                                  │
│  - "[GAS] Sample: 2756 (avg: 2756)"                     │
│  - "[GAS] ALERT! avg=2756 > threshold=2200"             │
│  - "[GAS] Publishing encrypted telemetry..."            │
│  - "[GAS] LED_RED ON, BEEP 200ms"                       │
│                                                          │
│  [SS-07b] Dashboard /nodes — badge gas alert            │
│  Tampil:                                                  │
│  - Card node dengan badge merah "Gas: ALERT"            │
│  - Raw value: 2756 | Threshold: 2200                    │
│  - Timestamp update terbaru                             │
└──────────────────────────────────────────────────────────┘
```

### Backup / Fallback

Jika sensor MQ-135 tidak sensitif: sementara turunkan threshold di `alarm_apd.ino` ke 200 untuk demo, lalu restore setelah. Alternatif: kirim telemetry langsung via MQTT publish di dashboard admin panel (jika tersedia).

---

## Langkah 8 — Stop Tunnel → Akses Lokal Tetap Jalan

**Estimasi waktu: 30 detik**

### Checklist

- [ ] Tunjukkan bahwa saat ini dashboard masih accessible via Cloudflare HTTPS
- [ ] Stop cloudflared service:
  ```powershell
  Stop-Service cloudflared
  ```
- [ ] Refresh `https://safeguard.<domain>` di browser eksternal → **tidak bisa akses** (expected)
- [ ] Buka `http://127.0.0.1:3000` di laptop server → **masih bisa login dan gunakan dashboard**
- [ ] Demonstrasikan bahwa semua fitur (violations, audit log, monitor) tetap jalan secara lokal

### Expected Outcome

- Setelah tunnel stop: `https://safeguard.<domain>` → browser error (526 atau 502 dari Cloudflare)
- `http://127.0.0.1:3000` → dashboard login masih jalan, semua fitur aktif
- Ini membuktikan Cloudflare hanya sebagai tunnel/proxy — sistem tidak bergantung penuh pada Cloudflare

### Screenshot Placeholder

```
┌──────────────────────────────────────────────────────────┐
│  [SS-08a] Browser eksternal — setelah tunnel stop        │
│  Tampil:                                                  │
│  - Cloudflare error page (502/526)                       │
│  - Konfirmasi: tunnel memang sudah down                  │
│                                                          │
│  [SS-08b] Browser di laptop — akses lokal               │
│  Tampil:                                                  │
│  - http://127.0.0.1:3000 dashboard tetap loading         │
│  - Login berhasil                                        │
│  - Fitur violations / audit log tetap accessible         │
└──────────────────────────────────────────────────────────┘
```

### Backup / Fallback

Jika tidak sempat demo langkah ini karena waktu: cukup tunjukkan bahwa `http://127.0.0.1:3000` bisa dibuka sebelum stop tunnel. Poin konseptualnya sudah tersampaikan.

---

---

## Dry-Run Checklist

> Lakukan dry-run **minimal 1 hari sebelum presentasi**. Centang semua item — jika ada yang ✗, selesaikan sebelum hari-H.

### Hardware ✓

- [ ] ESP32 menyala dan LED solid ON (STANDBY) → WiFi + MQTT TLS tersambung
- [ ] Speaker berbunyi saat tombol BOOT ditekan → audio SPIFFS OK
- [ ] LED merah (GPIO13) menyala saat MQ-135 ditiup gas → sensor gas OK
- [ ] Buzzer beep 200ms saat gas alert pertama → piezo OK
- [ ] Wiring kabel semua terpasang kuat, tidak ada yang longgar

### Software ✓

- [ ] `python ServiceAPDBackend.py` → startup tanpa baris merah ERROR
- [ ] `npm run start` (web-dashboard) → server ready di port 3000
- [ ] `Get-Service cloudflared` → Status: Running
- [ ] Serial monitor (baud 115200) → log decrypt sukses saat alarm dipicu
- [ ] Dashboard `https://safeguard.<domain>` → HTTPS lock icon, bukan HTTP

### End-to-End Smoke Test ✓

- [ ] **Skenario A (APD alarm):** masuk frame tanpa helm → ESP32 alarm bunyi dalam < 3 detik, serial monitor tampil `[ALARM] AES-128-CBC decrypt OK`
- [ ] **Skenario B (Gas alert):** tiup MQ-135 → dashboard badge berubah "Gas: ALERT" dalam < 10 detik
- [ ] **Skenario C (Audit log IP):** login dari HP via Cloudflare → audit log menampilkan IP publik HP, bukan IP Cloudflare (104.x.x.x)
- [ ] **Skenario D (WA):** pelanggaran APD → WA notification masuk ke HP PIC dalam < 15 detik

### Serial Monitor — Baris yang Harus Muncul Saat Dry-Run ✓

Saat alarm APD diterima, tandai baris ini muncul di serial monitor:

```
[ALARM] Received encrypted payload (len=XX)
[ALARM] Base64 decode OK
[ALARM] AES-128-CBC decrypt OK
[ALARM] JSON parse OK. event=apd_violation
[ALARM] nodeId=1 verified
[ALARM] Playing /apd_alert.mp3 from SPIFFS
```

Saat gas alert:

```
[GAS] Sample: XXXX (avg: XXXX)
[GAS] ALERT! avg=XXXX > threshold=2200
[GAS] Publishing encrypted telemetry...
[GAS] LED_RED ON, BEEP 200ms
```

### Waktu Dry-Run

- [ ] Seluruh 8 langkah demo selesai dalam **< 5 menit** (ukur dengan stopwatch)
- [ ] Rekam video saat dry-run berjalan mulus → simpan ke `docs/demo-video/demo-full-run.mp4`

### Backup Plan — Video Rekaman ✓

- [ ] File `docs/demo-video/demo-full-run.mp4` sudah ada dan bisa diputar
- [ ] Video minimal 720p, audio ESP32 dan terminal log keduanya terdengar/terlihat jelas
- [ ] Video mencakup: serial monitor AES decrypt, badge Gas ALERT, audit log IP, WA notification

---

## Ringkasan Waktu

| Langkah | Deskripsi | Estimasi |
|---------|-----------|----------|
| Pre-demo | Persiapan hardware + software | 10 menit (sebelum presentasi) |
| 1 | Start semua service | 30 detik |
| 2 | Buka dashboard via Cloudflare HTTPS | 20 detik |
| 3 | Login + cek audit log IP | 30 detik |
| 4 | Trigger pelanggaran APD | 30 detik |
| 5 | ESP32 alarm bunyi < 3s | 20 detik |
| 6 | WA notification + foto | 30 detik |
| 7 | Gas sensor → LED + dashboard | 45 detik |
| 8 | Stop tunnel → lokal tetap jalan | 30 detik |
| **Total** | | **~4 menit 35 detik** |

> Batas waktu spec: < 5 menit ✓

---

## Backup Plan Utama — Video Rekaman Demo

Jika hardware bermasalah saat hari-H (ESP32 mati, WiFi router bermasalah, kamera disconnect):

**Siapkan video rekaman demo sebelum presentasi:**

1. Rekam semua 8 langkah di atas dalam kondisi hardware berfungsi normal
2. Simpan di `docs/demo-video/demo-full-run.mp4` (resolusi minimal 720p)
3. Pastikan audio ESP32, terminal log, dan browser semuanya visible di recording
4. Skenario yang harus terekam:
   - Audio alarm bunyi dari speaker
   - Serial monitor decode AES berhasil
   - WA notification masuk di HP
   - Badge "Gas: ALERT" muncul di dashboard

**Urutan fallback saat demo:**

| Kondisi | Fallback |
|---------|----------|
| ESP32 tidak menyala | Tunjukkan serial monitor dari recording sebelumnya |
| MQ-135 tidak sensitif | Turunkan threshold sementara atau trigger via MQTT manual |
| WA tidak masuk | Tunjukkan log Python `WA sent: 200` + screenshot dari rekaman |
| Cloudflare down | Pakai quick tunnel: `cloudflared tunnel --url http://127.0.0.1:3000` |
| Kamera tidak detect | Gunakan script trigger manual violation di Python |
| Seluruh hardware fail | Putar `docs/demo-video/demo-full-run.mp4` dan jelaskan secara verbal |

---

## Klaim yang Harus Dapat Dijawab Saat Q&A

**Keamanan Jaringan:**
- "Kenapa pakai AES-128-CBC bukan GCM?" → CBC dengan random IV cukup untuk threat model PBL; GCM lebih baik tapi API mbedtls lebih kompleks (documented trade-off)
- "Bagaimana replay protection?" → Timestamp field di payload; ESP32 reject jika selisih > 5 menit dengan NTP
- "Kenapa IV di-prepend ke ciphertext bukan di-hardcode?" → IV bukan rahasia, hanya harus unik per pesan; statis IV rawan chosen-plaintext attack

**IoT & WSN:**
- "Kenapa per-node topic, bukan broadcast?" → Bandwidth efisien, hanya sektor relevan yang terima; payload level validation tetap ada sebagai defense-in-depth
- "Kenapa SPIFFS, bukan streaming audio?" → Tidak bergantung internet/VPS; latency <100ms vs 1–3s streaming; cocok untuk alarm safety-critical
- "Bagaimana jika MQTT disconnect?" → Auto-reconnect dengan exponential backoff (1s, 2s, 4s, ..., max 30s); tidak reset perangkat

---

*Generated for Requirements 11.1, 11.2 | Design §10.3*
