# PBL — Workshop IoT dan WSN (Wireless Sensor Network)

Bagian project SafeGuard APD yang relevan untuk mata kuliah Workshop IoT dan WSN.

> **Singkatnya:** kami pakai mikrokontroler ESP32 sebagai node IoT yang menerima alarm dari server, memutar suara peringatan, dan sekaligus jadi sensor gas untuk mendeteksi kebocoran/asap di area kerja.

---

## Apa itu IoT dan WSN dalam Project Ini?

**IoT (Internet of Things)** = perangkat fisik kecil yang terkoneksi internet. Di project kami, ESP32 adalah perangkat IoT yang:
- Terima perintah dari server lewat MQTT (internet)
- Punya output fisik (speaker, LED) yang bisa dikontrol dari jauh

**WSN (Wireless Sensor Network)** = jaringan beberapa sensor yang saling terhubung secara wireless. Di project kami, **setiap sektor area kerja punya 1 ESP32 dengan sensor gas MQ-135**, dan semuanya terkoneksi ke server pusat lewat WiFi + MQTT broker.

```
[Sektor A]──────WiFi──┐
   ESP32+MQ-135       │
                      │
[Sektor B]──────WiFi──┼──[MQTT Broker (HiveMQ)]──[Server]
   ESP32+MQ-135       │
                      │
[Sektor C]──────WiFi──┘
   ESP32+MQ-135
```

Server pusat bisa kirim alarm ke ESP32 spesifik (per-sektor) lewat topic `apd/alarm/{nodeId}`, dan setiap ESP32 publish data gas ke topic `apd/telemetry/gas/{nodeId}`.

---

## Hardware: Apa Saja yang Dipakai

### Komponen + Estimasi Harga

| Komponen | Jumlah | Harga (IDR) | Fungsi |
|---|---|---|---|
| ESP32 DevKit v1 (30/38 pin) | 1 | ~60.000 | Mikrokontroler utama, WiFi+BT bawaan |
| MAX98357A I2S Amplifier | 1 | ~25.000 | Konversi sinyal I2S digital ke analog audio |
| Speaker 3W 4Ω mono | 1 | ~20.000 | Pengeras suara alarm |
| MQ-135 Gas Sensor | 1 | ~35.000 | Deteksi gas (CO2, NH3, asap, alkohol) |
| LED merah 5mm | 1 | ~2.000 | Indikator visual alarm |
| Resistor 220Ω | 1 | ~1.000 | Current limiter LED |
| Kabel jumper + breadboard | secukupnya | ~10.000 | Wiring |
| **Total** | | **~153.000** | per node |

Untuk PBL kami pakai 1 node demo. Untuk deployment beneran, tinggal duplicate per sektor.

### Spesifikasi ESP32

ESP32 DevKit yang kami pakai:

| Spek | Detail |
|---|---|
| CPU | Dual-core Xtensa LX6, 240 MHz |
| RAM | 320 KB |
| Flash | 4 MB |
| WiFi | 802.11 b/g/n |
| Bluetooth | BLE + Classic |
| ADC | 12-bit, 18 channel |
| GPIO | 30+ pin digital |
| I2S | 2 channel (untuk audio) |

Cukup powerful untuk handle: WiFi + MQTT TLS + AES decrypt + HTTP audio stream + sensor sampling **secara bersamaan**.

---

## Wiring Diagram

```
                    ┌──────────────────────────────────┐
                    │        ESP32 DevKit v1           │
                    │                                  │
  MQ-135 AOUT ──────┤ GPIO 34  (ADC1_CH6, input only)  │
                    │                                  │
  MAX98357A BCLK ───┤ GPIO 26                          │
  MAX98357A LRC  ───┤ GPIO 25                          │
  MAX98357A DIN  ───┤ GPIO 22                          │
                    │                                  │
  LED merah (+) ─[220Ω]─ GPIO 13                       │
  LED merah (-) ────┤ GND                              │
                    │                                  │
  3.3V  ────────────┤ 3V3                              │
  5V    ────────────┤ VIN / 5V                         │
  GND   ────────────┤ GND                              │
                    │                                  │
  USB power/data ───┤ USB                              │
                    └──────────────────────────────────┘

MAX98357A: VIN→5V, GND→GND, BCLK→GPIO26, LRC→GPIO25, DIN→GPIO22
MQ-135:    VCC→5V, GND→GND, AOUT→GPIO34
LED merah: GPIO13 → 220Ω → LED(+) → LED(-) → GND
```

### Catatan Penting Wiring

| Komponen | Catatan |
|---|---|
| MQ-135 | Butuh **5V** untuk heater. AOUT ke GPIO 34 (input-only ADC) |
| MAX98357A | VCC bisa 3.3V atau 5V. Kami pakai 5V untuk volume maksimal |
| LED merah | Resistor 220Ω **wajib** seri, kalau tidak LED langsung putus |
| Speaker | Polaritas tidak penting untuk alarm (mono) |

### Kenapa Pin Spesifik Itu?

- **GPIO 34** untuk MQ-135: input-only pin, tidak bisa dipakai untuk output. Cocok untuk sensor analog. ADC1_CH6.
- **GPIO 26/25/22** untuk I2S: pin yang punya hardware I2S support, tidak konflik dengan SPI/I2C.
- **GPIO 13** untuk LED: pin biasa, tidak konflik dengan boot/flash.
- **Tidak pakai GPIO 0, 2, 12, 15** karena reserved untuk boot mode.

---

## Software Architecture

### Firmware ESP32 (`alarm_apd/alarm_apd.ino`)

State machine 4 status:

```
WIFI_CONNECTING    → konek ke WiFi (LED blink cepat)
       ↓
MQTT_CONNECTING    → konek ke broker MQTT TLS (LED blink medium)
       ↓
STANDBY            → siap menerima alarm (LED solid)
       ↓
ALARM_ACTIVE       → sedang putar audio alarm (LED double-blink)
       ↓ (setelah audio selesai)
STANDBY
```

Loop utama (`loop()`) non-blocking — semua subsistem dipanggil secara berurutan setiap iterasi:

```cpp
void loop() {
    ensureConnected();      // re-connect WiFi/MQTT kalau drop
    mqttClient.loop();      // pump pesan MQTT masuk
    handleAudioLoop();      // pump audio I2S
    updateLED();            // animasi LED state machine
    checkBootButton();      // baca tombol BOOT untuk test
    sampleGas();            // sample sensor MQ-135 (every 2s)
}
```

Tidak ada `delay()` panjang yang blocking. Semua komponen jalan paralel dengan timer-based scheduling.

---

## Komunikasi MQTT

### MQTT Topics

ESP32 subscribe ke 2 topic:
- `apd/alarm/{MY_NODE_ID}` — alarm spesifik untuk node ini (misal `apd/alarm/1`)
- `apd/control` — broadcast control (misal `apd_stop` untuk semua node)

ESP32 publish ke:
- `apd/telemetry/gas/{MY_NODE_ID}` — data sensor gas (heartbeat 60 detik + alert)

### Payload Format (terenkripsi AES-128-CBC)

Sebelum encrypt:
```json
{
  "event": "apd_violation",
  "nodeId": 1,
  "sektorId": "A1",
  "violations": ["no_helmet", "no_vest"],
  "timestamp": "2026-06-08T14:30:00Z"
}
```

Setelah encrypt:
```
base64(IV[16] || ciphertext_PKCS7)
```

ESP32 decrypt:
1. Decode base64
2. Pisah IV (16 byte pertama) dengan ciphertext
3. AES-128-CBC decrypt pakai mbedtls (built-in ESP32)
4. Strip PKCS7 padding
5. Parse JSON dengan ArduinoJson
6. Validasi: `nodeId == MY_NODE_ID`, timestamp dalam ±5 menit dari NTP
7. Eksekusi sesuai `event`

### Kenapa MQTT Bukan HTTP?

| Aspek | MQTT | HTTP |
|---|---|---|
| Konsumsi bandwidth | Rendah (header tiny) | Tinggi (header HTTP berat) |
| Latency | <50ms (publish-subscribe) | ~200ms (request-response) |
| Bidirectional | Ya, native (subscribe) | Tidak, perlu polling |
| Battery | Hemat (keep-alive ringan) | Boros (request berkala) |
| Cocok untuk IoT | ✅ Iya | ❌ Berat |

MQTT didesain untuk IoT dengan resource terbatas — sempurna untuk ESP32.

---

## Sensor Gas MQ-135

### Cara Kerja

MQ-135 adalah **sensor gas resistif**. Kandungan gas di udara mempengaruhi resistansi internal sensor. Resistansi diubah jadi tegangan analog (0-5V), lalu ESP32 baca lewat ADC.

| Output ADC | Kondisi udara |
|---|---|
| 0 - 500 | Udara bersih |
| 500 - 1500 | Normal |
| 1500 - 2500 | Mulai polusi (asap rokok dekat, dapur masak) |
| 2500+ | **Berbahaya** — gas terdeteksi tinggi |

Threshold default kami: **2200**.

### Sampling + Moving Average

Sensor analog itu noisy (nilai kadang lompat-lompat). Kami pakai moving average 5 sample:

```cpp
// Setiap 2 detik
int rawValue = analogRead(GAS_PIN);
gasRingBuf[gasRingIdx] = rawValue;
gasRingIdx = (gasRingIdx + 1) % 5;

// Hitung average
int sum = 0;
for (int i = 0; i < 5; i++) sum += gasRingBuf[i];
int avg = sum / 5;

if (avg > GAS_THRESHOLD) {
    // ALERT
}
```

Hasil: deteksi lebih stabil, tidak false alarm karena noise sesaat.

### Telemetri ke Server

Setiap 60 detik, ESP32 publish telemetri (heartbeat) walau tidak alert:

```json
{
  "event": "gas_telemetry",
  "nodeId": 1,
  "sektorId": "S-1",
  "raw": 387,
  "alert": false,
  "gasThreshold": 2200,
  "timestamp": "2026-06-08T14:30:00Z"
}
```

Heartbeat ini bukti device "hidup" — kalau hilang lebih dari 90 detik, dashboard akan tampilkan "node offline".

Saat alert (avg > threshold), publish langsung tanpa nunggu interval 60 detik.

### Reaksi ESP32 saat Alert

1. **LED merah** (GPIO 13) menyala
2. **Audio peringatan gas** — putar `http://VPS/audio/alarm_gas.mp3` lewat speaker
3. **Publish telemetri** ke MQTT (alert=true)

Server Python terima telemetri, kalau alert **bertahan > 30 detik**, kirim WhatsApp ke PIC sektor (lihat `docs/PBL-KEAMANAN-JARINGAN.md`).

---

## Audio Streaming via I2S

### Kenapa I2S, Bukan PWM?

PWM (Pulse Width Modulation) bisa mainkan audio sederhana tapi:
- Kualitas rendah (kresek-kresek)
- Volume terbatas
- Butuh resistor + kapasitor low-pass filter

I2S (Inter-IC Sound) standar professional:
- Audio digital langsung
- Kualitas CD (16-bit/44.1 kHz)
- MAX98357A handle DAC + amplifier sekaligus
- Output langsung ke speaker

### Sumber Audio: HTTP Streaming dari VPS

Awalnya kami pakai **SPIFFS** (file system di flash ESP32) untuk simpan MP3. Tapi flash 4 MB cuma cukup untuk 1-2 file pendek. Kalau mau audio panjang/bervariasi, butuh cara lain.

Solusi: **HTTP streaming dari VPS**. ESP32 download file MP3 chunk-by-chunk saat alarm bunyi:

```cpp
httpFile = new AudioFileSourceHTTPStream("http://157.245.206.36/audio/jokowi.mp3");
audioBuf = new AudioFileSourceBuffer(httpFile, 32768);  // 32 KB buffer
mp3 = new AudioGeneratorMP3();
mp3->begin(audioBuf, i2sOut);
```

### File Audio yang Tersedia

| URL | Untuk |
|---|---|
| `http://157.245.206.36/audio/jokowi.mp3` | Alarm pelanggaran APD |
| `http://157.245.206.36/audio/alarm_gas.mp3` | Alarm gas terdeteksi |

Audio bisa diganti kapan saja di VPS, tidak perlu re-flash ESP32.

### Loop Behavior

- **APD violation alarm** — putar 4x loop (cukup keras untuk perhatian)
- **Gas alarm** — putar 1x loop (lebih pendek, hemat baterai)
- **Test alarm** (tombol BOOT) — putar 1x

Pemain audio dilacak dengan variabel `currentAudioUrl` supaya saat re-loop tidak ngacau ke URL salah (bug yang dulu pernah terjadi).

---

## Tombol BOOT untuk Test Alarm Lokal

ESP32 punya tombol "BOOT" di board (untuk masuk flash mode). Kami repurpose tombol ini untuk **test alarm tanpa harus kirim MQTT**:

```cpp
// Edge detection: trigger hanya saat HIGH→LOW (baru ditekan)
// Plus debounce 3 detik antar tekan
if (btnState == LOW && prevBtnState == HIGH && (now - lastBtnPressMs) > 3000) {
    Serial.println("[btn] BOOT button ditekan");
    startAlarm();
    alarmPlayCount = ALARM_PLAY_MAX;  // hanya 1 putaran (test)
}
```

Tekan BOOT → alarm bunyi 1x putaran. Berguna saat:
- Demo offline tanpa internet
- Test wiring speaker
- Sanity check ESP32 hidup

---

## Pemetaan ke File

| Komponen | File | Lokasi |
|---|---|---|
| Firmware utama | `alarm_apd/alarm_apd.ino` | seluruh file 1815 baris |
| Wiring guide | `alarm_apd/README.md` | section Wiring Diagram |
| Setup PlatformIO | `alarm_apd/platformio.ini` | seluruh file |
| Audio file untuk SPIFFS | `alarm_apd/data/apd_alert.mp3` | (fallback offline) |
| Tools generate audio (TTS) | `alarm_apd/generate_audio.py` | seluruh file |
| Test checklist hardware | `alarm_apd/TEST_CHECKLIST.md` | 12 skenario |
| MQTT subscriber Python | `ServiceAPDBackend.py` | `_on_mqtt_message()`, `handle_gas_telemetry()` |
| Trigger MQTT manual | `trigger_alarm.py` | seluruh file |

### Bagian Penting di `alarm_apd.ino`

| Konsep | Baris (approx) |
|---|---|
| Konstanta + pin map | 33-50 |
| Root CA cert (Let's Encrypt R13) | 77-110 |
| `setup()` — init WiFi + NTP + MQTT | 220-260 |
| `connectMQTT()` — TLS handshake | 295-380 |
| `mqttCallback()` — terima pesan | 400-460 |
| `aesDecrypt()` — decrypt AES-128-CBC | 525-590 |
| `decryptAndParse()` — pipeline lengkap | 615-770 |
| `setupAudio()` — init I2S MAX98357A | 790-810 |
| `startAlarm()` — putar audio | 830-880 |
| `handleAudioLoop()` — pump audio non-blocking | 940-995 |
| `updateLED()` — state machine LED | 1145-1195 |
| `checkBootButton()` — tombol test | 1300-1335 |
| `handleGasAlert()` — sensor gas alert | 1370-1430 |
| `sampleGas()` — sampling MQ-135 | 1475-1530 |
| `encryptAndPublish()` — encrypt MQTT | 1560-1670 |
| `publishGasTelemetry()` — kirim telemetri | 1735-1810 |

---

## Pertanyaan Yang Mungkin Ditanya Dosen

### "Kenapa pakai ESP32, bukan Raspberry Pi atau Arduino?"

| Aspek | ESP32 | Arduino UNO | Raspberry Pi |
|---|---|---|---|
| Harga | ~60rb | ~50rb | ~600rb (Pi 4) |
| WiFi bawaan | ✅ Iya | ❌ Tidak (perlu shield) | ✅ Iya |
| Bluetooth bawaan | ✅ Iya | ❌ Tidak | ✅ Iya |
| RAM | 320 KB | 2 KB | 1-8 GB |
| OS | Tidak (bare metal) | Tidak | Linux |
| Konsumsi daya | ~80 mA | ~50 mA | ~700 mA (Pi 4) |
| Cocok 24/7 | ✅ Iya | ✅ Iya | ⚠️ Boros listrik |

ESP32 = sweet spot antara harga, fitur, dan power consumption. Untuk PBL ini paling ideal.

### "MQ-135 sensor murah, apa akurat?"

MQ-135 sensor industrial-grade harga rendah. Tidak presisi seperti sensor lab (yang harganya jutaan), tapi cukup untuk **trend detection** (deteksi perubahan signifikan). Untuk PBL, ini realistis karena di pabrik beneran biasa pakai sensor industri yang lebih mahal tapi prinsipnya sama.

Catatan: MQ-135 perlu **warm-up 2-5 menit** setelah power-on supaya nilai stabil. Pertama kali nyala, nilai bisa lompat-lompat. Itu normal.

### "Threshold 2200 itu didapat dari mana?"

Eksperimen empiris di lingkungan kami. Udara dapur normal kira-kira 400-800. Tiup korek api/lighter dekat sensor → langsung naik 3000+. Threshold 2200 cukup tinggi untuk tidak false alarm di kondisi normal, tapi sensitif untuk demo (asap rokok dari 1 meter sudah trigger).

Di production, threshold harus di-kalibrasi per environment (humidity, suhu, jenis gas yang ingin dideteksi).

### "Bagaimana kalau WiFi mati?"

ESP32 punya logic **auto-reconnect dengan exponential backoff**:
- Coba reconnect setelah 1 detik
- Kalau gagal, retry setelah 2 detik
- Kalau gagal lagi, retry setelah 4 detik
- Sampai max 30 detik antar retry
- Tidak `ESP.restart()` (karena akan reset state machine)

Selama disconnected, sensor gas tetap sampling dan log ke Serial. Begitu reconnect, telemetri yang ter-buffer di-publish.

### "Kenapa pakai HTTP streaming, bukan SPIFFS?"

SPIFFS (file system di flash ESP32) terbatas 4 MB. Cuma cukup 1-2 file MP3 pendek. Kalau mau ganti audio (misal alarm bahasa daerah, atau pesan customized), harus re-flash ESP32 — repot.

HTTP streaming = file ada di VPS, ESP32 stream chunk-by-chunk. Audio bisa diganti di VPS kapan saja, tidak perlu sentuh ESP32. Trade-off: harus ada koneksi internet saat alarm bunyi.

Fallback: ada `apd_alert.mp3` di SPIFFS sebagai backup kalau HTTP gagal (belum implementasi penuh).

### "Bagaimana kalau ada banyak ESP32 di banyak sektor, MQTT broker tidak overload?"

HiveMQ Cloud free tier handle **100 simultaneous connection** dan **10 GB traffic/month**. Per ESP32 cuma kirim ~1 KB per 60 detik (heartbeat) = ~720 KB/bulan. Masih jauh di bawah quota.

Untuk skala besar (>100 device), upgrade ke HiveMQ paid atau self-host Mosquitto di VPS sendiri.

### "AES decrypt di ESP32, lambat tidak?"

Tidak. mbedtls di ESP32 udah optimal. Decrypt 1 pesan ~144 byte cuma butuh **<1 ms**. Bottleneck-nya bukan AES, tapi WiFi latency dan TLS handshake awal.

### "Replay attack, dijaga tidak?"

Iya. Setiap pesan punya field `timestamp`. ESP32 cek selisih waktu pesan vs NTP — kalau > 5 menit, tolak. Attacker yang sniff pesan tidak bisa replay nanti.

ESP32 sync NTP via `pool.ntp.org` saat boot. Selama WiFi connect, waktu akurat.

### "Kalau attacker bisa colok USB ke ESP32, apa bisa nge-hack?"

Bisa kalau dia punya akses fisik dan tahu cara. ESP32 default tidak punya secure boot enabled. Dia bisa:
1. Re-flash firmware (ganti dengan yang dia tulis)
2. Baca AES key dari flash (kalau tidak di-encrypt)

Mitigasi production: enable **Secure Boot V2** + **Flash Encryption** di ESP32. Tapi sekali enable, bricking risk tinggi (kalau salah, ESP32 tidak bisa di-recover). Untuk PBL, kami tidak enable.

Praktis: lokasi ESP32 di tempat yang tidak gampang diakses pekerja (di atas plafon, dalam panel listrik, dll).

### "Bagaimana sensor MQ-135 dikalibrasi?"

MQ-135 datasheet kasih kurva resistansi vs ppm gas (CO2, NH3, alcohol, dll). Untuk kalibrasi presisi, perlu reference gas concentration (gas chamber lab). Untuk PBL kami pakai threshold empiris (eksperimen dengan asap, aroma) tanpa convert ke ppm.

Production deployment butuh kalibrasi tahunan dengan reference gas atau ganti sensor (sensor resistif degrade seiring waktu).

### "Power consumption?"

ESP32 idle: ~80 mA. Saat WiFi active + audio playing: ~250 mA. Average ~120 mA. Power supply 5V 1A cukup. Untuk operasi 24/7 di pabrik, pakai adapter wall (bukan baterai).

### "Multi-node, masing-masing punya AES key beda?"

Saat ini **semua node share 1 AES key yang sama**. Server publish ke topic `apd/alarm/{nodeId}` dengan ciphertext yang dibuat dengan AES key global. Setiap ESP32 decrypt pakai key yang sama, lalu validate `nodeId == MY_NODE_ID`.

Trade-off: kalau 1 ESP32 di-compromise, attacker dapat AES key yang valid untuk semua node. Lebih aman: 1 AES key per node (key rotation per device). Tapi lebih kompleks management.

Untuk PBL, simplicity > granularity.

---

## Bonus: Test Checklist Hardware

Sebelum deploy ke field, jalankan checklist ini ([`alarm_apd/TEST_CHECKLIST.md`](../alarm_apd/TEST_CHECKLIST.md)):

- [ ] Boot serial monitor — semua subsystem ok (WiFi, NTP, TLS, MQTT, SPIFFS)
- [ ] Tekan tombol BOOT → audio bunyi 1 putaran
- [ ] Tiup ke MQ-135 → LED merah nyala dalam 5 detik
- [ ] `python trigger_alarm.py --test` → audio APD bunyi
- [ ] `python trigger_alarm.py --gas` → audio gas + LED bunyi
- [ ] `python trigger_alarm.py --stop` → alarm langsung berhenti
- [ ] WiFi disconnect (cabut WiFi router) → ESP32 tidak crash, LED state berubah
- [ ] WiFi reconnect → MQTT auto-reconnect, telemetri normal lagi
- [ ] Listen 1 jam → tidak ada crash/restart
