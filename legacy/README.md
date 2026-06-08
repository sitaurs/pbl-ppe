# Legacy — Iterasi Sebelumnya

Folder ini berisi file-file dari iterasi pengembangan sebelumnya yang sudah **tidak digunakan secara aktif**. Disimpan di sini untuk keperluan referensi dan dokumentasi akademik.

---

## File yang Terdapat di Sini

### `ServiceAES128.py`

Service deteksi orang dari iterasi pertama. Menggunakan RTSP stream dan AES-128-CBC dengan **static key dan IV yang di-hardcode** langsung di source code. Tidak memiliki random IV per-pesan.

Digantikan oleh: `ServiceAPDBackend.py` di root proyek.

### `ServiceAES128FullBackend.py`

Iterasi kedua, menambahkan WebSocket proxy untuk streaming frame ke frontend browser. Masih menggunakan **static AES IV** (`b"16byteiv12345678"`) dan kredensial MQTT yang di-hardcode.

Digantikan oleh: `ServiceAPDBackend.py` di root proyek.

### `esp32-alarm-v1/esp32_alarm.ino`

Iterasi sebelum production firmware. Firmware ESP32 versi awal dengan fitur:
- Subscribe ke topik MQTT global `APD_Violation` (bukan per-node)
- Audio dari **HTTP stream** (`AudioFileSourceHTTPStream`) bukan SPIFFS lokal — bergantung koneksi internet saat alarm
- Pakai `espClient.setInsecure()` — tanpa verifikasi sertifikat TLS
- Tidak ada enkripsi AES: payload diterima plain-text
- Hardcoded WiFi/MQTT credentials langsung di source code

Digantikan oleh: `alarm_apd/alarm_apd.ino` di root proyek.

### `esp32-alarm-v1/jokowi.mp3`

File audio yang digunakan versi lama, diambil via HTTP stream dari server eksternal. Digantikan oleh `alarm_apd/data/apd_alert.mp3` yang disimpan di SPIFFS internal ESP32 untuk mode offline.

---

## Mengapa Dipindahkan?

File-file ini memiliki masalah keamanan yang sudah diperbaiki di versi production:

1. **Hardcoded credentials** — MQTT username/password dan AES key/IV langsung di kode sumber.
2. **Static IV** — IV yang sama digunakan untuk setiap pesan enkripsi, melemahkan kerahasiaan AES-CBC.
3. **Topik MQTT global** — Semua pesan dikirim ke topik `Person` / `APD_Violation` tanpa per-node routing.
4. **Tidak ada enkripsi di ESP32** — Firmware lama menerima payload plain-text tanpa AES decrypt.
5. **TLS tanpa verifikasi** — Pakai `setInsecure()`, sertifikat broker tidak diverifikasi.
6. **Audio via HTTP** — Bergantung server eksternal, tidak bisa dipakai offline.

---

## Pemetaan Iterasi

| File | Iterasi | Status |
|------|---------|--------|
| `ServiceAES128.py` | v1 — Deteksi orang via RTSP | ❌ Tidak dipakai |
| `ServiceAES128FullBackend.py` | v2 — Tambah WebSocket proxy | ❌ Tidak dipakai |
| `ServiceAPDBackend.py` (root) | v3 — Production: deteksi APD + random IV + per-node MQTT | ✅ Aktif |
| `esp32-alarm-v1/esp32_alarm.ino` | v1 — Alarm ESP32, audio HTTP stream, topik global | ❌ Tidak dipakai |
| `alarm_apd/alarm_apd.ino` (root) | v2 — Production: AES decrypt, SPIFFS audio, per-node, TLS proper | ✅ Aktif |

---

## Referensi

- Requirement 10.1 — *File `ServiceAES128.py` dan `ServiceAES128FullBackend.py` SHALL dipindah ke `legacy/` atau dihapus.*
- Requirement 10.4 — *`esp32-alarm/` (versi lama) SHALL dipindah ke `legacy/esp32-alarm-v1/` setelah `alarm_apd/alarm_apd.ino` siap.*
- Lihat `ARSITEKTUR.md` untuk penjelasan arsitektur sistem versi production.
