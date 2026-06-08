# TEST CHECKLIST — alarm_apd Firmware (Standalone / Tanpa MQTT)

> **Task 4.13** — Verifikasi firmware ESP32 berjalan benar secara standalone.
> References: Requirements 1.6, 1.7, 1.8, 2.5

---

## BAGIAN 0 — Pre-Flash Requirements

### 0.1 Hardware yang Dibutuhkan

| Komponen | Keterangan |
|----------|-----------|
| ESP32 Dev Module | Minimal 4MB flash (ESP32-WROOM-32 / ESP32-DevKitC) |
| MAX98357A I2S Amplifier | Modul amplifier mono, 3W |
| Speaker 3W 4Ω | Disambungkan ke output MAX98357A |
| LED Merah (+ resistor 220Ω) | LED gas alert, GPIO13 |
| Piezo Buzzer | GPIO27 |
| Sensor MQ-135 | Output analog → GPIO34 |
| Kabel Micro-USB | Untuk flash + serial monitor |

### 0.2 Wiring Diagram

```
ESP32                  MAX98357A (I2S Amp)
GPIO26 (BCLK)  ──────► BCLK
GPIO25 (LRC)   ──────► LRC / WS
GPIO22 (DOUT)  ──────► DIN
3.3V           ──────► VDD
GND            ──────► GND
                        OUT+ / OUT- ──► Speaker 3W 4Ω

ESP32                  Peripheral
GPIO13         ──[220Ω]──► LED Merah (+) ──► GND
GPIO27         ──────► Buzzer (+) ──► GND
GPIO34         ──────► MQ-135 AOUT
3.3V           ──────► MQ-135 VCC
GND            ──────► MQ-135 GND
GPIO0          ──────► Tombol BOOT (sudah built-in di Dev Module)
GPIO2          ──────► LED Built-in (sudah onboard)
```

### 0.3 Library yang Harus Terinstall (Arduino IDE Library Manager)

| Library | Versi Minimal | Author |
|---------|--------------|--------|
| PubSubClient | 2.8.0 | Nick O'Leary |
| ArduinoJson | 7.x | Benoit Blanchon |
| ESP8266Audio | latest | Earle Philhower |

> **Library built-in (tidak perlu install):**
> - `WiFi`, `WiFiClientSecure`, `SPIFFS` — ESP32 Arduino Core
> - `mbedtls/aes.h`, `mbedtls/base64.h` — ESP-IDF (sudah bundled)

### 0.4 Board Settings di Arduino IDE

```
Board         : ESP32 Dev Module
Upload Speed  : 921600
CPU Frequency : 240MHz (WiFi/BT)
Flash Frequency: 80MHz
Flash Mode    : QIO
Flash Size    : 4MB (32Mb)
Partition Scheme : Default 4MB with spiffs   ← WAJIB
PSRAM         : Disabled
```

> ⚠️ **Partition Scheme HARUS "Default 4MB with spiffs"** — partisi lain tidak
> mengalokasikan ruang untuk SPIFFS sehingga upload file audio gagal.

### 0.5 Edit Konfigurasi Sebelum Flash

Buka `alarm_apd.ino`, edit konstanta di bagian atas file:

```cpp
const int   MY_NODE_ID  = 1;               // Node ID unik per perangkat
const char* WIFI_SSID   = "your_wifi_ssid"; // ← ganti dengan SSID WiFi
const char* WIFI_PASS   = "your_wifi_password"; // ← ganti dengan password
const char* MQTT_HOST   = "xxxxxxxx.s1.eu.hivemq.cloud"; // ← HiveMQ hostname
const int   MQTT_PORT   = 8883;
const char* MQTT_USER   = "your_mqtt_username"; // ← username MQTT
const char* MQTT_PASS   = "your_mqtt_password"; // ← password MQTT

// AES key: harus sama dengan nilai AES_KEY di file .env Python
const char* AES_KEY_HEX = "0123456789abcdef0123456789abcdef"; // ← ganti!
```

### 0.6 Upload File Audio ke SPIFFS

**Langkah:**
1. Pastikan file `alarm_apd/data/apd_alert.mp3` ada (buat/copy file MP3)
2. Di Arduino IDE: klik menu **Tools → ESP32 Sketch Data Upload**
3. Tunggu proses upload selesai — Serial output menampilkan progress

> Jika menu tidak muncul: install plugin **ESP32 Arduino LittleFS / SPIFFS Data Upload**
> dari https://github.com/lorol/arduino-esp32fs-plugin

**Verifikasi upload berhasil:**
```
Serial output saat boot:
[spiffs] OK
```
Jika gagal:
```
[spiffs] WARN: SPIFFS mount gagal — fallback ke buzzer.
```

---

## BAGIAN 1 — Flash & Buka Serial Monitor

### Langkah Flash

- [ ] 1. Sambungkan ESP32 ke komputer via USB
- [ ] 2. Pilih COM port yang benar di Arduino IDE
- [ ] 3. Tekan tombol Upload (Ctrl+U)
- [ ] 4. Tunggu "Done uploading"
- [ ] 5. Buka Serial Monitor: **Tools → Serial Monitor** atau Ctrl+Shift+M
- [ ] 6. Set baud rate ke **115200**
- [ ] 7. Tekan tombol **EN/RST** di ESP32 untuk restart

---

## BAGIAN 2 — Verifikasi WiFi Connect

### Checklist

- [ ] Serial Monitor menampilkan proses connecting:
  ```
  [boot] alarm_apd firmware starting...
  [crypto] AES key loaded.
  [spiffs] OK
  [config] node_id=1  alarm_topic=apd/alarm/1
  [audio] init I2S output...
  [audio] I2S OK. pins: BCLK=26 LRC=25 DOUT=22 gain=0.45
  [wifi] connecting to SSID: <nama_ssid>
  ....................................
  ```
- [ ] LED built-in (GPIO2) **berkedip sangat cepat (~10Hz / 50ms)** selama proses
- [ ] Serial menampilkan koneksi berhasil:
  ```
  [wifi] connected. IP: 192.168.x.x  RSSI: -xx dBm
  ```
- [ ] IP address tercantum (bukan 0.0.0.0)

**Expected Serial output WiFi sukses:**
```
[wifi] connecting to SSID: MyWiFi
....................
[wifi] connected. IP: 192.168.1.42  RSSI: -65 dBm
```

**Troubleshooting WiFi:**
| Gejala | Kemungkinan Penyebab | Solusi |
|--------|---------------------|--------|
| Titik-titik terus, tidak connect | SSID/password salah | Periksa konstanta `WIFI_SSID` dan `WIFI_PASS` |
| IP: 0.0.0.0 | DHCP belum assign | Tunggu 5-10 detik, atau cek router |
| LED tidak blink cepat | GPIO2 terbalik polarity | Normal di beberapa board (active-low) |
| "WiFi disconnected" berulang | Sinyal lemah | Dekatkan ESP32 ke router |

---

## BAGIAN 3 — Verifikasi NTP Sync

### Checklist

- [ ] Serial menampilkan proses NTP sync setelah WiFi connect:
  ```
  [ntp] syncing.....
  ```
- [ ] Sync berhasil:
  ```
  [ntp] syncing...... OK
  ```

**Expected Serial output NTP sukses:**
```
[ntp] syncing...... OK
```

**Expected Serial output NTP timeout (peringatan, non-fatal):**
```
[ntp] syncing.............................. WARN: timeout
```
> NTP timeout bukan error fatal — firmware tetap berjalan, tapi fitur
> **timestamp replay protection** akan menolak semua pesan MQTT.
> Pastikan NTP sync berhasil untuk pengujian MQTT penuh.

**Troubleshooting NTP:**
| Gejala | Kemungkinan Penyebab | Solusi |
|--------|---------------------|--------|
| `WARN: timeout` | DNS tidak resolve / firewall | Coba ganti NTP ke `time.google.com` di kode |
| Sync OK tapi timestamp salah | Timezone offset salah | Periksa `configTime(7 * 3600, ...)` di `setup()` |

---

## BAGIAN 4 — Verifikasi MQTT TLS Connect

### Checklist

- [ ] Serial menampilkan proses MQTT connect:
  ```
  [mqtt] connecting to xxxxx.hivemq.cloud:8883 as 'apd-node-1-xxxxxxxxxxxx'...
  ```
- [ ] Koneksi TLS berhasil (menggunakan `setCACert`, BUKAN `setInsecure`):
  ```
  [mqtt] connected.
  ```
- [ ] Subscribe ke topik alarm node berhasil:
  ```
  [mqtt] subscribe 'apd/alarm/1' -> OK
  ```
- [ ] Subscribe ke topik kontrol global berhasil:
  ```
  [mqtt] subscribe 'apd/control' -> OK
  ```
- [ ] State STANDBY tercapai:
  ```
  [boot] setup selesai. sistem standby.
  ```
- [ ] LED built-in **menyala solid** (tidak berkedip) = state STANDBY

**Expected Serial output MQTT sukses (lengkap):**
```
[mqtt] connecting to abc123.s1.eu.hivemq.cloud:8883 as 'apd-node-1-a4cf123456ab'...
[mqtt] connected.
[mqtt] subscribe 'apd/alarm/1' -> OK
[mqtt] subscribe 'apd/control' -> OK
[boot] setup selesai. sistem standby.
```

**Troubleshooting MQTT:**
| Gejala | Kemungkinan Penyebab | Solusi |
|--------|---------------------|--------|
| `state=-2 (CONN_FAILED / TLS cert error?)` | Root CA tidak cocok / expired | Verifikasi `HIVEMQ_ROOT_CA` adalah ISRG Root X1 terbaru |
| `state=4 (BAD_CREDENTIALS)` | Username/password salah | Periksa `MQTT_USER` / `MQTT_PASS` dan HiveMQ dashboard |
| `state=-4 (TIMEOUT)` | DNS gagal resolve | Periksa MQTT_HOST, coba ping dari laptop |
| `subscribe ... -> FAIL` | ACL di broker terlalu ketat | Periksa topic permission di HiveMQ Cloud Access Management |
| Retry loop tanpa connect | Backoff aktif | Normal — tunggu, atau reset ESP32 |

> **Verifikasi TLS:** Pastikan log menampilkan `connected.` setelah
> `setCACert()` (bukan `setInsecure()`). Ini membuktikan sertifikat HiveMQ
> tervalidasi dengan root CA ISRG Root X1.

---

## BAGIAN 5 — Verifikasi LED State Machine

### Checklist LED Sesuai Requirements 1.8

- [ ] **WiFi Connecting** → LED built-in kedip **sangat cepat** (~50ms on/off, ~10Hz)
- [ ] **MQTT Connecting** → LED built-in kedip **lambat** (~300ms on/off, ~1.67Hz)
- [ ] **Standby** → LED built-in **solid ON** (tidak berkedip)
- [ ] **Alarm Active** → LED built-in **double-blink** pattern:
  - Nyala 100ms → mati 100ms → nyala 100ms → mati 300ms → ulangi (total 600ms/siklus)

---

## BAGIAN 6 — Test Tombol BOOT (Req 1.7)

> Tombol BOOT = GPIO0, sudah built-in di semua ESP32 Dev Module.
> Fungsi: trigger alarm test lokal tanpa perlu pesan MQTT.

### Langkah

- [ ] 1. Pastikan sistem dalam state **STANDBY** (LED solid ON, serial tidak aktif)
- [ ] 2. Tekan dan **tahan tombol BOOT 100ms**, lalu lepas
- [ ] 3. Amati LED dan dengarkan audio

### Expected Behavior

- [ ] Serial menampilkan:
  ```
  [btn] BOOT ditekan — trigger alarm test lokal.
  [alarm] startAlarm() dipanggil.
  [alarm] file ditemukan: /apd_alert.mp3 — memulai playback MP3
  [alarm] MP3 mulai diputar (putaran 1/4)
  ```
- [ ] LED built-in beralih ke **double-blink pattern** (= ALARM_ACTIVE)
- [ ] Audio alarm berbunyi dari speaker (file `apd_alert.mp3` dari SPIFFS)
- [ ] Audio diputar sebanyak **4 kali** (ALARM_PLAY_MAX = 4):
  ```
  [audio] putaran 1/4 selesai.
  [audio] memulai putaran 2/4...
  [audio] putaran 2/4 selesai.
  [audio] memulai putaran 3/4...
  [audio] putaran 3/4 selesai.
  [audio] memulai putaran 4/4...
  [audio] putaran 4/4 selesai.
  [audio] alarm selesai diputar 4 kali.
  ```
- [ ] Setelah selesai, kembali ke **STANDBY**:
  ```
  [alarm] audio dihentikan. sistem kembali ke STANDBY.
  ```
- [ ] LED solid ON kembali

**Fallback jika SPIFFS tidak ada:**
```
[alarm] WARN: /apd_alert.mp3 tidak ditemukan di SPIFFS. Fallback ke buzzer pattern.
[alarm] buzzer fallback selesai, kembali ke STANDBY.
```
- [ ] Buzzer berbunyi 3x beep 200ms jika file audio tidak tersedia

**Troubleshooting BOOT button:**
| Gejala | Kemungkinan Penyebab | Solusi |
|--------|---------------------|--------|
| Tidak ada respons | Debounce belum 100ms | Tekan lebih lama (>100ms) |
| Alarm trigger saat boot | GPIO0 LOW saat startup | Normal — jangan tahan BOOT saat power-on |
| Buzzer berbunyi bukan speaker | File MP3 tidak ada di SPIFFS | Upload ulang via `ESP32 Sketch Data Upload` |
| Audio putus-putus / noise | Underrun buffer I2S | Periksa koneksi BCLK/LRC/DOUT ke MAX98357A |
| Tidak ada suara sama sekali | MAX98357A tidak tersambung | Periksa wiring GPIO26/25/22 dan power amplifier |

---

## BAGIAN 7 — Test Sensor MQ-135 (Req 2.5)

> Sensor MQ-135 perlu **pemanasan ±20 menit** sebelum pembacaan stabil.
> Untuk demo cepat, tiupkan napas atau dekatkan gas ringan (korek api tanpa menyalakan).

### Langkah

- [ ] 1. Pastikan MQ-135 sudah terpasang di GPIO34 dan telah pemanasan
- [ ] 2. Perhatikan Serial Monitor — log sampling gas setiap 2 detik:
  ```
  [gas] raw=xxx  avg=xxx  threshold=2200
  ```
- [ ] 3. Tiupkan napas ke sensor MQ-135, atau dekatkan korek gas (jangan nyalakan)
- [ ] 4. Amati perubahan nilai ADC di Serial

### Expected Behavior saat Gas Terdeteksi (avg > 2200)

- [ ] Serial menampilkan gas alert:
  ```
  [gas] raw=2456  avg=2312  threshold=2200
  [gas] ALERT! avg=2312 > threshold=2200
  ```
- [ ] **LED Merah (GPIO13) menyala** (gas alert indicator)
- [ ] **Buzzer beep 200ms** berbunyi singkat
- [ ] Serial menampilkan log publish telemetri:
  ```
  [gas] publish telemetry: raw=2456 alert=true
  ```
- [ ] Jika MQTT tersambung, Serial menampilkan encrypt + publish berhasil:
  ```
  [mqtt] publish 'apd/telemetry/gas/1' (xxx bytes) -> OK
  ```

### Expected Behavior saat Gas Normal (avg ≤ 2200)

- [ ] LED Merah **mati** (GPIO13 LOW)
- [ ] Tidak ada buzzer
- [ ] Heartbeat reguler setiap 60 detik:
  ```
  [gas] heartbeat: raw=xxx avg=xxx (normal)
  [mqtt] publish 'apd/telemetry/gas/1' (xxx bytes) -> OK
  ```

**Troubleshooting MQ-135:**
| Gejala | Kemungkinan Penyebab | Solusi |
|--------|---------------------|--------|
| Nilai ADC selalu 0 atau 4095 | GPIO34 tidak terhubung / short | Periksa kabel AOUT MQ-135 → GPIO34 |
| Nilai tidak berubah meski ditiup | Sensor belum panas | Tunggu 20 menit pemanasan |
| Alert terus-menerus tanpa gas | Threshold terlalu rendah | Naikkan `GAS_THRESHOLD` dari 2200 ke 2800 |
| LED Merah tidak menyala | GPIO13 tidak tersambung | Periksa wiring LED + resistor ke GPIO13 |
| Buzzer tidak berbunyi | GPIO27 tidak tersambung | Periksa wiring buzzer ke GPIO27 |
| Moving average lambat responnya | Normal — 5 sample × 2s = 10s lag | Kurangi ring buffer ke 3 untuk demo lebih responsif |

---

## BAGIAN 8 — Skenario Test Reconnect (Req 1.9)

> Verifikasi bahwa ESP32 tidak restart sendiri dan tetap retry koneksi.

### Langkah

- [ ] 1. Saat sistem dalam STANDBY, matikan WiFi di router/hotspot
- [ ] 2. Amati LED: harus berubah ke **kedip cepat** (WIFI_CONNECTING)
- [ ] 3. Serial menampilkan:
  ```
  [wifi] disconnected — reconnecting...
  [wifi] connecting to SSID: ...
  ```
- [ ] 4. Nyalakan kembali WiFi
- [ ] 5. Setelah reconnect, MQTT juga reconnect dengan backoff:
  ```
  [wifi] connected. IP: ...
  [mqtt] connecting...
  [mqtt] connected.
  [mqtt] subscribe 'apd/alarm/1' -> OK
  ```
- [ ] 6. Sistem kembali STANDBY, **tidak ada ESP.restart()** di Serial

---

## BAGIAN 9 — Ringkasan Checklist Pass/Fail

| # | Test | Status |
|---|------|--------|
| 0 | Pre-flash requirements lengkap | ☐ PASS / ☐ FAIL |
| 1 | Flash berhasil tanpa error | ☐ PASS / ☐ FAIL |
| 2 | WiFi connect (IP valid, RSSI muncul) | ☐ PASS / ☐ FAIL |
| 3 | NTP sync OK | ☐ PASS / ☐ FAIL |
| 4 | MQTT TLS connect (setCACert, state=CONNECTED) | ☐ PASS / ☐ FAIL |
| 5 | Subscribe `apd/alarm/1` → OK | ☐ PASS / ☐ FAIL |
| 6 | Subscribe `apd/control` → OK | ☐ PASS / ☐ FAIL |
| 7 | LED state machine benar (4 state) | ☐ PASS / ☐ FAIL |
| 8 | BOOT button → audio bunyi 4x | ☐ PASS / ☐ FAIL |
| 9 | MQ-135 → LED merah + buzzer beep + log telemetri | ☐ PASS / ☐ FAIL |
| 10 | Reconnect tanpa restart perangkat | ☐ PASS / ☐ FAIL |

---

## BAGIAN 10 — Catatan Sintaks & Kompilasi

### Verifikasi Sintaks alarm_apd.ino

File `alarm_apd.ino` telah diverifikasi memiliki implementasi lengkap untuk
semua fungsi yang dideklarasikan di forward declarations:

| Fungsi | Baris | Status |
|--------|-------|--------|
| `connectWiFi()` | ~282 | ✅ Implemented |
| `connectMQTT()` | ~313 | ✅ Implemented |
| `mqttCallback()` | ~382 | ✅ Implemented |
| `ensureConnected()` | ~439 | ✅ Implemented |
| `aesDecrypt()` | ~520 | ✅ Implemented |
| `decryptAndParse()` | ~625 | ✅ Implemented |
| `isTimestampFresh()` | ~1055 | ✅ Implemented |
| `setupAudio()` | ~775 | ✅ Implemented |
| `startAlarm()` | ~817 | ✅ Implemented |
| `stopAlarm()` | ~901 | ✅ Implemented |
| `handleAudioLoop()` | ~958 | ✅ Implemented |
| `updateLED()` | ~1199 | ✅ Implemented |
| `checkBootButton()` | ~1330 | ✅ Implemented |
| `handleGasAlert()` | ~1389 | ✅ Implemented |
| `calcGasAverage()` | ~1458 | ✅ Implemented |
| `sampleGas()` | ~1504 | ✅ Implemented |
| `encryptAndPublish()` | ~1606 | ✅ Implemented |
| `publishGasTelemetry()` | ~1759 | ✅ Implemented |

**Untuk verify kompilasi di Arduino IDE:**
1. Buka `alarm_apd.ino`
2. Pilih board **ESP32 Dev Module** dengan partition **Default 4MB with spiffs**
3. Tekan **Verify** (Ctrl+R)
4. Expected output: `Sketch uses XXXXX bytes (XX%)... Done compiling.`

> Jika muncul error `'AudioFileSourceSPIFFS' was not declared`: install library
> **ESP8266Audio** via Library Manager.
> Jika muncul error `'StaticJsonDocument' was not declared`: install **ArduinoJson v7**
> via Library Manager.

---

*Checklist ini sesuai dengan Requirements 1.6, 1.7, 1.8, 2.5 dari spec iot-security-completion.*
*Dibuat untuk Task 4.13 — Test firmware standalone tanpa MQTT.*
