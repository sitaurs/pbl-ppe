# alarm_apd — ESP32 Firmware untuk Alarm APD + Sensor Gas

Firmware production-ready untuk node IoT SafeGuard APD. Menjalankan alarm audio via I2S, monitoring gas MQ-135, dan komunikasi MQTT TLS terenkripsi AES-128-CBC.

---

## Daftar Isi

1. [Komponen Hardware](#komponen-hardware)
2. [Wiring Diagram](#wiring-diagram)
3. [Pin Mapping](#pin-mapping)
4. [Library Dependencies](#library-dependencies)
5. [Upload SPIFFS (File Audio)](#upload-spiffs-file-audio)
6. [Cara Mengganti Audio Alarm](#cara-mengganti-audio-alarm)
7. [Konfigurasi Firmware](#konfigurasi-firmware)
8. [Troubleshooting](#troubleshooting)

---

## Komponen Hardware

| Komponen | Jumlah | Keterangan |
|----------|--------|------------|
| ESP32 DevKit v1 (30-pin atau 38-pin) | 1 | Microcontroller utama |
| MAX98357A I2S Amplifier | 1 | Modul amplifier audio digital |
| Speaker 4Ω / 8Ω (0.5W–3W) | 1 | Output audio alarm |
| Sensor Gas MQ-135 | 1 | Deteksi gas berbahaya (CO2, NH3, asap) |
| LED merah (5mm atau SMD) | 1 | Indikator gas alert (GPIO13) |
| LED built-in ESP32 | — | Indikator status sistem (GPIO2) |
| Buzzer pasif 5V | 1 | Beep indikator gas lokal (GPIO27) |
| Resistor 220Ω | 1 | Seri ke LED merah |
| Kabel jumper | secukupnya | |
| Breadboard | 1 | Prototyping |

---

## Wiring Diagram

```
                        ┌─────────────────────────────────────┐
                        │          ESP32 DevKit v1            │
                        │                                     │
    MQ-135 (AOUT) ──────┤ GPIO34 (ADC1_CH6, input-only)      │
                        │                                     │
    MAX98357A BCLK ─────┤ GPIO26                              │
    MAX98357A LRC  ─────┤ GPIO25                              │
    MAX98357A DIN  ─────┤ GPIO22                              │
                        │                                     │
    LED merah (A) ──[220Ω]─ GPIO13                            │
    LED merah (K) ──────┤ GND                                 │
                        │                                     │
    Buzzer (+) ─────────┤ GPIO27                              │
    Buzzer (-) ─────────┤ GND                                 │
                        │                                     │
    [BOOT button] ──────┤ GPIO0 (built-in di board)           │
    LED built-in ───────┤ GPIO2  (built-in di board)          │
                        │                                     │
    3.3V ───────────────┤ 3V3                                 │
    5V  ────────────────┤ VIN / 5V                            │
    GND ────────────────┤ GND                                 │
                        └─────────────────────────────────────┘


Koneksi MAX98357A ke ESP32:
─────────────────────────────────────────────────────────────
  MAX98357A Pin    │  ESP32 Pin   │  Keterangan
  ─────────────────┼──────────────┼─────────────────────────
  VIN              │  5V (VIN)    │  Power 3.3V–5V
  GND              │  GND         │  Ground
  BCLK             │  GPIO26      │  I2S Bit Clock
  LRC (WS)         │  GPIO25      │  I2S Left-Right Clock
  DIN              │  GPIO22      │  I2S Data Input
  GAIN             │  (floating)  │  Floating = +9dB gain
  SD (shutdown)    │  (floating)  │  Floating = aktif
─────────────────────────────────────────────────────────────


Koneksi MQ-135 ke ESP32:
─────────────────────────────────────────────────────────────
  MQ-135 Pin  │  ESP32 Pin   │  Keterangan
  ────────────┼──────────────┼──────────────────────────────
  VCC         │  5V (VIN)    │  Sensor butuh 5V untuk heater
  GND         │  GND         │
  AOUT        │  GPIO34      │  Analog output (0–3.3V)
  DOUT        │  (tidak dipakai) │  Digital threshold output
─────────────────────────────────────────────────────────────

PENTING: GPIO34 adalah input-only (tidak ada pull-up/pull-down
internal). Jangan hubungkan ke output push-pull tanpa resistor seri.


Koneksi LED Merah (Gas Alert):
─────────────────────────────────────────────────────────────
  GPIO13 ──── [220Ω] ──── LED(+) ──── LED(-) ──── GND
─────────────────────────────────────────────────────────────


Koneksi Buzzer Pasif:
─────────────────────────────────────────────────────────────
  GPIO27 ──── Buzzer(+) ──── Buzzer(-) ──── GND
  (buzzer pasif dikendalikan PWM via tone() atau ledcWrite)
─────────────────────────────────────────────────────────────
```

---

## Pin Mapping

| Fungsi | GPIO | Tipe | Catatan |
|--------|------|------|---------|
| I2S BCLK (audio) | GPIO26 | Output | Bit Clock ke MAX98357A |
| I2S LRC / WS (audio) | GPIO25 | Output | Word Select ke MAX98357A |
| I2S DOUT (audio) | GPIO22 | Output | Data ke MAX98357A DIN |
| LED status built-in | GPIO2 | Output | 4 state: WiFi/MQTT/Standby/Alarm |
| LED gas alert | GPIO13 | Output | Menyala saat gas > threshold |
| Buzzer | GPIO27 | Output (PWM) | Beep 200ms saat gas alert |
| MQ-135 analog out | GPIO34 | Input (ADC1) | Input-only, ADC1_CH6 |
| Tombol BOOT (test) | GPIO0 | Input | Trigger alarm test manual |

---

## Library Dependencies

Install semua library berikut via Arduino Library Manager (Sketch > Include Library > Manage Libraries):

| Library | Author | Versi | Keterangan |
|---------|--------|-------|------------|
| `WiFi` | ESP32 core | built-in | WiFi STA mode |
| `WiFiClientSecure` | ESP32 core | built-in | TLS/SSL untuk MQTT |
| `PubSubClient` | Nick O'Leary | ≥2.8 | MQTT client |
| `ArduinoJson` | Benoit Blanchon | ≥7.0 | JSON parsing |
| `ESP8266Audio` | Earle Philhower | ≥1.9 | MP3 playback via I2S |
| `SPIFFS` | ESP32 core | built-in | Flash filesystem |
| `mbedtls/aes.h` | ESP-IDF | built-in | AES-128-CBC decrypt |
| `mbedtls/base64.h` | ESP-IDF | built-in | Base64 decode |

### Cara Install via Arduino Library Manager

1. Buka Arduino IDE
2. Sketch > Include Library > Manage Libraries
3. Cari nama library, klik Install

### Cara Install via Arduino CLI

```bash
arduino-cli lib install "PubSubClient"
arduino-cli lib install "ArduinoJson"
arduino-cli lib install "ESP8266Audio"
```

---

## Upload SPIFFS (File Audio)

File MP3 alarm harus di-upload ke partisi SPIFFS flash ESP32 terpisah dari firmware sketch.

### Persiapan

1. Pastikan file `apd_alert.mp3` ada di folder `alarm_apd/data/`:
   ```
   alarm_apd/
   ├── alarm_apd.ino
   └── data/
       └── apd_alert.mp3     ← file ini
   ```

2. Hapus `PLACEHOLDER.txt` jika masih ada.

### Metode 1: Arduino IDE 1.x (Plugin "ESP32 Filesystem Uploader")

1. Download plugin **ESP32 Filesystem Uploader**: https://github.com/me-no-dev/arduino-esp32fs-plugin/releases
2. Ekstrak ke `<Arduino>/tools/ESP32FS/tool/esp32fs.jar`
3. Restart Arduino IDE
4. Buka sketch `alarm_apd.ino`
5. Tools > **ESP32 Sketch Data Upload**
6. Tunggu hingga selesai (monitor Serial Output)

### Metode 2: Arduino IDE 2.x (Plugin "Sketch Data Upload")

1. Buka Extension Manager (Ctrl+Shift+X)
2. Cari **"ESP32 Sketch Data Upload"** (oleh bxparks) atau "arduino-littlefs-upload"
3. Install, lalu restart IDE
4. Klik kanan pada folder `data/` di File Explorer IDE
5. Pilih "Upload SPIFFS"

### Metode 3: PlatformIO

```bash
# Di root project PlatformIO
pio run -t uploadfs
```

### Metode 4: CLI dengan esptool

```bash
# Step 1: Generate SPIFFS image (butuh mkspiffs)
mkspiffs -c alarm_apd/data -b 4096 -p 256 -s 0x100000 spiffs.bin

# Step 2: Upload ke ESP32 (offset 0x290000 untuk default partition)
python -m esptool --chip esp32 --port COM3 write_flash 0x290000 spiffs.bin
```

> Ganti `COM3` dengan port COM ESP32 kamu (cek di Device Manager Windows).

### Verifikasi Upload

Setelah upload, buka Serial Monitor (115200 baud). Saat boot, firmware akan cetak:
```
[SPIFFS] Mounted OK
[AUDIO] File /apd_alert.mp3 found (size: XXXXX bytes)
```

Jika file tidak ditemukan:
```
[AUDIO] /apd_alert.mp3 not found in SPIFFS, fallback to buzzer
```

---

## Cara Mengganti Audio Alarm

### Generate Audio via Script Python (Direkomendasikan)

Gunakan script `generate_audio.py` yang sudah disertakan untuk re-generate file audio kapan saja:

```bash
# Dari root project
pip install gtts
python alarm_apd/generate_audio.py

# Regenerate meskipun file sudah ada
python alarm_apd/generate_audio.py --force
```

Script ini akan membuat `alarm_apd/data/apd_alert.mp3` dengan konten:
> "Peringatan, gunakan APD lengkap. Pastikan helm, rompi, dan sepatu safety Anda sudah terpasang."

Jika `gtts` tidak terinstall atau tidak ada koneksi internet, script akan tampilkan instruksi alternatif (Google Cloud TTS, ElevenLabs, rekam manual).

### Generate Audio via One-Liner (Alternatif Cepat)

```bash
pip install gtts
python -c "from gtts import gTTS; gTTS('Peringatan, gunakan APD lengkap', lang='id').save('alarm_apd/data/apd_alert.mp3')"
```

### Spesifikasi Audio yang Disarankan

| Parameter | Nilai | Keterangan |
|-----------|-------|------------|
| Format | MP3 | Didukung ESP8266Audio |
| Bitrate | 64 kbps | Cukup jelas, hemat storage |
| Channels | Mono | MAX98357A mono output |
| Sample rate | 44100 Hz atau 22050 Hz | Keduanya didukung |
| Durasi | 5–10 detik | Sesuai partisi SPIFFS ~1MB |
| Konten | "Peringatan, gunakan APD lengkap" | Atau audio K3 sesuai kebutuhan |

---

## Konfigurasi Firmware

Edit konstanta di bagian atas `alarm_apd.ino`:

```cpp
// ─── KONFIGURASI (edit per device) ───────────────────────────
const int   MY_NODE_ID = 1;                    // ID node (unik per ESP32)
const char* WIFI_SSID  = "nama_wifi_kamu";
const char* WIFI_PASS  = "password_wifi";
const char* MQTT_HOST  = "xxxx.s1.eu.hivemq.cloud";
const int   MQTT_PORT  = 8883;
const char* MQTT_USER  = "mqtt_username";
const char* MQTT_PASS  = "mqtt_password";

// 32 hex chars = 16 bytes (harus sama dengan AES_KEY di .env backend)
const char* AES_KEY_HEX = "0123456789abcdef0123456789abcdef";

// Sensor gas
const int   GAS_THRESHOLD = 2200;             // 0–4095, naikkan jika terlalu sensitif
```

### Generate AES Key

```bash
# Python (harus sama dengan backend .env AES_KEY)
python -c "import secrets; print(secrets.token_hex(16))"
# Output contoh: 4f7b9a2c8e1d3f5b7a9c2e4f6b8d0a1c
```

---

## Troubleshooting

### Audio tidak bunyi

| Gejala | Kemungkinan Penyebab | Solusi |
|--------|---------------------|--------|
| Serial: "file not found" | MP3 belum di-upload ke SPIFFS | Upload ulang via Tools > Sketch Data Upload |
| Serial: "SPIFFS mount failed" | Partisi korup | Flash ulang, reset via `esptool erase_flash` |
| Suara serak/distorsi | Volume terlalu tinggi atau impedansi speaker salah | Turunkan gain GAIN pin MAX98357A |
| Tidak ada suara sama sekali | Kabel I2S salah atau MAX98357A tidak power | Cek wiring BCLK/LRC/DIN dan VIN |

### MQTT tidak connect

| Gejala | Kemungkinan Penyebab | Solusi |
|--------|---------------------|--------|
| "TLS handshake failed" | Root CA kadaluarsa atau salah | Update `HIVEMQ_ROOT_CA` di firmware |
| "Connection refused" | Username/password salah | Cek kredensial HiveMQ |
| Timeout tanpa error | WiFi lambat atau port 8883 diblokir | Tes di jaringan lain |

### Sensor gas selalu alert

| Gejala | Kemungkinan Penyebab | Solusi |
|--------|---------------------|--------|
| ADC terus > threshold | MQ-135 belum warm-up | Tunggu ~2 menit setelah power-on |
| Nilai ADC selalu 4095 | VCC sensor terlalu tinggi atau short | Pastikan AOUT terhubung ke GPIO34 |
| Noise besar | Ground tidak solid | Tambah kapasitor 100nF antara AOUT dan GND |

### LED tidak sesuai state

| State | LED Built-in (GPIO2) |
|-------|---------------------|
| WiFi connecting | Kedip cepat (50ms on/off) |
| MQTT connecting | Kedip sedang (300ms on/off) |
| Standby / ready | Solid ON |
| Alarm aktif | Kedip ganda cepat |

---

## Referensi

- Requirements: 9.1 (SPIFFS audio), 9.2 (upload tools), 9.3 (nama file), 9.4 (fallback buzzer), 9.5 (dokumentasi)
- Design: §4.1 (Pin Map), §4.4 (Library Dependencies), §4.5 (SPIFFS Audio)
- ESP8266Audio library: https://github.com/earlephilhower/ESP8266Audio
- PubSubClient: https://github.com/knolleary/pubsubclient
- ArduinoJson: https://arduinojson.org/
