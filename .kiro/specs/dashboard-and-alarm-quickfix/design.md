# Bugfix Design Document

## Overview

Spec ini memetakan empat bug condition dari `bugfix.md` ke perubahan kode yang minimal dan tertarget. Cakupan menyentuh tiga codebase:

- **Next.js dashboard** (`web-dashboard/src/...`) — Bug 1 (CSRF token) dan Bug 2 (PIC name/phone).
- **Python backend** (`config.py`, `ServiceAPDBackend.py`, `.env.example`) — Bug 4 sisi server (`COOLDOWN_SECONDS` default).
- **ESP32 firmware** (`alarm_apd/alarm_apd.ino`) — Bug 3 (gas loop) dan Bug 4 sisi firmware (quiet window).

Prinsip desain:

1. **Surgical.** Tiap bug mendapatkan perubahan terkecil yang masih memuaskan klausa Fix Checking di `bugfix.md`. Tidak ada refactor, tidak ada perubahan API, tidak ada penambahan fitur di luar empat bug.
2. **Pure helpers untuk PBT.** Logika baru yang non-trivial diekstrak menjadi fungsi murni (`normalizePhone`, `shouldStartAlarm`) supaya bisa diuji property-based. Logika hardware-bound atau side-effect berat diuji manual / integrasi.
3. **Preservation by construction.** Tiap perubahan ditempatkan di belakang `isBugCondition`-style guard sehingga input non-buggy melewati path yang persis sama dengan kode lama.
4. **Tidak menyentuh hal di luar scope.** Klausa "Out-of-scope" di `bugfix.md` (akurasi deteksi, badge gas UI, threshold push, WiFi portal, perf) tidak dibahas di sini.

---

## Glossary

- **Quiet window** — jendela waktu (default 10 detik) setelah sebuah alarm selesai, di mana event `apd_violation` / `apd_test` baru akan diabaikan oleh firmware.
- **Cooldown** — jeda minimum (di backend) antar publish event `apd_violation` per node. Default lama 2 detik, default baru 20 detik.
- **`isBugCondition`** — predikat yang membungkus input "buggy" sesuai bagian Deriving the Bug Conditions di `bugfix.md`. Fix berlaku saat predikat true; preservation berlaku saat predikat false.
- **PBT (property-based testing)** — pengujian dengan generator input acak yang memverifikasi invariant. Dipakai khusus untuk helper murni di spec ini: `normalizePhone` (TS) dan `shouldStartAlarm` (C++).
- **`useApiFetch`** — hook React di `@/hooks/use-csrf-token` yang otomatis melampirkan header `X-CSRF-Token` untuk request mutasi.
- **`buildNodeDataFromWizardState`** — pure function di `NodeWizard.tsx` yang menerjemahkan state wizard menjadi payload `NodeData` untuk `POST/PUT /api/nodes`.

---

## Bug Details

Ringkasan masing-masing bug; klausa Current Behavior lengkap berada di `bugfix.md`.

| ID    | Lokasi                                          | Manifestasi                                                                                                                                                |
|-------|-------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Bug 1 | `web-dashboard/.../NodeTable.tsx`               | Klik "Test Camera" / "Test MQTT" pada `/nodes` → `POST /api/nodes/test-connection` tanpa `X-CSRF-Token` → middleware reject 403 → spinner berputar selamanya.   |
| Bug 2 | `web-dashboard/.../NodeWizard.tsx`, `StepSectorInfo.tsx` | Wizard tidak punya input untuk `picName`/`picPhone`; builder hardcode `''` → backend Python skip `send_whatsapp_alert` karena `picPhone` kosong.            |
| Bug 3 | `alarm_apd/alarm_apd.ino` → `handleGasAlert`    | Gas threshold terlewat, audio terputar 1 putaran lalu sunyi karena `alarmPlayCount = ALARM_PLAY_MAX` di-set langsung setelah `mp3->begin()`.               |
| Bug 4 | Backend `config.py` + firmware `alarm_apd.ino`  | Backend re-publish `apd_violation` setiap 2 detik; firmware tanpa quiet window → audio APD menyala kurang dari 1 detik setelah alarm gas selesai.            |

`bugfix.md` mendefinisikan empat fungsi `isBugCondition*` yang formal — desain ini mengikuti kontrak tersebut tanpa memperluas scope.

---

## Expected Behavior

Diparafrase dari klausa 2.x di `bugfix.md`. Klausa formal tetap menjadi sumber kebenaran.

- **Bug 1.** Klik tombol Test Camera / Test MQTT pada `/nodes` → request menyertakan `X-CSRF-Token` valid → middleware lolos → UI menampilkan hasil koneksi (`ok` / `failed` / pesan error) dan menghentikan spinner.
- **Bug 2.** Wizard menyediakan input "Nama PIC" dan "No WhatsApp PIC" (langkah 1), normalisasi nomor ke `62…` saat blur, prefill saat edit, dan menyimpan via `POST/PUT /api/nodes`. Backend Python (yang tidak diubah) lalu memanggil `send_whatsapp_alert` saat violation.
- **Bug 3.** Gas threshold terlewat → audio gas berbunyi `GAS_ALARM_PLAY_MAX` kali (default 4) → state kembali ke `STANDBY`.
- **Bug 4.** Setelah alarm apa pun selesai, ada quiet window 10 detik di firmware untuk event `apd_violation` / `apd_test`; backend default `COOLDOWN_SECONDS = 20` (override-able lewat `.env`); event `apd_stop` tidak pernah di-gate; gas alarm aktif tidak diinterupsi oleh `apd_violation`.

---

## Hypothesized Root Cause

Untuk setiap bug, root cause sudah dikonfirmasi via pembacaan kode (bukan hipotesis longgar) — tetapi disusun di sini sebagai dasar untuk Fix Implementation.

**Bug 1.** `NodeTable.handleTestConnection` (sekitar baris 270–310 `NodeTable.tsx`) memanggil `fetch` mentah. Middleware `src/middleware.ts` mewajibkan header `X-CSRF-Token` untuk metode mutasi, jadi request 403. Hook `useApiFetch()` sudah men-handle attach token + lazy-load via `/api/auth/csrf` dan dipakai di NodeWizard, namun NodeTable terlewat.

**Bug 2.** Tiga lapis defect:

1. `StepSectorInfoValues` di `StepSectorInfo.tsx` hanya berisi `nodeName` dan `sektorId`; tidak ada slot untuk `picName` / `picPhone`.
2. `StepSectorInfo` tidak merender input untuk PIC.
3. `buildNodeDataFromWizardState` (`NodeWizard.tsx` ~baris 209) hardcode `picName: initialData?.picName || ''` dan `picPhone: initialData?.picPhone || ''` — tidak pernah membaca dari `state.sectorInfo`.

Akibatnya `node.picPhone === ''`, dan `ServiceAPDBackend.py` (sekitar baris 885) men-skip `send_whatsapp_alert`.

**Bug 3.** `handleGasAlert(true)` di `alarm_apd.ino` ~baris 1411 secara eksplisit men-set `alarmPlayCount = ALARM_PLAY_MAX` setelah `mp3->begin()` sukses (komentar literal `"Gas alarm cukup 1 putaran"`). `handleAudioLoop()` saat menyelesaikan satu putaran melakukan `alarmPlayCount++` lalu `alarmPlayCount > ALARM_PLAY_MAX` → langsung `stopAlarm()`.

**Bug 4.** Dua sisi:

- *Backend.* `config.py` memuat `COOLDOWN_SECONDS = int(os.getenv("COOLDOWN_SECONDS", "2"))`. Default 2 detik terlalu agresif sehingga publish berulang dengan rapat.
- *Firmware.* `mqttCallback()` di event `apd_violation` / `apd_test` langsung memanggil `startAlarm()` tanpa state `lastAlarmEndedAt` atau pengecekan jeda.

---

## Correctness Properties

Diambil dari bagian "Deriving the Bug Conditions" di `bugfix.md`. Tiap property bersifat verifiable: helper murni diuji via PBT, sisanya via unit / manual test (lihat Testing Strategy).

### Property 1: Bug 1 — Fix CSRF token

Untuk semua `X` dengan `isBugConditionCsrf(X) == true`, hasil `simulate_handleTestConnection'(X).status == 200` dan `usedCsrfToken == true`. Verifikasi: unit test Vitest pada `NodeTable.handleTestConnection` dengan mock `useApiFetch`.

**Validates: Requirements 2.1, 2.2**

### Property 2: Bug 1 — Preservation CSRF

Untuk semua `X` dengan `isBugConditionCsrf(X) == false` (mis. method GET, atau button bukan TestCamera/TestMQTT), perilaku sebelum dan sesudah fix identik. Verifikasi: GET `/api/nodes/{id}/status` di file yang sama tetap memakai `fetch` mentah; manual smoke test live monitor MJPEG.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 3: Bug 2 — Fix wizard builder

Untuk semua `X` dengan `isBugConditionPic(X) == true` (fix memaksa user mengisi `picName` dan `picPhone`), `result.picName != ''` dan `result.picPhone` match `/^62[0-9]{8,14}$/`. Verifikasi: extend property test `composition-nullification.property.test.ts` dengan generator `picName` non-empty dan `picPhone` valid.

**Validates: Requirements 2.3, 2.4**

### Property 4: Bug 2 — `normalizePhone` regex + idempotence

Untuk semua input string `s` yang setelah strip non-digit menghasilkan ≥9 digit dengan prefix valid (`+62`, `62`, `0`, atau langsung digit), `normalizePhone(s)` match `/^62[0-9]{8,14}$/` dan `normalizePhone(normalizePhone(s)) === normalizePhone(s)`. Verifikasi: PBT fast-check di `phone.property.test.ts`.

**Validates: Requirements 2.3**

### Property 5: Bug 2 — Preservation builder

Untuk node dengan `picPhone` sudah dalam format `62…` di `initialData`, builder memproduksi nilai persis sama (idempotent re-normalisasi). Verifikasi: unit test deterministik di `composition-nullification.property.test.ts`.

**Validates: Requirements 3.4**

### Property 6: Bug 3 — Fix gas loop count

Untuk semua `X` dengan `isBugConditionGasLoop(X) == true`, total putaran audio yang diputar `== GAS_ALARM_PLAY_MAX` (default 4). Verifikasi: manual hardware test + Serial log check (`"[audio] putaran 1/4"` … `"4/4 selesai"`).

**Validates: Requirements 2.6**

### Property 7: Bug 3 — Preservation APD loop

Untuk input non-buggy (mis. `startAlarm()` dipanggil dari `apd_violation`), banyak putaran sama dengan kode lama (`ALARM_PLAY_MAX = 4`). Verifikasi: manual + grep firmware tidak mengandung lagi `alarmPlayCount = ALARM_PLAY_MAX` di `handleGasAlert`.

**Validates: Requirements 3.5, 3.7**

### Property 8: Bug 4 — Fix firmware quiet window

Untuk semua `X` dengan `isBugConditionPostAlarmRetrigger(X) == true`, `shouldStartAlarm'(X.now, X.lastAlarmEndedAt, X.quietWindowMs) == false`. Verifikasi: PBT C++ untuk `shouldStartAlarm`.

**Validates: Requirements 2.7**

### Property 9: Bug 4 — Komplemen quiet window

Saat `now - lastEnded >= quietMs` (di luar window), `shouldStartAlarm'` mengembalikan `true`. Verifikasi: PBT C++.

**Validates: Requirements 2.7, 3.5**

### Property 10: Bug 4 — Fix backend cooldown default

`load_config'(env).COOLDOWN_SECONDS == 20` jika env unset, atau sama persis dengan `int(env.COOLDOWN_SECONDS)` jika env di-set. Verifikasi: pytest dengan `monkeypatch.delenv` / `monkeypatch.setenv`.

**Validates: Requirements 2.8, 3.9**

### Property 11: Bug 4 — Preservation `apd_stop` dan path lain

Event `apd_stop` tidak pernah di-gate. APD trigger di luar quiet window tetap memanggil `startAlarm()` 4 putaran. Reading di bawah threshold tidak men-trigger publish meski default cooldown bertambah. Verifikasi: manual integration test.

**Validates: Requirements 3.5, 3.6, 3.8, 3.10**

---

## Fix Implementation

### Bug ↔ Change Map

| Bug | File yang diubah | Fungsi/region kunci | Helper baru |
|-----|------------------|---------------------|-------------|
| 1   | `web-dashboard/src/components/nodes/NodeTable.tsx` | `handleTestConnection` | — (pakai `useApiFetch` existing) |
| 2   | `web-dashboard/src/components/wizard/StepSectorInfo.tsx`, `NodeWizard.tsx`, `lib/phone.ts` (baru) | `StepSectorInfoValues`, `validateStepSectorInfo`, `buildNodeDataFromWizardState` | `normalizePhone`, `isValidPhone` (pure) |
| 3   | `alarm_apd/alarm_apd.ino` | `handleGasAlert`, `handleAudioLoop`, `startAlarm`, `stopAlarm` | `GAS_ALARM_PLAY_MAX` (`#define`), `currentAlarmIsGas` (flag) |
| 4   | Backend: `config.py`, `.env.example`. Firmware: `alarm_apd.ino` (`stopAlarm`, `mqttCallback`, `handleAudioLoop`) | `COOLDOWN_SECONDS` env default; `lastAlarmEndedAt`, `QUIET_WINDOW_MS`, gating | `shouldStartAlarm(now, lastEnded, quietMs)` (pure C++) |

### Bug 1 — CSRF token pada NodeTable test-connection

`web-dashboard/src/components/nodes/NodeTable.tsx`:

1. Import `useApiFetch` dari `@/hooks/use-csrf-token`.
2. Di body komponen `NodeTable`, panggil `const apiFetch = useApiFetch();`.
3. Di `handleTestConnection`, ganti `fetch('/api/nodes/test-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ... })` menjadi `apiFetch('/api/nodes/test-connection', { method: 'POST', body: ... })`. `useApiFetch` sudah set `Content-Type: application/json` otomatis bila body ada, jadi opsi `headers` boleh disederhanakan.
4. `handleTestConnection` dibungkus `useCallback` dengan dependency `[apiFetch]` agar reference stable (mengikuti pattern di file yang sudah ada).

`fetch` lain di file yang sama yang **bukan** POST/PUT/PATCH/DELETE (mis. `GET /api/nodes/{id}/status` di baris ~117) tidak diubah — middleware tidak memeriksa CSRF untuk GET (`isBugConditionCsrf` mensyaratkan `method = POST`), jadi mengubahnya akan keluar dari scope dan berisiko regresi.

### Bug 2 — PIC name/phone bisa di-input dan di-edit

#### B2.1 Helper murni `normalizePhone`

File baru: `web-dashboard/src/lib/phone.ts`.

```ts
// Normalisasi nomor telepon Indonesia ke format "62XXXXXXXXX".
// Aturan (sesuai bugfix.md klausa 2.3):
//   - strip semua karakter non-digit kecuali "+" awal
//   - prefix "+62" → "62"
//   - prefix "0"   → "62"
//   - prefix "62"  → tetap
//   - selain itu (mulai 8/9/...) → diberi prefix "62"
//   - return string kosong jika input kosong / hanya non-digit
//   - idempoten: normalizePhone(normalizePhone(x)) === normalizePhone(x)
export function normalizePhone(input: string): string { ... }

// Validasi: hasil normalisasi harus match /^62[0-9]{8,14}$/.
export function isValidPhone(input: string): boolean { ... }
```

`normalizePhone` ditulis sebagai pure function tanpa side effect — cocok untuk PBT.

#### B2.2 Tambah field di `StepSectorInfo`

`web-dashboard/src/components/wizard/StepSectorInfo.tsx`:

1. Tambah dua field di `StepSectorInfoValues`:
   ```ts
   export interface StepSectorInfoValues {
     nodeName: string;
     sektorId: string;
     picName: string;
     picPhone: string;
   }
   ```
2. Tambah error key di `StepSectorInfoErrors`:
   ```ts
   export interface StepSectorInfoErrors {
     nodeName?: string;
     sektorId?: string;
     picName?: string;
     picPhone?: string;
   }
   ```
3. Update `validateStepSectorInfo`:
   - `picName` wajib tidak hanya whitespace; max 100 karakter (selaras dengan `nodeName`).
   - `picPhone` boleh kosong (opt-out alert WA, klausa 2.4) **tetapi** jika non-kosong harus lolos `isValidPhone(...)`. Pesan error: `"Format nomor WhatsApp tidak valid"`.
4. Render dua input baru di JSX `StepSectorInfo`:
   - `Nama PIC` (text input).
   - `No WhatsApp PIC` (input `inputMode="tel"`, placeholder `081234567890`). Helper text `"Otomatis dinormalisasi ke format 62…"`.
   - Bila `picPhone` kosong, tampilkan banner peringatan `"Alert WhatsApp tidak akan dikirim untuk node ini"` (klausa 2.4).
5. `onBlur` field `picPhone` memanggil `normalizePhone` lalu `onChange` dengan nilai ternormalisasi → user melihat hasil normalisasi langsung.

#### B2.3 Update `buildNodeDataFromWizardState`

`web-dashboard/src/components/wizard/NodeWizard.tsx`:

1. Di `createInitialState`, isi `picName` dan `picPhone` dari `initialData` (untuk edit) atau string kosong (create):
   ```ts
   const sectorInfo: StepSectorInfoValues = {
     nodeName: initialData?.sektorName || '',
     sektorId: initialData?.sektorId || '',
     picName: initialData?.picName || '',
     picPhone: initialData?.picPhone || '',
   };
   ```
2. Di `buildNodeDataFromWizardState`, ganti dua baris hardcode menjadi:
   ```ts
   picName: state.sectorInfo.picName.trim(),
   picPhone: state.sectorInfo.picPhone ? normalizePhone(state.sectorInfo.picPhone) : '',
   ```
   `state.sectorInfo.picPhone` umumnya sudah ternormalisasi karena `onBlur`, tapi normalisasi ulang di sini menjamin idempotence dan menutup case di mana user submit tanpa blur.

#### B2.4 Backend Python tidak diubah

`ServiceAPDBackend.py` sudah membaca `node.get("picPhone")` dengan benar. Begitu wizard menyimpan nomor `62…`, branch `if pic_phone` evaluate ke `True` tanpa modifikasi backend.

### Bug 3 — Gas alarm 4 putaran (bukan 1)

`alarm_apd/alarm_apd.ino`:

1. Tambah konstanta global di blok deklarasi alarm (sekitar baris 149–151):
   ```cpp
   static const int ALARM_PLAY_MAX     = 4;  // putaran APD (existing)
   static const int GAS_ALARM_PLAY_MAX = 4;  // putaran gas (BARU)
   ```
2. Tambah flag global yang menandai sesi audio aktif adalah gas alarm (untuk routing di `handleAudioLoop`):
   ```cpp
   static bool currentAlarmIsGas = false;
   ```
   Diset di `handleGasAlert` saat memulai sesi gas, di-reset di `stopAlarm` dan di awal `startAlarm` (defensif).
3. Di `handleGasAlert(true)`, ganti baris `alarmPlayCount = ALARM_PLAY_MAX;` menjadi `alarmPlayCount = 1;` (analog `startAlarm()` APD), dan set `currentAlarmIsGas = true`.
4. Di `handleAudioLoop()`, ganti perbandingan `if (alarmPlayCount <= ALARM_PLAY_MAX)` menjadi:
   ```cpp
   const int playMax = currentAlarmIsGas ? GAS_ALARM_PLAY_MAX : ALARM_PLAY_MAX;
   if (alarmPlayCount <= playMax) {
     // restart putaran berikutnya
   } else {
     // selesai → stopAlarm()
   }
   ```
   Logging juga memakai `playMax` agar `"putaran X/Y selesai"` benar.
5. Di `stopAlarm()`, tambah `currentAlarmIsGas = false;` setelah reset `alarmPlayCount`.
6. Di `startAlarm()` (path APD), set `currentAlarmIsGas = false;` sebelum atau sesudah `alarmPlayCount = 1` agar konsisten.

`checkBootButton()` saat ini sengaja men-set `alarmPlayCount = ALARM_PLAY_MAX` setelah `startAlarm()` agar test lokal cukup 1 putaran. **Perilaku ini tidak diubah** — `checkBootButton` adalah tombol fisik developer, tidak masuk dalam empat bug condition di `bugfix.md`. Memodifikasinya akan keluar dari scope.

### Bug 4 — Quiet window dan cooldown

#### Sisi A — Backend cooldown default (klausa 2.8)

1. `config.py`: ubah default literal:
   ```python
   COOLDOWN_SECONDS: int = int(os.getenv("COOLDOWN_SECONDS", "20"))
   ```
2. `.env.example`: tambah / update entri (di section "Detection Thresholds" atau buat entri baru bila belum ada):
   ```
   # Jeda minimum antar publish event apd_violation per node, dalam detik.
   # Default 20 detik untuk mencegah retrigger alarm yang agresif. Turunkan
   # hanya untuk debugging — nilai < 5 dapat menyebabkan alarm fisik
   # menumpuk dan mengganggu operator.
   COOLDOWN_SECONDS=20
   ```
3. `ServiceAPDBackend.py` **tidak diubah** — logika `if has_violation and (current_time - last_notification_time) > COOLDOWN_SECONDS` (baris ~846) sudah benar; hanya nilainya yang berubah.

#### Sisi B — Firmware quiet window (klausa 2.7)

`alarm_apd/alarm_apd.ino`:

1. **Konstanta dan state global baru** (blok deklarasi sekitar baris 149–155):
   ```cpp
   // Quiet window setelah alarm sebelumnya selesai. Selama window ini,
   // event apd_violation / apd_test akan diabaikan.
   static const unsigned long QUIET_WINDOW_MS = 10000;  // 10 detik

   // Timestamp millis() saat alarm terakhir selesai. 0 = belum pernah.
   static unsigned long lastAlarmEndedAt = 0;
   ```

2. **Pure helper `shouldStartAlarm`** (forward declaration + implementasi dekat helper alarm lain):
   ```cpp
   // Mengembalikan true jika alarm baru boleh dimulai berdasarkan jeda
   // sejak alarm terakhir selesai.
   //
   // Pure function (tidak mengakses global) → dapat di-PBT-kan.
   //
   // Edge cases:
   //   - lastEndedAt == 0  → belum pernah ada alarm sebelumnya → return true.
   //   - now < lastEndedAt → millis() overflow setelah ~49.7 hari →
   //                          conservative: return true (jangan blokir setelah overflow).
   bool shouldStartAlarm(unsigned long now,
                         unsigned long lastEndedAt,
                         unsigned long quietMs) {
     if (lastEndedAt == 0) return true;
     if (now < lastEndedAt) return true;          // overflow safety
     return (now - lastEndedAt) >= quietMs;
   }
   ```

3. **Update `stopAlarm()`:** tambahkan `lastAlarmEndedAt = millis();` tepat setelah cleanup audio (sebelum `systemState = STANDBY;`). Hal ini menutup baik path APD selesai normal maupun path gas selesai (karena gas juga lewat `stopAlarm` di akhir loop).

4. **Update `handleAudioLoop()`:** path "alarm selesai diputar X kali" yang saat ini set `alarmPlayCount = 0; systemState = STANDBY;` — tambahkan `lastAlarmEndedAt = millis();` sebelum dua baris itu. Ini menangkap natural-end yang tidak melewati `stopAlarm()`. Duplikasi defensif aman karena helper memakai operasi monotonic.

5. **Gating di `mqttCallback()`** untuk event `apd_violation` / `apd_test` (sekitar baris 425):
   ```cpp
   if (strcmp(event, "apd_violation") == 0 || strcmp(event, "apd_test") == 0) {
     if (!shouldStartAlarm(millis(), lastAlarmEndedAt, QUIET_WINDOW_MS)) {
       Serial.println("[alarm] skip — quiet window aktif");
       return;
     }
     // Bug 4 exception: jika gas alarm sedang ALARM_ACTIVE, biarkan selesai.
     if (systemState == ALARM_ACTIVE && currentAlarmIsGas) {
       Serial.println("[alarm] skip — gas alarm sedang aktif");
       return;
     }
     startAlarm();
   } else if (strcmp(event, "apd_stop") == 0) {
     stopAlarm();   // TIDAK di-gate, sesuai klausa 3.6
   } else if (strcmp(event, "gas_test") == 0) {
     handleGasAlert(true);   // TIDAK di-gate dalam scope spec ini;
                             // gas_test adalah path test, bukan APD retrigger.
   }
   ```
6. **Topik `controlTopic`** (`apd_stop`, `reboot`) tidak di-gate sama sekali (klausa 3.6).

### Diagram alur Bug 4 (firmware)

```
mqttCallback(event)
       │
       ├── event == "apd_violation" || "apd_test"
       │        │
       │        ├── shouldStartAlarm(millis(), lastAlarmEndedAt, QUIET_WINDOW_MS) == false
       │        │        └── log "skip — quiet window aktif", RETURN
       │        ├── systemState == ALARM_ACTIVE && currentAlarmIsGas
       │        │        └── log "skip — gas aktif", RETURN
       │        └── startAlarm()
       │
       ├── event == "apd_stop"
       │        └── stopAlarm()  (TIDAK di-gate)
       │
       └── event == "gas_test"
                └── handleGasAlert(true)  (TIDAK di-gate)


stopAlarm() / handleAudioLoop natural-end
       │
       └── lastAlarmEndedAt = millis();  (set di kedua jalur)
```

### Cross-cutting concerns

- **Tidak ada migrasi data.** DB existing sudah punya `picName` / `picPhone` (lihat `web-dashboard/data/db.json`). Wizard hanya mengisi field yang sebelumnya `''` — tidak perlu migration script.
- **Backward compatibility wizard.** Type `StepSectorInfoValues` mendapat dua field baru. Test existing di `__tests__/step-sector-info.test.ts`, `step-review.test.ts`, dan `composition-nullification.property.test.ts` akan gagal compile sampai literal-nya diperbarui. Mengupdate test fixture termasuk dalam scope (akan dijadwalkan di tasks.md). Tidak ada konsumer eksternal `StepSectorInfoValues` di luar `wizard/`.
- **Tidak ada perubahan kontrak API.** `POST /api/nodes` dan `PUT /api/nodes/{id}` sudah menerima `picName` / `picPhone` (lihat `Node` schema). Wizard hanya mulai mengirim nilai non-kosong. `POST /api/nodes/test-connection` request/response shape tidak berubah; hanya headers yang ditambah. MQTT payload dan AES envelope tidak diubah.
- **Logging.** Tambah satu baris log Indonesian-friendly untuk setiap path skip baru di firmware. Tidak menambah metric / observability di luar log Serial.

### Risiko dan mitigasi

| Risiko | Mitigasi |
|--------|----------|
| User existing yang sudah punya node lama dengan `picPhone == ''` mendadak mendapat warning saat edit | Itu memang diinginkan (klausa 2.4). Warning bersifat informatif, tidak memblokir save. |
| `COOLDOWN_SECONDS=20` membuat operator menunggu lebih lama saat real violation berkelanjutan | Dapat dioverride lewat `.env`. Default lebih konservatif sesuai klausa 2.8. |
| `QUIET_WINDOW_MS = 10s` hard-coded di firmware | Sesuai bugfix.md (default 10s); tidak ditambah env override agar perubahan firmware tetap minimal. Bila operasional menuntut tunable, akan ditangani di spec berbeda. |
| `currentAlarmIsGas` flag global rentan inconsistency saat alur `stopAlarm` tidak terpanggil | `stopAlarm()` dan path natural-end di `handleAudioLoop` sama-sama mereset flag ini. Tambahan defensif: di awal `startAlarm()` paksa `currentAlarmIsGas = false`. |
| PBT untuk `shouldStartAlarm` di PlatformIO native test menambah build target | Helper bersifat pure dan kecil; cukup ditempatkan di header lokal `alarm_apd/lib/alarm_gating/alarm_gating.h` jika tim memilih native test. Alternatif: replikasi properti yang sama dalam TypeScript hanya untuk testing — diputuskan di tasks.md. |

---

## Testing Strategy

| Layer | Tipe test | File / area |
|-------|-----------|-------------|
| `normalizePhone` | PBT (fast-check) | `web-dashboard/src/lib/__tests__/phone.property.test.ts` (baru) |
| `validateStepSectorInfo` | Unit (Vitest) | `web-dashboard/src/components/wizard/__tests__/step-sector-info.test.ts` (extend) |
| `buildNodeDataFromWizardState` | PBT (extend) | `web-dashboard/src/components/wizard/__tests__/composition-nullification.property.test.ts` (extend) |
| `NodeTable.handleTestConnection` | Unit (RTL + Vitest) | `web-dashboard/src/components/nodes/__tests__/NodeTable.test.tsx` (baru atau extend) |
| `config.COOLDOWN_SECONDS` loader | Unit (pytest) | `tests/test_config.py` (baru atau extend), monkeypatch env |
| `shouldStartAlarm` (firmware) | PBT (PlatformIO native test atau host C++) | `alarm_apd/test/test_should_start_alarm/` (baru) |
| Bug 3 + Bug 4 firmware end-to-end | Manual hardware test | acceptance script di `bugfix.md` (`trigger_alarm.py`) |
| Acceptance demo end-to-end | Manual checklist | 7 langkah di section "End-to-End Acceptance Demo" `bugfix.md` |

Property-based tests dipakai khusus untuk dua helper murni (`normalizePhone` dan `shouldStartAlarm`) karena keduanya punya invariant numerik / regex yang jelas dan ruang input tidak terbatas. Sisanya cukup unit/integration test deterministik.

### Verifikasi per bug

- **Bug 1.** Vitest mock `useApiFetch`, klik kedua tombol, assert `X-CSRF-Token` ikut. Manual: live monitor MJPEG GET tetap mengalir.
- **Bug 2.** PBT `normalizePhone` (regex + idempotence). Unit `validateStepSectorInfo` untuk error keys baru. Property test extend di `composition-nullification.property.test.ts` untuk `picPhone` regex. Manual: acceptance step 1 dan 7.
- **Bug 3.** Manual hardware: hitung putaran audio (harus 4); cocokkan log Serial `"[audio] putaran 1/4"`, `"... 2/4 ..."`, dst. Static check: grep firmware setelah perubahan tidak mengandung lagi `alarmPlayCount = ALARM_PLAY_MAX` di `handleGasAlert`.
- **Bug 4 backend.** Pytest dengan `monkeypatch.delenv` dan `monkeypatch.setenv` → assert default 20 dan override.
- **Bug 4 firmware.** PBT `shouldStartAlarm` (4 properti: lastEnded == 0, dalam window, di luar window, overflow). Manual: trigger gas → tunggu selesai → APD dalam 10 detik harus skip; >10 detik harus 4 putaran; `apd_stop` selalu menghentikan.
