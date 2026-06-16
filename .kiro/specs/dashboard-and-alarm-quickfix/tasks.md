# Implementation Plan

## Overview

Spec ini meng-bundle empat bug yang ditemukan saat uji lapangan SafeGuard APD:

1. **Bug 1** — `POST /api/nodes/test-connection` tanpa `X-CSRF-Token` di NodeTable (`/nodes`).
2. **Bug 2** — Wizard tidak punya input untuk `picName` / `picPhone`; builder hardcode `''`.
3. **Bug 3** — Gas alarm hanya berbunyi 1 putaran karena `alarmPlayCount = ALARM_PLAY_MAX` di `handleGasAlert`.
4. **Bug 4** — APD alarm langsung menyala setelah gas alarm selesai (compound: backend `COOLDOWN_SECONDS=2` terlalu agresif + firmware tanpa quiet window).

Tasks dibawah mengikuti metodologi bug condition: Task 1 menulis exploration test (Property 1) yang FAIL pada UNFIXED code untuk mengkonfirmasi bug, Task 2 menulis preservation test (Property 2) yang PASS pada UNFIXED code untuk mengunci perilaku non-buggy, Task 3–6 mengimplementasi fix per bug + verifikasi, Task 7 acceptance & checkpoint end-to-end.

## Tasks

- [x] 1. Tulis bug condition exploration tests (BEFORE implementing fix)
  - **Property 1: Bug Condition** - Empat Bug Condition Bundle (CSRF, PIC, Gas Loop, Post-Alarm Retrigger)
  - **CRITICAL**: Test-test ini MUST FAIL pada kode UNFIXED — kegagalan mengkonfirmasi keempat bug benar-benar ada.
  - **DO NOT** mencoba memperbaiki test atau kode saat test gagal di tahap ini.
  - **GOAL**: Memunculkan counterexample konkret yang membuktikan tiap bug.
  - **Scoped PBT Approach**: Untuk bug deterministik (CSRF, PIC, gas loop), persempit property ke kasus konkret yang gagal. Untuk bug non-deterministik / domain numerik (`shouldStartAlarm`, `normalizePhone`), gunakan generator acak penuh.

  Sub-properti yang harus ditulis (semua dalam satu task ini, sebagai property-based tests):

  - **1a. Bug 1 (CSRF) — exploration test**
    - File: `web-dashboard/src/components/nodes/__tests__/NodeTable.test.tsx` (baru atau extend)
    - Encoding `isBugConditionCsrf` (klausa 1.1, 1.2 di `bugfix.md`): render `<NodeTable>`, klik tombol "Test Camera" / "Test MQTT", inspect `fetch` mock.
    - Property (scoped): untuk semua `button ∈ {TestCamera, TestMQTT}`, request `POST /api/nodes/test-connection` SHALL menyertakan header `X-CSRF-Token` non-empty (mengikuti Property 1 di `design.md`).
    - **EXPECTED OUTCOME pada UNFIXED code**: Test FAILS — request keluar tanpa header `X-CSRF-Token` (atau status response 403) → counterexample mengkonfirmasi Bug 1.

  - **1b. Bug 2 (PIC) — exploration tests**
    - File 1: `web-dashboard/src/lib/__tests__/phone.property.test.ts` (baru) — PBT untuk `normalizePhone` (Property 4 di `design.md`).
    - File 2: `web-dashboard/src/components/wizard/__tests__/composition-nullification.property.test.ts` (extend) — PBT untuk `buildNodeDataFromWizardState` dengan generator `picName` non-empty + `picPhone` valid (Property 3 di `design.md`).
    - Encoding `isBugConditionPic` (klausa 1.3, 1.4): wizard mutation dari source `NodeWizardCreate` / `NodeWizardEdit` di mana user mengisi `picName` dan `picPhone`.
    - Property: `result.picName ≠ ''` AND `result.picPhone` match `/^62[0-9]{8,14}$/`.
    - **EXPECTED OUTCOME pada UNFIXED code**: Test FAILS — `normalizePhone` belum ada (compile / import error) DAN/ATAU `buildNodeDataFromWizardState` selalu mengembalikan `picName: ''`, `picPhone: ''` → counterexample mengkonfirmasi Bug 2.

  - **1c. Bug 3 (Gas loop) — exploration test**
    - File: `alarm_apd/test/test_should_start_alarm/` atau test plan manual hardware (lihat `bugfix.md` "End-to-End Acceptance Demo" step 3).
    - Encoding `isBugConditionGasLoop` (klausa 1.6): `avgAdc > GAS_THRESHOLD AND prevState ≠ ALARM_ACTIVE AND audioBeginOk = true`.
    - Property (Property 6 di `design.md`): jumlah putaran audio yang diputar `== GAS_ALARM_PLAY_MAX` (default `4`).
    - Karena bug ini hardware-bound, tulis spesifikasi observasional: trigger gas via `python trigger_alarm.py --gas`, hitung putaran via Serial log (`"[audio] putaran X/4"`).
    - **EXPECTED OUTCOME pada UNFIXED code**: Hanya 1 putaran terdengar (komentar literal `"Gas alarm cukup 1 putaran"` di `handleGasAlert`) → counterexample mengkonfirmasi Bug 3.

  - **1d. Bug 4 (Post-alarm retrigger + cooldown) — exploration tests**
    - File 1: `alarm_apd/test/test_should_start_alarm/test_should_start_alarm.cpp` (baru, PlatformIO native test atau Unity test) — PBT untuk `shouldStartAlarm` (Property 8, 9 di `design.md`).
    - File 2: `tests/test_config.py` (baru atau extend) — pytest untuk `COOLDOWN_SECONDS` default (Property 10 di `design.md`).
    - Encoding `isBugConditionPostAlarmRetrigger` (klausa 1.7, 1.8): `incomingEvent ∈ {apd_violation, apd_test} AND (now - lastAlarmEndedAt) < quietWindowMs`.
    - Property A (firmware): untuk semua `X` di window, `shouldStartAlarm'(now, lastEnded, quietMs) == false`.
    - Property B (backend): tanpa env `COOLDOWN_SECONDS`, `load_config'().COOLDOWN_SECONDS == 20`.
    - **EXPECTED OUTCOME pada UNFIXED code**:
      - Firmware: `shouldStartAlarm` tidak ada (compile error) → counterexample (helper belum ada).
      - Backend: `load_config().COOLDOWN_SECONDS == 2` (bukan `20`) → counterexample mengkonfirmasi Bug 4 backend.

  - Jalankan keempat sub-test pada UNFIXED code.
  - Dokumentasikan counterexample tiap sub-properti (hardcode `picPhone: ''`, header `X-CSRF-Token` absen, log Serial 1 putaran, default `COOLDOWN_SECONDS=2`).
  - Tandai task selesai ketika semua test ditulis, dijalankan, dan kegagalan terdokumentasi.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

- [x] 2. Tulis preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Empat Preservation Bundle (Non-CSRF GET, Non-PIC Wizard Steps, Gas Threshold Path, `apd_stop` & Out-of-Window APD)
  - **IMPORTANT**: Ikuti observation-first methodology — observasi perilaku UNFIXED code untuk input non-buggy (`¬isBugCondition`) dulu, baru tulis property-based test yang mengunci perilaku tersebut.
  - **GOAL**: Mengunci perilaku non-buggy supaya fix tidak meregresi area di luar empat bug.

  Sub-properti yang harus ditulis (semua dalam satu task ini, sebagian besar sebagai property-based tests):

  - **2a. Bug 1 — Preservation CSRF (klausa 3.1, 3.3)**
    - File: `web-dashboard/src/components/nodes/__tests__/NodeTable.test.tsx` (extend dari 1a).
    - Observasi UNFIXED: `GET /api/nodes/{id}/status` (live monitor MJPEG) di `NodeTable` lewat tanpa header `X-CSRF-Token` dan tetap 200.
    - Property (Property 2 di `design.md`): untuk semua request dengan `method = GET`, perilaku sebelum dan sesudah fix identik (tidak ada header CSRF yang ditambahkan).
    - Property tambahan: tombol Test internal NodeWizard (`useApiFetch`) tetap berfungsi (klausa 3.3).
    - **EXPECTED OUTCOME pada UNFIXED code**: Tests PASS — baseline GET path bekerja.

  - **2b. Bug 2 — Preservation builder (klausa 3.2, 3.4)**
    - File: `web-dashboard/src/components/wizard/__tests__/composition-nullification.property.test.ts` (extend) + `step-sector-info.test.ts`, `step-review.test.ts`.
    - Observasi UNFIXED: untuk `initialData` dengan `picPhone` sudah `62xxxxxxxx`, builder mengembalikan persis nilai itu (saat ini hardcode dari `initialData?.picPhone || ''`, jadi jika `initialData.picPhone === '628…'`, hasilnya juga `'628…'`).
    - Property (Property 5 di `design.md`): untuk node dengan `picPhone` sudah `62…` di `initialData`, builder produksi nilai sama (idempotent re-normalisasi setelah fix).
    - Property tambahan: composition nullification camera/detection/esp32 (klausa 3.2) tetap bekerja persis seperti sekarang.
    - **EXPECTED OUTCOME pada UNFIXED code**: Tests PASS — baseline builder + composition nullification bekerja.
    - Catatan: literal `StepSectorInfoValues` di test fixture lama akan perlu di-update saat fix Bug 2 (dua field baru); update tersebut masuk dalam scope task 4 (implementation), bukan task 2.

  - **2c. Bug 3 — Preservation APD loop (klausa 3.5, 3.7)**
    - File: test plan manual hardware.
    - Observasi UNFIXED: `startAlarm()` dipanggil dari event `apd_violation` memutar 4 putaran audio APD (`ALARM_PLAY_MAX = 4`); MQ-135 di bawah threshold tidak men-trigger audio.
    - Property (Property 7 di `design.md`): untuk input non-buggy (mis. APD path), banyak putaran sama dengan kode lama; gas threshold yang turun di tengah putaran tidak menghentikan putaran yang sedang berjalan.
    - Static check tambahan: grep firmware setelah fix tidak boleh mengandung lagi `alarmPlayCount = ALARM_PLAY_MAX` di `handleGasAlert` (akan diverifikasi setelah implement).
    - **EXPECTED OUTCOME pada UNFIXED code**: APD path 4 putaran (PASS); gas threshold turun di tengah loop tidak meng-stop loop (PASS).

  - **2d. Bug 4 — Preservation `apd_stop`, di luar window, env override (klausa 3.5, 3.6, 3.8, 3.9, 3.10)**
    - File 1: `alarm_apd/test/test_should_start_alarm/test_should_start_alarm.cpp` (extend dari 1d) — PBT untuk komplemen window (Property 9 di `design.md`).
    - File 2: `tests/test_config.py` (extend dari 1d) — pytest untuk env override (Property 11 di `design.md`).
    - Observasi UNFIXED: `apd_stop` selalu memanggil `stopAlarm()` tanpa pengecekan apa pun; `COOLDOWN_SECONDS=5` di `.env` menghasilkan `config.COOLDOWN_SECONDS == 5`.
    - Property A (firmware): `apd_stop` tidak pernah di-gate (klausa 3.6) — tetap memanggil `stopAlarm()`.
    - Property B (firmware): saat `(now - lastEnded) >= quietMs`, `shouldStartAlarm'` mengembalikan `true` (Property 9).
    - Property C (backend): `load_config'(env_with_COOLDOWN_SECONDS=5).COOLDOWN_SECONDS == 5` (klausa 3.9).
    - Property D (backend): node dengan `esp32.enabled == false` tetap di-skip MQTT publish (klausa 3.10).
    - Property E (backend): reading di bawah threshold tidak men-trigger publish meski `COOLDOWN_SECONDS` berubah (klausa 3.8).
    - **EXPECTED OUTCOME pada UNFIXED code**:
      - Firmware tests untuk `shouldStartAlarm` belum bisa dijalankan (helper belum ada) — tulis test sebagai spesifikasi yang akan PASS setelah fix; catat sebagai "deferred preservation" untuk task 6.
      - Backend tests untuk env override + skip path PASS pada UNFIXED code.

  - Jalankan keempat sub-test pada UNFIXED code (untuk path yang bisa dijalankan).
  - Verifikasi semua test yang bisa dijalankan PASS pada UNFIXED code (mengkonfirmasi baseline behavior yang harus dipertahankan).
  - Catat sub-test yang menunggu helper baru (mis. firmware `shouldStartAlarm`) sebagai "verifiable post-fix".
  - Tandai task selesai ketika semua test ditulis, dijalankan (atau dijadwalkan), dan baseline PASS terdokumentasi.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [x] 3. Fix untuk Bug 1 — CSRF token pada NodeTable test-connection

  - [x] 3.1 Implement fix CSRF di `NodeTable.handleTestConnection`
    - Edit `web-dashboard/src/components/nodes/NodeTable.tsx`.
    - Import `useApiFetch` dari `@/hooks/use-csrf-token`.
    - Panggil `const apiFetch = useApiFetch();` di body komponen `NodeTable`.
    - Ganti `fetch('/api/nodes/test-connection', { method: 'POST', headers: {...}, body: ... })` di `handleTestConnection` menjadi `apiFetch('/api/nodes/test-connection', { method: 'POST', body: ... })`.
    - Bungkus `handleTestConnection` dengan `useCallback` dengan dependency `[apiFetch]` agar reference stable.
    - JANGAN ubah `fetch` GET di `NodeTable` (mis. `GET /api/nodes/{id}/status` ~baris 117) — di luar scope dan akan keluar dari `isBugConditionCsrf` (method = POST).
    - _Bug_Condition: `isBugConditionCsrf(X)` di `bugfix.md` — `X.page = '/nodes' AND X.button ∈ {TestCamera, TestMQTT} AND X.method = 'POST' AND X.userAuthenticated = true AND X.csrfHeaderPresent = false`._
    - _Expected_Behavior: Property 1 di `design.md` — `responseAfterFix.status = 200 AND usedCsrfToken = true`._
    - _Preservation: Property 2 di `design.md` — GET path dan tombol Test internal wizard tidak berubah._
    - _Requirements: 2.1, 2.2, 3.1, 3.3_

  - [x] 3.2 Verify exploration test 1a sekarang PASS
    - **Property 1: Expected Behavior** - Bug 1 (CSRF) Fixed
    - **IMPORTANT**: Re-run test yang SAMA dari task 1a — JANGAN tulis test baru.
    - Jalankan `pnpm vitest --run NodeTable.test.tsx` (atau equivalent).
    - **EXPECTED OUTCOME**: Test PASSES — request `POST /api/nodes/test-connection` sekarang menyertakan `X-CSRF-Token`, response 200.
    - _Requirements: 2.1, 2.2_

  - [x] 3.3 Verify preservation test 2a masih PASS
    - **Property 2: Preservation** - Bug 1 GET Path & Wizard Test Buttons Unchanged
    - **IMPORTANT**: Re-run test yang SAMA dari task 2a — JANGAN tulis test baru.
    - Jalankan ulang test preservation di `NodeTable.test.tsx` + manual smoke test live monitor MJPEG (`/monitor/[id]`).
    - **EXPECTED OUTCOME**: Tests PASSES — GET path tidak menambah header CSRF, tombol Test internal wizard tetap berfungsi.
    - _Requirements: 3.1, 3.3_

- [x] 4. Fix untuk Bug 2 — PIC name/phone bisa di-input dan di-edit

  - [x] 4.1 Buat helper murni `normalizePhone` dan `isValidPhone`
    - File baru: `web-dashboard/src/lib/phone.ts`.
    - Implement `normalizePhone(input: string): string` sesuai aturan klausa 2.3:
      - strip non-digit (kecuali `+` awal),
      - prefix `+62` → `62`, prefix `0` → `62`, prefix `62` tetap, lainnya (langsung digit ≥9) prefix `62`,
      - return `''` jika input kosong / hanya non-digit.
    - Implement `isValidPhone(input: string): boolean` — wrapper yang validate hasil `normalizePhone(input)` match `/^62[0-9]{8,14}$/`.
    - Pastikan `normalizePhone` adalah pure function (tidak ada side effect, tidak ada I/O).
    - Pastikan `normalizePhone(normalizePhone(x)) === normalizePhone(x)` (idempoten) — penting untuk Property 4 di `design.md`.
    - _Bug_Condition: `isBugConditionPic(X)` — `X.source ∈ {NodeWizardCreate, NodeWizardEdit} AND X.userIntendsWaAlert = true AND (X.inputPicName IS NULL OR X.inputPicPhone IS NULL)`._
    - _Expected_Behavior: Property 4 di `design.md` — `normalizePhone(s)` match `/^62[0-9]{8,14}$/` dan idempoten._
    - _Preservation: Property 5 di `design.md` — input `62…` tetap dikembalikan apa adanya._
    - _Requirements: 2.3_

  - [x] 4.2 Tambah field `picName` & `picPhone` di `StepSectorInfo`
    - Edit `web-dashboard/src/components/wizard/StepSectorInfo.tsx`.
    - Tambah `picName: string` dan `picPhone: string` ke `StepSectorInfoValues`.
    - Tambah `picName?: string` dan `picPhone?: string` ke `StepSectorInfoErrors`.
    - Update `validateStepSectorInfo`:
      - `picName` wajib non-empty after trim, max 100 char.
      - `picPhone` boleh kosong (opt-out alert WA, klausa 2.4) tetapi jika non-empty harus lolos `isValidPhone(...)` dengan pesan `"Format nomor WhatsApp tidak valid"`.
    - Render dua input baru di JSX:
      - "Nama PIC" (text input, max 100 char).
      - "No WhatsApp PIC" (`inputMode="tel"`, placeholder `081234567890`, helper text `"Otomatis dinormalisasi ke format 62…"`).
      - Jika `picPhone` kosong setelah validate, tampilkan banner peringatan `"Alert WhatsApp tidak akan dikirim untuk node ini"`.
    - `onBlur` field `picPhone` panggil `normalizePhone` lalu `onChange` dengan nilai ternormalisasi.
    - Update test fixture `__tests__/step-sector-info.test.ts` untuk `StepSectorInfoValues` dengan dua field baru.
    - _Bug_Condition: `isBugConditionPic(X)` (lihat 4.1)._
    - _Expected_Behavior: Klausa 2.3, 2.4 di `bugfix.md`._
    - _Preservation: Klausa 3.2 — non-PIC step (Camera/ESP32/Detection/Review) tidak berubah._
    - _Requirements: 2.3, 2.4_

  - [x] 4.3 Update `buildNodeDataFromWizardState` & `createInitialState` di `NodeWizard.tsx`
    - Edit `web-dashboard/src/components/wizard/NodeWizard.tsx`.
    - Di `createInitialState`, isi `picName` dan `picPhone` dari `initialData` (untuk edit) atau string kosong (create):
      ```ts
      const sectorInfo: StepSectorInfoValues = {
        nodeName: initialData?.sektorName || '',
        sektorId: initialData?.sektorId || '',
        picName: initialData?.picName || '',
        picPhone: initialData?.picPhone || '',
      };
      ```
    - Di `buildNodeDataFromWizardState` (~baris 209), ganti dua baris hardcode:
      ```ts
      picName: state.sectorInfo.picName.trim(),
      picPhone: state.sectorInfo.picPhone ? normalizePhone(state.sectorInfo.picPhone) : '',
      ```
    - Update test fixture `__tests__/composition-nullification.property.test.ts`, `__tests__/step-review.test.ts` agar generator membawa `picName` & `picPhone`.
    - _Bug_Condition: `isBugConditionPic(X)`._
    - _Expected_Behavior: Property 3 di `design.md` — `result.picName ≠ ''` AND `result.picPhone` match `/^62[0-9]{8,14}$/`._
    - _Preservation: Property 5 di `design.md` — `picPhone` `62…` di `initialData` tetap idempoten._
    - _Requirements: 2.3, 2.4, 3.2, 3.4_

  - [x] 4.4 Verify exploration tests 1b sekarang PASS
    - **Property 1: Expected Behavior** - Bug 2 (PIC) Fixed
    - **IMPORTANT**: Re-run test yang SAMA dari task 1b — JANGAN tulis test baru.
    - Jalankan `pnpm vitest --run phone.property.test.ts composition-nullification.property.test.ts`.
    - **EXPECTED OUTCOME**: Tests PASSES — `normalizePhone` lulus PBT (regex + idempotence), `buildNodeDataFromWizardState` menghasilkan `picName ≠ ''` dan `picPhone` match `/^62[0-9]{8,14}$/`.
    - _Requirements: 2.3, 2.4_

  - [x] 4.5 Verify preservation test 2b masih PASS
    - **Property 2: Preservation** - Bug 2 Builder Idempotence & Composition Nullification Unchanged
    - **IMPORTANT**: Re-run test yang SAMA dari task 2b — JANGAN tulis test baru.
    - Jalankan ulang composition nullification + step-sector-info + step-review tests.
    - **EXPECTED OUTCOME**: Tests PASSES — composition nullification bekerja, builder idempotent untuk input `62…`, backend Python tetap memanggil `send_whatsapp_alert` saat `picPhone` non-empty (verifikasi manual: acceptance step 7).
    - _Requirements: 3.2, 3.4_

- [x] 5. Fix untuk Bug 3 — Gas alarm 4 putaran (bukan 1)

  - [x] 5.1 Implement fix gas loop di `alarm_apd.ino`
    - Edit `alarm_apd/alarm_apd.ino`.
    - Tambah konstanta global di blok deklarasi alarm (~baris 149–151):
      ```cpp
      static const int ALARM_PLAY_MAX     = 4;  // existing
      static const int GAS_ALARM_PLAY_MAX = 4;  // BARU
      ```
    - Tambah flag global `static bool currentAlarmIsGas = false;`.
    - Di `handleGasAlert(true)` (~baris 1411): ganti `alarmPlayCount = ALARM_PLAY_MAX;` menjadi `alarmPlayCount = 1;` dan set `currentAlarmIsGas = true;`.
    - Di `handleAudioLoop()`: ganti perbandingan menjadi:
      ```cpp
      const int playMax = currentAlarmIsGas ? GAS_ALARM_PLAY_MAX : ALARM_PLAY_MAX;
      if (alarmPlayCount <= playMax) { /* restart putaran berikutnya */ }
      else { /* selesai → stopAlarm() */ }
      ```
    - Update logging agar `"putaran X/Y selesai"` memakai `playMax` dinamis.
    - Di `stopAlarm()`: tambah `currentAlarmIsGas = false;` setelah reset `alarmPlayCount`.
    - Di `startAlarm()` (path APD): tambah `currentAlarmIsGas = false;` defensif sebelum `alarmPlayCount = 1`.
    - JANGAN ubah `checkBootButton()` — di luar scope (developer test path).
    - _Bug_Condition: `isBugConditionGasLoop(X)` — `X.avgAdc > X.threshold AND X.prevState ≠ ALARM_ACTIVE AND X.audioBeginOk = true`._
    - _Expected_Behavior: Property 6 di `design.md` — `loopsPlayed = GAS_ALARM_PLAY_MAX` (default `4`)._
    - _Preservation: Property 7 di `design.md` — APD path `ALARM_PLAY_MAX = 4` tidak berubah; gas threshold turun di tengah loop tidak menghentikan putaran berjalan (klausa 3.7)._
    - _Requirements: 2.6, 3.5, 3.7_

  - [x] 5.2 Verify exploration test 1c sekarang PASS (manual hardware test)
    - **Property 1: Expected Behavior** - Bug 3 (Gas Loop) Fixed
    - **IMPORTANT**: Re-run skenario yang SAMA dari task 1c.
    - Build & flash firmware ke ESP32.
    - Jalankan `python trigger_alarm.py --gas` (atau semprot gas pemantik dekat MQ-135).
    - Hitung putaran audio gas via Serial monitor — log harus menampilkan `"[audio] putaran 1/4"`, `"... 2/4"`, `"... 3/4"`, `"... 4/4 selesai"`.
    - Static check: grep `alarm_apd.ino` setelah fix — tidak boleh mengandung lagi `alarmPlayCount = ALARM_PLAY_MAX` di dalam `handleGasAlert`.
    - **EXPECTED OUTCOME**: 4 putaran audio gas terdengar; log Serial mengkonfirmasi 4/4.
    - _Requirements: 2.6_

  - [x] 5.3 Verify preservation test 2c masih PASS (manual hardware test)
    - **Property 2: Preservation** - APD Loop & Gas-Threshold-Drop-Mid-Loop Unchanged
    - **IMPORTANT**: Re-run skenario yang SAMA dari task 2c.
    - Trigger `apd_violation` (`python trigger_alarm.py`) — verifikasi 4 putaran audio APD seperti sebelumnya.
    - Trigger gas, lalu hentikan sumber gas di tengah putaran ke-2 — verifikasi audio tetap menyelesaikan sampai putaran 4 dan LED_GAS mati saat threshold turun (klausa 3.7).
    - **EXPECTED OUTCOME**: APD tetap 4 putaran; gas tetap selesai 4 putaran walau threshold turun di tengah; LED_GAS mati saat threshold turun.
    - _Requirements: 3.5, 3.7_

- [x] 6. Fix untuk Bug 4 — Quiet window (firmware) + cooldown default (backend)

  - [x] 6.1 Implement backend cooldown default di `config.py` & `.env.example`
    - Edit `config.py`: ubah default literal menjadi `COOLDOWN_SECONDS: int = int(os.getenv("COOLDOWN_SECONDS", "20"))`.
    - Edit `.env.example`: tambah / update entri `COOLDOWN_SECONDS=20` dengan komentar tujuan dan peringatan.
    - JANGAN ubah `ServiceAPDBackend.py` — logika cooldown sudah benar; hanya nilai default yang berubah.
    - _Bug_Condition: `isBugConditionPostAlarmRetrigger` (sisi backend) — backend mem-publish `apd_violation` setiap 2 detik (klausa 1.8)._
    - _Expected_Behavior: Property 10 di `design.md` — `load_config'(env).COOLDOWN_SECONDS = 20` jika unset; `= int(env.COOLDOWN_SECONDS)` jika set._
    - _Preservation: Property 11 di `design.md` + klausa 3.8, 3.9, 3.10 — env override dihormati, reading sub-threshold tidak publish, esp32 disabled tetap di-skip._
    - _Requirements: 2.8, 3.8, 3.9, 3.10_

  - [x] 6.2 Implement firmware quiet window di `alarm_apd.ino`
    - Edit `alarm_apd/alarm_apd.ino`.
    - Tambah konstanta + state global di blok deklarasi (~baris 149–155):
      ```cpp
      static const unsigned long QUIET_WINDOW_MS = 10000;
      static unsigned long lastAlarmEndedAt = 0;
      ```
    - Tambah pure helper `shouldStartAlarm`:
      ```cpp
      bool shouldStartAlarm(unsigned long now,
                            unsigned long lastEndedAt,
                            unsigned long quietMs) {
        if (lastEndedAt == 0) return true;
        if (now < lastEndedAt) return true;          // overflow safety
        return (now - lastEndedAt) >= quietMs;
      }
      ```
    - Update `stopAlarm()`: tambah `lastAlarmEndedAt = millis();` tepat setelah cleanup audio (sebelum `systemState = STANDBY;`).
    - Update `handleAudioLoop()` natural-end branch (`alarmPlayCount > playMax`): tambah `lastAlarmEndedAt = millis();` sebelum `alarmPlayCount = 0; systemState = STANDBY;`.
    - Update `mqttCallback()` event `apd_violation` / `apd_test`:
      ```cpp
      if (strcmp(event, "apd_violation") == 0 || strcmp(event, "apd_test") == 0) {
        if (!shouldStartAlarm(millis(), lastAlarmEndedAt, QUIET_WINDOW_MS)) {
          Serial.println("[alarm] skip — quiet window aktif");
          return;
        }
        if (systemState == ALARM_ACTIVE && currentAlarmIsGas) {
          Serial.println("[alarm] skip — gas alarm sedang aktif");
          return;
        }
        startAlarm();
      } else if (strcmp(event, "apd_stop") == 0) {
        stopAlarm();   // TIDAK di-gate (klausa 3.6)
      } else if (strcmp(event, "gas_test") == 0) {
        handleGasAlert(true);   // TIDAK di-gate (out of scope)
      }
      ```
    - JANGAN gate event di `controlTopic` (`apd_stop`, `reboot`).
    - _Bug_Condition: `isBugConditionPostAlarmRetrigger(X)` — `X.incomingEvent ∈ {apd_violation, apd_test} AND (X.now - X.lastAlarmEndedAt) < X.quietWindowMs`._
    - _Expected_Behavior: Property 8 di `design.md` — `shouldStartAlarm'(now, lastEnded, quietMs) = false` di window._
    - _Preservation: Property 9, 11 di `design.md` + klausa 3.5, 3.6 — di luar window `shouldStartAlarm' = true`; `apd_stop` tidak pernah di-gate; gas alarm aktif tidak diinterupsi._
    - _Requirements: 2.7, 3.5, 3.6_

  - [x] 6.3 Verify exploration test 1d sekarang PASS
    - **Property 1: Expected Behavior** - Bug 4 (Quiet Window + Cooldown) Fixed
    - **IMPORTANT**: Re-run test yang SAMA dari task 1d — JANGAN tulis test baru.
    - Backend: jalankan `pytest tests/test_config.py` — verifikasi `COOLDOWN_SECONDS == 20` saat unset.
    - Firmware: jalankan PBT `shouldStartAlarm` (PlatformIO native test) — verifikasi `(now - lastEnded) < quietMs` → `false`.
    - Manual hardware (acceptance step 4): trigger gas, tunggu selesai, dalam 10 detik kirim `apd_violation` — verifikasi audio APD tidak menyala dan log `"[alarm] skip — quiet window aktif"` muncul.
    - **EXPECTED OUTCOME**: Tests PASSES; audio APD ter-skip selama window.
    - _Requirements: 2.7, 2.8_

  - [x] 6.4 Verify preservation test 2d masih PASS
    - **Property 2: Preservation** - `apd_stop`, Out-of-Window APD, Env Override, Skip Path Unchanged
    - **IMPORTANT**: Re-run test yang SAMA dari task 2d — JANGAN tulis test baru.
    - Backend: jalankan `pytest tests/test_config.py` dengan `monkeypatch.setenv("COOLDOWN_SECONDS", "5")` — verifikasi `COOLDOWN_SECONDS == 5`. Verifikasi node `esp32.enabled = false` tetap di-skip publish (klausa 3.10).
    - Firmware: PBT `shouldStartAlarm` untuk `(now - lastEnded) >= quietMs` → `true`. Manual: kirim `apd_stop` di tengah quiet window → `stopAlarm()` tetap dipanggil.
    - Manual hardware (acceptance step 5): tunggu >10 detik setelah alarm sebelumnya, trigger `apd_violation` — verifikasi 4 putaran audio APD seperti biasa.
    - **EXPECTED OUTCOME**: Tests PASSES — env override dihormati, `apd_stop` selalu kerja, di luar window APD tetap 4 putaran, sub-threshold tidak publish.
    - _Requirements: 3.5, 3.6, 3.8, 3.9, 3.10_

- [x] 7. Checkpoint — End-to-end acceptance & all tests pass
  - Jalankan keseluruhan test suite:
    - `pnpm vitest --run` di `web-dashboard/` (Bug 1, Bug 2).
    - `pytest` di root project (Bug 4 backend).
    - PlatformIO native test untuk `shouldStartAlarm` di `alarm_apd/test/` (Bug 4 firmware).
  - Jalankan acceptance demo end-to-end dari `bugfix.md` step 1–7:
    1. Create node lewat wizard, isi `picName = "Operator Demo"`, `picPhone = "081358959349"` → DB row `picPhone = "6281358959349"`.
    2. `/nodes` → klik Test Camera + Test MQTT → response 200 (bukan 403), spinner berhenti.
    3. `python trigger_alarm.py --gas` → 4 putaran audio gas.
    4. Dalam 10 detik setelah gas selesai, `python trigger_alarm.py` → audio APD TIDAK menyala (log `"skip — quiet window aktif"`).
    5. Setelah >10 detik, `python trigger_alarm.py` → 4 putaran audio APD.
    6. Backend tanpa env `COOLDOWN_SECONDS` → default `20`; dengan `COOLDOWN_SECONDS=5` → `5`.
    7. Trigger pelanggaran APD nyata pada node demo → GoWA menerima request kirim WA ke `6281358959349`.
  - Verifikasi semua test pass dan acceptance step 1–7 lulus. Tanyakan ke user jika ada pertanyaan atau anomali.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_


## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3.1", "4.1", "5.1", "6.1", "6.2"] },
    { "id": 3, "tasks": ["3.2", "3.3", "4.2", "5.2", "5.3", "6.3", "6.4"] },
    { "id": 4, "tasks": ["4.3"] },
    { "id": 5, "tasks": ["4.4", "4.5"] },
    { "id": 6, "tasks": ["7"] }
  ]
}
```

Wave 0: Exploration tests untuk Property 1 (semua empat bug condition).
Wave 1: Preservation tests untuk Property 2 (semua empat sub-properti) — dijalankan setelah exploration test ditulis agar baseline UNFIXED tercatat utuh.
Wave 2: Implementasi inti tiap bug — `3.1` (CSRF NodeTable), `4.1` (`normalizePhone` pure helper), `5.1` (gas loop firmware), `6.1` (backend cooldown), `6.2` (firmware quiet window). Saling independen.
Wave 3: Verifikasi Property 1 & Property 2 untuk bug-bug yang sudah selesai di wave 2 + UI wizard `4.2` (butuh `normalizePhone` dari `4.1`).
Wave 4: `4.3` builder wizard (butuh `4.2` `StepSectorInfoValues` baru).
Wave 5: Verifikasi Property 1 & Property 2 untuk Bug 2 (`4.4`, `4.5`) — butuh seluruh chain `4.1 → 4.2 → 4.3` selesai.
Wave 6: Checkpoint end-to-end (`7`) — acceptance demo step 1–7.

Catatan dependency:

- Task 1 dan Task 2 harus selesai (test ditulis & dijalankan pada UNFIXED code) SEBELUM task 3–6 dimulai.
- Task 3, 4, 5, 6 saling independen — bisa dikerjakan paralel oleh tim berbeda.
- Task 4.1 (`normalizePhone`) harus selesai sebelum 4.2 dan 4.3 (keduanya import helper).
- Task 6.1 (backend `config.py`) dan 6.2 (firmware `alarm_apd.ino`) saling independen — boleh paralel.
- Task 5.1 dan 6.2 sama-sama menyentuh `alarm_apd.ino`; jika dikerjakan paralel, koordinasikan merge agar `currentAlarmIsGas` (5.1) dan `lastAlarmEndedAt` (6.2) tidak bertabrakan di blok deklarasi global.
- Task 7 (checkpoint) hanya boleh dijalankan setelah seluruh task 3–6 lulus verifikasi.

## Notes

- **Property 1 (Bug Condition)** mencakup empat sub-properti (1a–1d), satu per bug. Semua sub-test harus FAIL pada UNFIXED code untuk mengkonfirmasi bug.
- **Property 2 (Preservation)** mencakup empat sub-properti (2a–2d). Semua sub-test yang bisa dijalankan harus PASS pada UNFIXED code untuk mengunci baseline.
- **Property-based testing** dipakai khusus untuk dua helper murni: `normalizePhone` (TS, fast-check) dan `shouldStartAlarm` (C++, PlatformIO native test). Helper lain bersifat hardware-bound atau side-effect berat sehingga diuji manual / Vitest unit.
- **Out-of-scope** (tidak dikerjakan di spec ini, sesuai catatan scope di `bugfix.md`): peningkatan akurasi deteksi YOLO, badge gas di `/monitor`, push threshold ke ESP32, WiFi manager portal, optimasi performa, perubahan pada `checkBootButton()` (developer test path).
- **Test fixture migration** (Bug 2): file test existing yang memakai literal `StepSectorInfoValues` lama (`step-sector-info.test.ts`, `step-review.test.ts`, `composition-nullification.property.test.ts`) akan break compile saat field `picName` & `picPhone` ditambahkan; update fixture termasuk dalam scope task 4.2 dan 4.3.
- **Hardware verification** (Bug 3 & sebagian Bug 4): butuh ESP32 fisik dengan MQ-135, speaker MAX98357, dan koneksi MQTT ke backend Python. Acceptance step 3–5 di `bugfix.md` adalah skenario referensi.
- **Risiko merge `alarm_apd.ino`**: dua state global baru (`currentAlarmIsGas` dari Task 5, `lastAlarmEndedAt` + `QUIET_WINDOW_MS` dari Task 6) harus ditempatkan di blok yang sama (~baris 149–155). Koordinasikan PR order untuk menghindari conflict.
- **Default `COOLDOWN_SECONDS=20`** (Task 6.1) lebih konservatif dari default lama `2`. Operator yang butuh nilai lebih agresif harus override via `.env` (klausa 3.9). Dokumentasikan trade-off di `.env.example`.
