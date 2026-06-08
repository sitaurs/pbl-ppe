# Smoke Test — IoT Security Monitoring System (SafeGuard APD)

> **Task:** 8.3 End-to-end smoke test  
> **Refs:** Requirements 1.x, 2.x, 3.x, 4.x, 7.x, 8.x | Design §8.3 & §10  
> **Tujuan:** Validasi integrasi end-to-end seluruh subsistem sebelum demo atau produksi.  
> **Waktu total estimasi:** 15–20 menit (termasuk warm-up hardware)

---

## Daftar Skenario

| ID | Skenario | Subsistem yang Diuji | Req |
|----|----------|----------------------|-----|
| A  | Pelanggaran APD → ESP32 alarm → WA → audit log | YOLO, MQTT, AES, ESP32, WA, Next.js | 1, 3, 4, 7 |
| B  | Tiup MQ-135 → telemetri dashboard → WA gas (30s) | ESP32 gas sensor, MQTT, Python, Next.js | 2, 8 |
| C  | Akses dashboard dari HP via Cloudflare → login → monitor | Cloudflare Tunnel, Next.js, WebSocket | 7 |

---

## Pre-Conditions Global

Sebelum menjalankan skenario manapun, pastikan semua kondisi berikut terpenuhi:

### Hardware

- [ ] ESP32 terpasang dan dihubungkan ke PC via USB (untuk serial monitor)
- [ ] Wiring sesuai pin map firmware:

  | Komponen | Pin ESP32 |
  |----------|-----------|
  | MAX98357A BCLK | GPIO26 |
  | MAX98357A LRC  | GPIO25 |
  | MAX98357A DIN  | GPIO22 |
  | Speaker (3W)   | Output MAX98357A |
  | LED status built-in | GPIO2 |
  | LED gas merah | GPIO13 |
  | Buzzer piezo | GPIO27 |
  | MQ-135 AOUT | GPIO34 (ADC1) |
  | Tombol BOOT | GPIO0 (built-in) |

- [ ] Speaker terhubung ke MAX98357A, volume terdengar dari jarak 1 meter
- [ ] MQ-135 sudah warm-up minimal **3 menit** setelah power-on (sensor ini butuh pemanasan)

### Firmware

- [ ] `alarm_apd.ino` sudah di-flash ke ESP32
- [ ] `AES_KEY_HEX` di firmware cocok dengan `AES_KEY` di `.env` root (32 hex chars = 16 bytes)
- [ ] `MY_NODE_ID` sesuai dengan konfigurasi node di dashboard
- [ ] SPIFFS sudah di-upload: file `apd_alert.mp3` ada di partisi flash ESP32
- [ ] Serial monitor terbuka di baud 115200

### Software

- [ ] `.env` root sudah benar: `MQTT_HOSTNAME`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `AES_KEY`, `APD_SERVICE_TOKEN`
- [ ] `web-dashboard/.env.local` sudah benar: `DATABASE_URL`, `NEXTAUTH_URL`, `APD_SERVICE_TOKEN`, `BEHIND_PROXY`, `NEXT_PUBLIC_YOLO_WS_URL`
- [ ] Next.js sudah running: `cd web-dashboard && npm run start` → listening di `:3000`
- [ ] Python backend sudah running: `python ServiceAPDBackend.py` → MQTT connected, tidak ada error startup
- [ ] cloudflared service sudah running: `Get-Service cloudflared` → Status `Running`
- [ ] Kamera (webcam atau IP cam) sudah terhubung dan feed masuk ke Python

### Verifikasi Awal Sebelum Skenario

Pastikan ESP32 sudah dalam state STANDBY:
- Serial monitor menampilkan `[boot] setup selesai. sistem standby.`
- LED built-in (GPIO2) **solid ON** (bukan kedip)

Pastikan Python startup clean:
```
[startup] All required env vars present.
[mqtt] connected to xxxxx.hivemq.cloud:8883
[mqtt] Subscribed to apd/telemetry/gas/+
```

---

## Skenario A — Pelanggaran APD → Alarm ESP32 → WA → Audit Log

### Tujuan

Memvalidasi alur lengkap: deteksi YOLO → enkripsi AES → publish MQTT per-node → decrypt ESP32 → alarm audio → notifikasi WA → update audit log dengan IP user nyata.

### Pre-Conditions Skenario A

- [ ] ESP32 dalam state STANDBY (LED solid ON)
- [ ] Kamera membidik area yang bisa dimasuki orang
- [ ] Nomor WA PIC sektor terdaftar di konfigurasi node di dashboard
- [ ] Python backend sedang proses kamera (log menunjukkan frame processing)
- [ ] Dashboard `/monitor` terbuka di browser untuk observasi real-time

### Langkah Uji

| # | Aksi | Aktor |
|---|------|-------|
| A1 | Masuk ke frame kamera **tanpa helm** (dan/atau tanpa vest) | Penguji |
| A2 | Tunggu sampai Python log menampilkan `APD violation detected` (maks 5 detik, bergantung frame skip) | Observasi |
| A3 | Perhatikan ESP32: LED berubah ke kedip ganda, speaker berbunyi | Observasi |
| A4 | Cek HP PIC: notifikasi WhatsApp masuk dengan foto snapshot | Observasi |
| A5 | Buka dashboard → menu **Audit Log** → filter action `VIOLATION` | Penguji |
| A6 | Verifikasi entry terbaru: kolom `ipAddress` menunjukkan IP user nyata | Penguji |

### Expected Outcomes

| ID | Expected | Cara Verifikasi |
|----|----------|-----------------|
| A-E1 | Python log: `[S-01] APD violation: ['helmet'] → publishing to apd/alarm/1` | Terminal Python |
| A-E2 | Python log: enkripsi AES dengan random IV → base64 publish ke `apd/alarm/1` | Terminal Python |
| A-E3 | Serial ESP32: `[parse] OK event='apd_violation' node=1 sektor=S-01` | Serial monitor |
| A-E4 | Serial ESP32: `[alarm] startAlarm() — playing /apd_alert.mp3 from SPIFFS` | Serial monitor |
| A-E5 | LED ESP32 GPIO2: mode **kedip ganda** (double blink) saat alarm aktif | Observasi fisik |
| A-E6 | Audio alarm berbunyi dari speaker: *"Peringatan, gunakan APD lengkap"* | Pendengaran |
| A-E7 | Setelah audio selesai: LED kembali **solid ON** (STANDBY) | Observasi fisik |
| A-E8 | WA masuk ke HP PIC dalam ≤ 15 detik setelah deteksi | HP PIC |
| A-E9 | WA berisi: nama sektor, jenis pelanggaran, timestamp, foto snapshot | HP PIC |
| A-E10 | Audit log Next.js: entry `action=VIOLATION`, `ipAddress` bukan IP Cloudflare (bukan 104.x.x.x) | Dashboard |
| A-E11 | Waktu dari deteksi ke alarm bunyi: **≤ 3 detik** | Stopwatch |

### Verifikasi Keamanan (Khusus Matkul Keamanan Jaringan)

- [ ] Serial ESP32 menampilkan dua encrypt berbeda untuk dua pesan berturut-turut (buktikan random IV): ciphertext panjangnya sama tapi isi berbeda
- [ ] Di HiveMQ Cloud console (jika accessible): payload MQTT tampak sebagai base64 ciphertext — bukan plaintext
- [ ] Serial ESP32 menampilkan `[aes] decrypt OK: XX bytes ciphertext -> YY bytes plaintext`

### Failure Criteria Skenario A

Skenario A **GAGAL** jika salah satu dari:
- ESP32 tidak alarm dalam 10 detik setelah Python publish
- Serial ESP32 menampilkan `WARN: decrypt/parse gagal`
- WA tidak masuk dalam 30 detik (tanpa error di Python log)
- Audit log menampilkan IP Cloudflare (104.x.x.x, 172.64.x.x) alih-alih IP user

---

## Skenario B — Tiup MQ-135 → Telemetri Dashboard → WA Gas (30s)

### Tujuan

Memvalidasi jalur sensor gas: ADC sampling → moving average → enkripsi → MQTT publish → Python decrypt + forward → simpan di DB → badge dashboard update → WA gas setelah sustained 30 detik.

### Pre-Conditions Skenario B

- [ ] MQ-135 sudah warm-up minimal 3 menit (LED gas dalam keadaan **OFF**, nilainya normal < threshold)
- [ ] Dashboard `/nodes` terbuka di browser — badge gas per node terlihat
- [ ] Serial monitor ESP32 aktif untuk observasi nilai ADC
- [ ] Gas threshold di firmware: `GAS_THRESHOLD = 2200` (default)
- [ ] Siapkan sumber gas ringan: **lighter gas** (jangan dinyalakan) atau **deodorant spray** — cukup tiupkan ke sensor

**Catatan keselamatan:** Gunakan dalam ruangan berventilasi. Jangan menyalakan lighter. Deodorant spray 1–2 semprotan sudah cukup untuk melampaui threshold.

### Langkah Uji

| # | Aksi | Aktor |
|---|------|-------|
| B1 | Baca nilai gas baseline di serial monitor: `[GAS] avg=XXX` (harus < 2200) | Observasi |
| B2 | Tiupkan gas (lighter/spray) ke sensor MQ-135 selama ~2 detik | Penguji |
| B3 | Perhatikan ESP32: LED merah (GPIO13) menyala, buzzer beep 200ms | Observasi |
| B4 | Serial monitor: baca nilai `avg` melampaui `threshold=2200` | Serial monitor |
| B5 | Tunggu Python log: `[gas] nodeId=1 raw=XXXX alert=true → forwarded to API` | Terminal Python |
| B6 | Buka dashboard `/nodes` — badge node berubah ke **"Gas: ALERT"** (polling 30 detik) | Dashboard |
| B7 | **Pertahankan** paparan gas ke sensor selama **35 detik** total | Penguji |
| B8 | Tunggu Python log: `[gas] sustained alert >30s → sending WA to PIC` | Terminal Python |
| B9 | Cek HP PIC: notifikasi WA gas masuk | HP PIC |
| B10 | Jauhkan sensor dari gas — tunggu nilai ADC turun kembali < 2200 | Penguji |
| B11 | Buka dashboard `/nodes` — badge kembali ke **"Gas: OK"** (dalam 30 detik) | Dashboard |

### Expected Outcomes

| ID | Expected | Cara Verifikasi |
|----|----------|-----------------|
| B-E1 | Serial ESP32: `[GAS] avg=XXXX > threshold=2200, ALERT! Publishing telemetry...` | Serial monitor |
| B-E2 | Serial ESP32: `[GAS] LED_RED ON, BEEP 200ms` | Serial monitor + pendengaran |
| B-E3 | LED GPIO13 (merah) menyala fisik | Observasi hardware |
| B-E4 | Buzzer beep 200ms terdengar — hanya sekali per onset alert (tidak berulang terus) | Pendengaran |
| B-E5 | Python log: `[gas] Received telemetry nodeId=1 alert=true raw=XXXX` | Terminal Python |
| B-E6 | Python log: `[gas] Forwarded to POST /api/telemetry/gas → 200 OK` | Terminal Python |
| B-E7 | Dashboard `/nodes`: badge berubah menjadi **"Gas: ALERT"** (merah) dalam ≤ 35 detik | Browser |
| B-E8 | Setelah 30 detik sustained: Python log `[gas] sending WA alert to PIC sektor S-01` | Terminal Python |
| B-E9 | WA masuk ke HP PIC dengan info: sektor, nilai raw gas, timestamp | HP PIC |
| B-E10 | Setelah gas dihilangkan: serial ESP32 nilai avg kembali < 2200, LED GPIO13 **mati** | Serial monitor + hardware |
| B-E11 | Dashboard badge kembali ke **"Gas: OK"** (hijau) dalam 1–2 polling cycle | Browser |

### Verifikasi Data (Matkul IoT)

- [ ] Database Next.js: buka `/api/telemetry/gas?nodeId=1` (atau lihat via admin) — entry baru tersimpan dengan field `raw`, `alert=true`, `timestamp`
- [ ] Moving average berfungsi: nilai di serial monitor berubah halus (bukan langsung spike), menunjukkan 5-sample rolling average aktif
- [ ] Heartbeat reguler: tanpa paparan gas, serial menampilkan publish tiap 60 detik dengan `alert=false`

### Failure Criteria Skenario B

Skenario B **GAGAL** jika salah satu dari:
- Nilai ADC tidak melampaui 2200 saat gas didekatkan (sensor mungkin rusak/belum warm-up)
- LED merah tidak menyala
- Telemetri tidak muncul di Python log
- Badge dashboard tidak update dalam 60 detik
- WA gas tidak masuk setelah 45 detik sustained alert

---

## Skenario C — Akses Dashboard dari HP via Cloudflare → Login → Buka Monitor

### Tujuan

Memvalidasi akses dari perangkat eksternal melalui Cloudflare Tunnel: HTTPS aktif, cookie Secure, WebSocket via WSS, IP user nyata di audit log.

### Pre-Conditions Skenario C

- [ ] cloudflared service **Running** (`Get-Service cloudflared` → `Running`)
- [ ] DNS sudah propagate: `safeguard.<domain>` dan `ws.safeguard.<domain>` resolve ke Cloudflare edge
- [ ] HP/tablet dalam jaringan **berbeda** dari laptop server (gunakan data seluler, bukan WiFi yang sama — untuk membuktikan akses publik)
- [ ] `web-dashboard/.env.local` berisi `BEHIND_PROXY=cloudflare` dan `NEXT_PUBLIC_YOLO_WS_URL=wss://ws.safeguard.<domain>`
- [ ] Next.js build production sedang running (`npm run start`)

### Langkah Uji

| # | Aksi | Aktor |
|---|------|-------|
| C1 | Di HP, buka browser dan navigasi ke `https://safeguard.<domain>` | Penguji (HP) |
| C2 | Verifikasi URL bar menampilkan 🔒 HTTPS — bukan HTTP | Observasi |
| C3 | Masukkan credentials login admin, klik Login | Penguji (HP) |
| C4 | Buka browser DevTools di HP (atau laptop mirror): Application → Cookies | Penguji |
| C5 | Cek cookie `apd_session`: flag `Secure` harus tercentang | DevTools |
| C6 | Navigasi ke halaman `/monitor` di dashboard | Penguji (HP) |
| C7 | Tunggu video stream WebSocket terhubung — frame kamera muncul | Observasi |
| C8 | Di browser DevTools: Network → Filter `WS` — lihat koneksi ke `wss://ws.safeguard.<domain>` | DevTools |
| C9 | Kembali ke laptop: buka dashboard → **Audit Log** | Penguji (laptop) |
| C10 | Cek entry login terbaru: `ipAddress` = IP publik HP (bukan 104.x.x.x) | Dashboard |
| C11 | Bandingkan IP di audit log dengan `https://ifconfig.me` dari HP | Penguji (HP) |

### Expected Outcomes

| ID | Expected | Cara Verifikasi |
|----|----------|-----------------|
| C-E1 | URL browser HP: `https://safeguard.<domain>` dengan 🔒 icon | Browser HP |
| C-E2 | TLS certificate valid — bukan self-signed / tidak ada warning | Browser HP |
| C-E3 | Login berhasil, redirect ke dashboard home | Browser HP |
| C-E4 | Cookie `apd_session` punya atribut `Secure=true` | DevTools |
| C-E5 | Halaman `/monitor` memuat, video stream YOLO tampil | Browser HP |
| C-E6 | WebSocket connect ke `wss://ws.safeguard.<domain>` (bukan `ws://localhost:8765`) | DevTools Network |
| C-E7 | Audit log: `action=LOGIN`, `ipAddress` = IP publik HP seluler | Dashboard audit log |
| C-E8 | IP di audit log BUKAN range Cloudflare (104.x.x.x, 172.64.x.x, 162.158.x.x) | Perbandingan manual |
| C-E9 | `https://safeguard.<domain>/api/health` dari HP → `{"status":"ok"}` | Browser HP |

### Verifikasi Tambahan (Opsional)

- [ ] Stop cloudflared (`Stop-Service cloudflared`) → akses `https://safeguard.<domain>` dari HP → error Cloudflare (502/526) — konfirmasi tunnel sudah benar-benar dipakai
- [ ] Akses `http://127.0.0.1:3000` dari laptop server → dashboard tetap bisa login dan digunakan (graceful fallback)
- [ ] Restart cloudflared (`Start-Service cloudflared`) → akses publik kembali normal

### Failure Criteria Skenario C

Skenario C **GAGAL** jika salah satu dari:
- Browser HP menampilkan "Not Secure" atau certificate error
- Cookie `apd_session` tidak punya flag `Secure`
- WebSocket di `/monitor` connect ke `ws://localhost:8765` (bukan WSS via domain)
- IP di audit log adalah IP Cloudflare atau `127.0.0.1`
- Video stream tidak tampil di HP (WebSocket tidak bisa menembus tunnel)

---

## Urutan Eksekusi yang Disarankan

Jalankan skenario dalam urutan: **C → A → B**

Alasannya:
1. **C dulu** — verifikasi akses publik sebelum memulai uji fungsional; jika tunnel tidak jalan, bisa difix dahulu
2. **A** — skenario terpenting (integrasi penuh IoT + keamanan)
3. **B** — membutuhkan waktu 35+ detik untuk sustained alert; jalankan terakhir agar tidak menunggu terlalu lama

---

## Template Log Pengujian

Salin tabel di bawah ke hasil tes (atau print dan isi manual) saat menjalankan smoke test.

---

### Log Smoke Test

**Tanggal:** _______________  
**Penguji:** _______________  
**Versi firmware:** _______________  
**Versi Next.js build:** _______________  
**Node ID yang diuji:** _______________  
**Domain Cloudflare:** _______________  

---

#### Checklist Pre-Conditions Global

| Item | Status | Catatan |
|------|--------|---------|
| Hardware wiring lengkap | ☐ OK / ☐ FAIL | |
| MQ-135 warm-up 3 menit | ☐ OK / ☐ FAIL | |
| Firmware di-flash + SPIFFS upload | ☐ OK / ☐ FAIL | |
| ESP32 serial monitor: STANDBY state | ☐ OK / ☐ FAIL | |
| `.env` root lengkap | ☐ OK / ☐ FAIL | |
| `.env.local` lengkap | ☐ OK / ☐ FAIL | |
| Next.js running `:3000` | ☐ OK / ☐ FAIL | |
| Python backend running, MQTT connected | ☐ OK / ☐ FAIL | |
| cloudflared service Running | ☐ OK / ☐ FAIL | |

---

#### Skenario C — Cloudflare Access

| Expected | Status | Nilai Aktual / Catatan |
|----------|--------|----------------------|
| C-E1: HTTPS URL dengan 🔒 | ☐ PASS / ☐ FAIL | |
| C-E2: TLS cert valid | ☐ PASS / ☐ FAIL | |
| C-E3: Login berhasil | ☐ PASS / ☐ FAIL | |
| C-E4: Cookie Secure flag | ☐ PASS / ☐ FAIL | |
| C-E5: Video stream tampil | ☐ PASS / ☐ FAIL | |
| C-E6: WebSocket → WSS domain | ☐ PASS / ☐ FAIL | URL WS aktual: |
| C-E7: Audit log IP user nyata | ☐ PASS / ☐ FAIL | IP tercatat: |
| C-E8: IP bukan Cloudflare range | ☐ PASS / ☐ FAIL | |
| C-E9: /api/health → {"status":"ok"} | ☐ PASS / ☐ FAIL | |

**Hasil Skenario C:** ☐ PASS / ☐ FAIL  
**Catatan:** _______________

---

#### Skenario A — APD Violation

| Expected | Status | Nilai Aktual / Catatan |
|----------|--------|----------------------|
| A-E1: Python log violation detected | ☐ PASS / ☐ FAIL | |
| A-E2: Python log AES encrypt + publish | ☐ PASS / ☐ FAIL | |
| A-E3: Serial ESP32 decrypt OK | ☐ PASS / ☐ FAIL | |
| A-E4: Serial ESP32 startAlarm() + SPIFFS | ☐ PASS / ☐ FAIL | |
| A-E5: LED double blink saat alarm | ☐ PASS / ☐ FAIL | |
| A-E6: Audio alarm berbunyi | ☐ PASS / ☐ FAIL | |
| A-E7: LED kembali solid ON setelah selesai | ☐ PASS / ☐ FAIL | |
| A-E8: WA masuk ≤ 15 detik | ☐ PASS / ☐ FAIL | Waktu WA masuk: |
| A-E9: WA berisi sektor + foto | ☐ PASS / ☐ FAIL | |
| A-E10: Audit log IP nyata bukan CF | ☐ PASS / ☐ FAIL | |
| A-E11: Waktu deteksi ke alarm ≤ 3s | ☐ PASS / ☐ FAIL | Waktu aktual: s |

**Hasil Skenario A:** ☐ PASS / ☐ FAIL  
**Catatan:** _______________

---

#### Skenario B — Gas Sensor

| Expected | Status | Nilai Aktual / Catatan |
|----------|--------|----------------------|
| B-E1: Serial ESP32 gas ALERT log | ☐ PASS / ☐ FAIL | Nilai avg: |
| B-E2: Serial ESP32 LED_RED + BEEP | ☐ PASS / ☐ FAIL | |
| B-E3: LED GPIO13 menyala merah | ☐ PASS / ☐ FAIL | |
| B-E4: Buzzer beep 200ms (1x onset) | ☐ PASS / ☐ FAIL | |
| B-E5: Python log gas telemetry received | ☐ PASS / ☐ FAIL | |
| B-E6: Python log forwarded → 200 OK | ☐ PASS / ☐ FAIL | |
| B-E7: Dashboard badge "Gas: ALERT" | ☐ PASS / ☐ FAIL | Delay tampil: s |
| B-E8: Python log WA gas setelah 30s | ☐ PASS / ☐ FAIL | |
| B-E9: WA gas masuk ke HP PIC | ☐ PASS / ☐ FAIL | |
| B-E10: LED GPIO13 mati setelah gas hilang | ☐ PASS / ☐ FAIL | |
| B-E11: Badge kembali "Gas: OK" | ☐ PASS / ☐ FAIL | |

**Hasil Skenario B:** ☐ PASS / ☐ FAIL  
**Catatan:** _______________

---

#### Ringkasan Akhir

| Skenario | Hasil | Jumlah PASS | Jumlah FAIL |
|----------|-------|-------------|-------------|
| C — Cloudflare Access | ☐ PASS / ☐ FAIL | /9 | |
| A — APD Violation | ☐ PASS / ☐ FAIL | /11 | |
| B — Gas Sensor | ☐ PASS / ☐ FAIL | /11 | |
| **TOTAL** | **☐ PASS / ☐ FAIL** | **/31** | |

**Smoke test PASS jika:** semua 3 skenario PASS (0 failure pada expected outcomes)  
**Smoke test FAIL jika:** ada 1 atau lebih failure criteria terpenuhi

---

**Tanda tangan penguji:** _______________  
**Waktu selesai:** _______________  

---

## Troubleshooting Cepat

### ESP32 tidak alarm setelah Python publish

1. Cek serial monitor: apakah MQTT connected? (harus ada `[mqtt] connected`)
2. Cek Python log: apakah publish berhasil? (`publish to apd/alarm/1 OK`)
3. Cek `AES_KEY_HEX` di firmware == `AES_KEY` di `.env` (sama persis, case-insensitive hex)
4. Cek `MY_NODE_ID` di firmware == `nodeId` di payload Python
5. Cek timestamp: jika NTP ESP32 gagal sync, replay protection akan reject semua pesan → periksa log `[ntp]`

### Badge gas tidak update di dashboard

1. Cek Python: apakah subscribe `apd/telemetry/gas/+` berhasil di startup log
2. Cek ESP32 serial: apakah `[GAS] Publishing encrypted telemetry...` muncul
3. Cek Python: apakah `POST /api/telemetry/gas` mengembalikan 200 (bukan 403)
4. Cek `APD_SERVICE_TOKEN` di `.env` == `APD_SERVICE_TOKEN` di `.env.local`
5. Dashboard badge polling setiap 30 detik — tunggu sampai 35 detik setelah telemetri masuk

### Cloudflare — IP di audit log masih IP Cloudflare

1. Pastikan `BEHIND_PROXY=cloudflare` ada di `web-dashboard/.env.local`
2. Restart Next.js setelah edit `.env.local`
3. Cek middleware `cloudflare-ips.ts` sudah aktif (tidak di-comment)
4. Cek header `CF-Connecting-IP` diterima: `curl -H "Host: ..." http://localhost:3000/api/health -v`

### WA tidak masuk

1. Cek Python log: apakah `WA notification sent: status=200`? Jika ya, masalah di delivery Fonnte (bukan kode)
2. Cek nomor tujuan terdaftar di konfigurasi node di dashboard
3. Cek kuota/saldo Fonnte API
4. Cek format nomor: harus `628xxxx` (tanpa `+`, dengan kode negara)

---

*Dokumen ini dibuat untuk task 8.3 — End-to-end smoke test*  
*Refs: Requirements 1–11, Design §8.3 & §10, tasks.md task 8.3*
