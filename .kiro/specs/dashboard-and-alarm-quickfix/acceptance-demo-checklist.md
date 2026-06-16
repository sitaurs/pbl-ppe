# End-to-End Acceptance Demo Checklist

> Spec: `dashboard-and-alarm-quickfix` — Task 7 final checkpoint
>
> Source of truth: `bugfix.md` → section **End-to-End Acceptance Demo** (steps 1–7)
> dan klausa Expected Behavior 2.1–2.8.
>
> Empat bug yang divalidasi:
> - **Bug 1** — CSRF token pada NodeTable test-connection (klausa 2.1, 2.2)
> - **Bug 2** — `picName` / `picPhone` bisa di-input & di-edit (klausa 2.3–2.5)
> - **Bug 3** — Gas alarm 4 putaran (klausa 2.6)
> - **Bug 4** — Quiet window firmware + `COOLDOWN_SECONDS` default backend (klausa 2.7, 2.8)

## Status legend

- ⏳ Pending hardware — demo step belum bisa dijalankan karena membutuhkan
  perangkat fisik (ESP32 + MQ-135 + speaker), live MQTT broker, atau GoWA.
- ✅ Passed — demo step sudah dijalankan dan hasilnya match Expected Behavior.
- ❌ Failed — demo step dijalankan tapi hasilnya tidak match; isi catatan + buka
  bug terpisah.

## Prasyarat lingkungan

Sebelum mengeksekusi demo step manual, pastikan:

- [ ] Dashboard Next.js berjalan (`pnpm dev` di `web-dashboard/`) dengan database
      `data/db.json` ter-load dan user demo sudah login.
- [ ] Backend Python `ServiceAPDBackend.py` berjalan, terhubung ke broker MQTT
      yang sama dengan firmware ESP32.
- [ ] ESP32 sudah di-flash firmware dari `alarm_apd/alarm_apd.ino` versi
      post-fix (commit setelah Task 5.1 + 6.2), MQ-135 dan speaker terpasang,
      Serial monitor terbuka di 115200 baud.
- [ ] GoWA WhatsApp gateway aktif dan dapat dijangkau backend.
- [ ] `python trigger_alarm.py` dapat berjalan (script publish MQTT helper).

---

## Acceptance Steps

### Step 1 — Wizard mengisi `picName` & `picPhone`, DB menyimpan format `62…`

| Field | Detail |
|-------|--------|
| **Demo action** | Buat satu node baru lewat wizard (`/nodes/wizard`). Isi `picName = "Operator Demo"`, `picPhone = "081358959349"`. Selesaikan wizard sampai submit. |
| **Expected outcome** | Setelah submit, row baru di `web-dashboard/data/db.json` (atau DB aktif) menyimpan `picName = "Operator Demo"` dan `picPhone = "6281358959349"` (hasil normalisasi UI). |
| **Validates Bug** | **Bug 2** — klausa 2.3, 2.4. |
| **Static-source confirmation done** | ✅ Vitest `composition-nullification.property.test.ts` + `phone.property.test.ts` PASSED di Task 4.4 — builder + `normalizePhone` regex/idempotence terbukti. ✅ Vitest `step-sector-info.test.ts` + `step-review.test.ts` PASSED di Task 4.5 — input PIC ter-render dan ter-validate. |
| **Manual status** | ⏳ Pending hardware (butuh dashboard + DB live) |
| **Notes** | |

### Step 2 — `/nodes` Test Camera & Test MQTT (CSRF token ikut)

| Field | Detail |
|-------|--------|
| **Demo action** | Buka `/nodes`, expand tree sampai node baru dari Step 1. Klik tombol **Test Camera**, lalu klik **Test MQTT**. |
| **Expected outcome** | Kedua request `POST /api/nodes/test-connection` mengembalikan HTTP 200 (bukan 403 `csrf_token_invalid`). UI menampilkan hasil koneksi (`status: 'ok'` atau `'failed'` dengan pesan), spinner berhenti. Network tab di DevTools menunjukkan header `X-CSRF-Token` non-empty pada kedua request. |
| **Validates Bug** | **Bug 1** — klausa 2.1, 2.2. |
| **Static-source confirmation done** | ✅ Vitest `NodeTable.test.tsx` PASSED di Task 3.2 — request POST mengandung `X-CSRF-Token`. ✅ Preservation test 2a PASSED di Task 3.3 — GET path `/api/nodes/{id}/status` tetap tanpa header CSRF. |
| **Manual status** | ⏳ Pending hardware (butuh dashboard live + middleware CSRF aktif) |
| **Notes** | |

### Step 3 — Trigger gas alarm, speaker berbunyi 4 putaran

| Field | Detail |
|-------|--------|
| **Demo action** | Jalankan `python trigger_alarm.py --gas` (atau semprot gas pemantik dekat MQ-135 sampai ADC > `GAS_THRESHOLD`). Pantau Serial monitor ESP32. |
| **Expected outcome** | Speaker mengeluarkan suara gas alarm sebanyak **4 putaran**. Serial log menampilkan `[audio] putaran 1/4`, `... 2/4`, `... 3/4`, `... 4/4 selesai` (atau format setara). Setelah selesai, state kembali ke `STANDBY`. |
| **Validates Bug** | **Bug 3** — klausa 2.6. |
| **Static-source confirmation done** | ✅ Static check di Task 5.2: grep `alarm_apd.ino` tidak lagi mengandung `alarmPlayCount = ALARM_PLAY_MAX` di dalam `handleGasAlert`; konstanta `GAS_ALARM_PLAY_MAX = 4` dan flag `currentAlarmIsGas` ditambahkan; `handleAudioLoop` memakai `playMax` dinamis. |
| **Manual status** | ⏳ Pending hardware (butuh ESP32 + MQ-135 + speaker fisik) |
| **Notes** | |

### Step 4 — Quiet window: APD `apd_violation` dalam 10 detik post-alarm di-skip

| Field | Detail |
|-------|--------|
| **Demo action** | Tepat setelah gas alarm (Step 3) selesai, dalam jendela 10 detik berikutnya, jalankan `python trigger_alarm.py` (publish `apd_violation`). Pantau Serial monitor. |
| **Expected outcome** | Speaker ESP32 **tidak menyala**; Serial log menampilkan `[alarm] skip — quiet window aktif` (atau pesan setara). State firmware tetap di `STANDBY`. |
| **Validates Bug** | **Bug 4 (firmware)** — klausa 2.7. |
| **Static-source confirmation done** | ✅ Static logic equivalence di Task 6.3: helper murni `shouldStartAlarm(now, lastEndedAt, quietMs)` ditambahkan di `alarm_apd.ino`; `mqttCallback` event `apd_violation` / `apd_test` di-gate dengan `shouldStartAlarm(...)`; `lastAlarmEndedAt = millis()` di-set di `stopAlarm()` dan path natural-end `handleAudioLoop()`. PBT C++ `test_should_start_alarm.cpp` ditulis (di `alarm_apd/test/test_should_start_alarm/`) sebagai spesifikasi formal — verifikasi runtime menunggu environment PlatformIO native. |
| **Manual status** | ⏳ Pending hardware (butuh ESP32 + Serial monitor) |
| **Notes** | |

### Step 5 — Out-of-window: APD `apd_violation` setelah >10 detik = 4 putaran APD

| Field | Detail |
|-------|--------|
| **Demo action** | Tunggu **>10 detik** setelah alarm sebelumnya (Step 3 atau Step 4 trigger) selesai — lalu jalankan `python trigger_alarm.py`. Pantau Serial dan dengar speaker. |
| **Expected outcome** | Speaker memutar audio APD **4 putaran** (`ALARM_PLAY_MAX = 4`). Serial log menampilkan `[audio] putaran 1/4` … `4/4 selesai`. State kembali ke `STANDBY`. |
| **Validates Bug** | Preservation **Bug 4** — klausa 3.5. |
| **Static-source confirmation done** | ✅ Static review di Task 6.4: `shouldStartAlarm` mengembalikan `true` saat `(now - lastEndedAt) >= quietMs` (mempertahankan path APD normal). Konstanta `ALARM_PLAY_MAX = 4` tidak diubah; `startAlarm()` tetap men-set `alarmPlayCount = 1` dan `currentAlarmIsGas = false`. |
| **Manual status** | ⏳ Pending hardware |
| **Notes** | |

### Step 6 — Backend `COOLDOWN_SECONDS` default = 20, override dihormati

| Field | Detail |
|-------|--------|
| **Demo action** | (a) Restart backend tanpa env `COOLDOWN_SECONDS` di `.env` — periksa nilai `config.COOLDOWN_SECONDS` (mis. via log startup atau `python -c "from config import config; print(config.COOLDOWN_SECONDS)"`). (b) Set `COOLDOWN_SECONDS=5` di `.env`, restart backend, periksa lagi. |
| **Expected outcome** | (a) `COOLDOWN_SECONDS == 20`. (b) `COOLDOWN_SECONDS == 5`. |
| **Validates Bug** | **Bug 4 (backend)** — klausa 2.8 + preservation klausa 3.9. |
| **Static-source confirmation done** | ✅ **Pytest verified — no hardware required.** `tests/test_config.py` PASSED 5/5 di Task 6.3 + 6.4: default `20` saat env unset (klausa 2.8), env override (`1`, `5`, `10`, `60`) dihormati (klausa 3.9). `.env.example` ditambah entri `COOLDOWN_SECONDS=20` dengan komentar peringatan. |
| **Manual status** | ✅ Static-confirmed via pytest. Manual restart-and-print masih opsional sebagai sanity check di lingkungan production. |
| **Notes** | Nilai di `.env` repo saat ini perlu dicek terpisah jika user menjalankan backend live; pytest di atas memvalidasi loader `config.py`, bukan isi `.env` aktif. |

### Step 7 — Real APD violation → GoWA kirim WhatsApp ke `6281358959349`

| Field | Detail |
|-------|--------|
| **Demo action** | Trigger pelanggaran APD nyata pada node demo (mis. operator masuk frame tanpa rompi, atau jalankan `trigger_alarm.py` yang men-publish event `apd_violation` ke topik node tersebut dengan `picPhone` dari Step 1 sudah tersimpan). Pantau log backend `ServiceAPDBackend.py` dan dashboard GoWA. |
| **Expected outcome** | Backend log menampilkan `send_whatsapp_alert` dipanggil dengan `pic_phone = "6281358959349"`. GoWA gateway menerima request kirim WA dan WhatsApp masuk ke nomor tersebut. Tidak ada log `"Tidak ada nomor WA terdaftar."`. |
| **Validates Bug** | **Bug 2 end-to-end** — klausa 2.5. |
| **Static-source confirmation done** | ✅ Static review: `ServiceAPDBackend.py` tidak diubah (sudah membaca `node.get("picPhone")` dengan benar). Setelah Bug 2 fix, `picPhone` non-kosong format `62…` sehingga branch `if pic_phone` evaluate ke `True`. Test composition di Task 4.4 mengkonfirmasi builder menghasilkan `picPhone` match `/^62[0-9]{8,14}$/`. |
| **Manual status** | ⏳ Pending hardware (butuh detection pipeline + GoWA + WhatsApp) |
| **Notes** | |

---

## Cross-cutting verification yang sudah otomatis (referensi cepat)

Otomatis = sudah dieksekusi di environment ini, tidak butuh hardware:

- ✅ **Vitest suite** (`web-dashboard/`): 35 test files, 247 tests PASSED (Task 4.3
  hasil + diulang di Task 7 final run).
- ✅ **Pytest backend** (`tests/test_config.py`): 5 tests PASSED (default 20 +
  4 parameter override values 1/5/10/60).
- ⚠️ **PBT C++ `shouldStartAlarm`**: `alarm_apd/test/test_should_start_alarm/test_should_start_alarm.cpp`
  ditulis (Task 1d + 6.3) tetapi **tidak runnable di environment ini** —
  `platformio.ini` hanya berisi `[env:esp32dev]`, tidak ada `[env:native]`
  yang dibutuhkan untuk menjalankan Unity test di host. Verifikasi dilakukan
  via static logic equivalence + review di Task 6.3. Saat user siap, bisa
  ditambahkan `[env:native]` (PlatformIO platform `native`, framework Unity)
  dan dijalankan dengan `pio test -e native`.

## Cara mengisi checklist ini

1. Saat hardware tersedia, eksekusi step 1–7 di atas berurutan (urutan penting:
   Step 4 dan 5 bergantung pada Step 3 yang baru saja selesai).
2. Update kolom **Manual status** dari ⏳ menjadi ✅ atau ❌.
3. Bila ❌, isi **Notes** dengan: log Serial / network response / log backend
   yang relevan, plus komit hash firmware/dashboard yang diuji.
4. Setelah semua step ✅, tutup spec `dashboard-and-alarm-quickfix`.
