# Presentation Readiness — Quick Reference Card

> **Refs:** Requirements 11.1, 11.2 | Task 8.4 — Dry-run presentasi  
> **Print halaman ini dan tempel di meja demo.**

---

## ⏱ Timeline Presentasi

| Fase | Waktu |
|------|-------|
| Setup hardware + software | T−10 menit |
| Presentasi slide (latar belakang, arsitektur) | T+0 – T+5 menit |
| **Demo live (8 langkah)** | T+5 – T+10 menit (~4 menit 30 detik) |
| Q&A | T+10 menit |

---

## ✅ 1. Dry-Run Checklist (Semua Harus Hijau Sebelum Hari-H)

### Hardware

| Item | Status |
|------|--------|
| ESP32 LED solid ON (WiFi + MQTT tersambung) | ☐ |
| Speaker bunyi saat tombol BOOT ditekan | ☐ |
| LED merah (GPIO13) ON saat gas ditiup | ☐ |
| Buzzer beep 200ms saat gas alert | ☐ |
| Semua kabel terpasang kuat | ☐ |

### Software

| Item | Status |
|------|--------|
| `python ServiceAPDBackend.py` → no ERROR di startup | ☐ |
| Next.js `npm run start` → ready port 3000 | ☐ |
| `Get-Service cloudflared` → Running | ☐ |
| Dashboard https via Cloudflare → 🔒 lock icon | ☐ |
| Serial monitor siap di tab terpisah (baud 115200) | ☐ |

### End-to-End Smoke

| Skenario | Status |
|----------|--------|
| A: APD alarm — bunyi < 3 detik setelah deteksi | ☐ |
| B: Gas alert — badge dashboard berubah < 10 detik | ☐ |
| C: Audit log IP — IP user nyata, bukan 104.x.x.x | ☐ |
| D: WA notification — masuk < 15 detik | ☐ |
| **Total demo < 5 menit** (ukur stopwatch) | ☐ |

---

## 🖥 2. Serial Monitor — Baris AES Decrypt yang Disorot ke Dosen

Buka Arduino IDE Serial Monitor (baud **115200**) sebelum demo.

**Saat alarm APD diterima**, baris kunci yang harus terlihat:

```
[ALARM] Received encrypted payload (len=XX)   ← payload terenkripsi masuk
[ALARM] Base64 decode OK                       ← decode base64 berhasil
[ALARM] AES-128-CBC decrypt OK                 ← ← SOROT INI ke dosen
[ALARM] JSON parse OK. event=apd_violation     ← plaintext valid JSON
[ALARM] nodeId=1 verified                      ← defense-in-depth OK
[ALARM] Playing /apd_alert.mp3 from SPIFFS    ← audio dari flash lokal
```

> **Poin yang disampaikan ke dosen:** "Di sini terlihat ESP32 menerima payload yang sudah terenkripsi AES-128-CBC dari Python backend, men-decrypt-nya menggunakan `mbedtls/aes.h`, dan baru menjalankan alarm setelah JSON valid."

**Saat gas sensor alert**, baris kunci:

```
[GAS] Sample: 2756 (avg: 2756)                ← ADC reading
[GAS] ALERT! avg=2756 > threshold=2200        ← ← SOROT INI
[GAS] Publishing encrypted telemetry...       ← juga terenkripsi
[GAS] LED_RED ON, BEEP 200ms                  ← indikator lokal
```

---

## 🔍 3. Audit Log — Cara Tunjukkan IP User Nyata

**Langkah cepat:**

1. Minta dosen buka `https://ifconfig.me` di HP → catat IP (mis. `180.245.x.x`)
2. Login dashboard dari HP dosen via `https://safeguard.<domain>`
3. Buka menu **Admin → Audit Log**
4. Entry paling atas: `action=LOGIN`, kolom `ipAddress` harus cocok dengan `ifconfig.me`

**Poin yang disampaikan:** "IP yang tercatat adalah IP publik user nyata, bukan IP Cloudflare edge (104.x.x.x), karena middleware membaca header `CF-Connecting-IP` yang dikirim Cloudflare."

**Verifikasi cepat:** IP Cloudflare range adalah `104.16.0.0/12`, `172.64.0.0/13`, `131.0.72.0/22`. IP user nyata Indonesia biasanya `180.x.x.x`, `114.x.x.x`, `140.x.x.x`, dll.

---

## 🟥 4. Gas Badge Alert — Langkah Trigger untuk Demo

**Persiapan (sebelum demo):**
- Siapkan lighter (tidak dinyalakan) atau spray deodorant di dekat ESP32
- Buka halaman `/nodes` di dashboard di browser kedua

**Langkah saat demo:**

1. Tunjukkan badge "Gas: OK" di dashboard `/nodes`
2. Semprot gas / dekatkan lighter (gas butane) ke sensor MQ-135 selama 2–3 detik
3. ESP32: LED merah GPIO13 menyala + buzzer beep 200ms
4. Serial monitor: baris `[GAS] ALERT! avg=XXXX > threshold=2200` muncul
5. Dashboard: badge berubah **"Gas: ALERT"** (polling 30 detik, atau refresh manual)
6. Tunjukkan badge merah ke dosen

**Troubleshoot jika sensor kurang sensitif:**
- Turunkan `GAS_THRESHOLD` di `alarm_apd.ino` dari `2200` ke `500` untuk demo
- Re-flash ESP32 (± 30 detik dengan IDE)
- Restore nilai setelah presentasi

---

## 🎥 5. Backup Plan — Rekam Video Demo

### Cara Rekam Video Dry-Run

**Tools yang disarankan:**
- **OBS Studio** (gratis): rekam layar + audio, output ke MP4
- **Xbox Game Bar** (Windows 10/11): `Win + G` → Record → output otomatis ke `Videos/Captures/`
- **Zoom / Meet screen share** + record: paling mudah tapi butuh internet

**Setup recording:**
1. Buka OBS Studio (atau Xbox Game Bar)
2. Tambahkan dua source: `Display Capture` (layar penuh) + `Audio Output Capture`
3. Pastikan serial monitor Arduino IDE terlihat di frame
4. Start recording → jalankan 8 langkah demo → stop recording
5. Rename file → `docs/demo-video/demo-full-run.mp4`

**Checklist video selesai:**
- [ ] Durasi video: 4–5 menit
- [ ] Audio ESP32 terdengar (alarm berbunyi)
- [ ] Serial monitor AES decrypt baris terlihat jelas (zoom in jika perlu)
- [ ] Badge "Gas: ALERT" di dashboard terlihat jelas
- [ ] Audit log dengan IP user nyata terlihat

### Skenario Fallback Saat Hari-H

| Kondisi | Tindakan |
|---------|----------|
| ESP32 tidak menyala / tidak connect | Putar segment video serial monitor + langkah alarm |
| MQ-135 tidak sensitif | Turunkan threshold sementara, atau putar video segment gas |
| WA tidak masuk | Tunjukkan log Python `WA sent: 200` di terminal |
| Cloudflare hostname down | `cloudflared tunnel --url http://127.0.0.1:3000` → dapat URL `*.trycloudflare.com` |
| Kamera tidak detect | Script trigger manual (lihat `docs/demo-script.md` langkah 4 fallback) |
| **Seluruh hardware fail** | **Putar `docs/demo-video/demo-full-run.mp4` dan jelaskan verbally** |

---

## 📋 Klaim Q&A Cepat

| Pertanyaan | Jawaban Singkat |
|------------|-----------------|
| Kenapa AES-128-CBC bukan GCM? | CBC + random IV cukup untuk threat model; GCM lebih baik tapi mbedtls API lebih kompleks (documented trade-off) |
| Bagaimana replay protection? | Timestamp di payload; ESP32 reject jika selisih > 5 menit dengan NTP |
| Kenapa IV di-prepend? | IV bukan rahasia — hanya harus unik. Static IV rawan chosen-plaintext attack |
| Kenapa per-node topic? | Bandwidth efisien; hanya sektor relevan terima; payload validation sebagai defense-in-depth |
| Kenapa SPIFFS bukan streaming? | Tidak bergantung internet; latency <100ms vs 1–3s; cocok alarm safety-critical |
| MQTT reconnect jika disconnect? | Exponential backoff: 1s, 2s, 4s, ..., max 30s — tidak reset perangkat |

---

*Dokumen ini dibuat untuk Task 8.4 — Dry-Run Presentasi*  
*Lihat `docs/demo-script.md` untuk script lengkap 8 langkah demo*
