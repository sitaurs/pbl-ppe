# Bug 4 (Firmware) — `apd_stop` & Out-of-Window Preservation

**Spec:** `dashboard-and-alarm-quickfix` task 2d.

**Validates:** Requirements 3.5, 3.6 (Unchanged Behavior — `apd_stop` selalu
memanggil `stopAlarm()` tanpa gating; APD trigger di luar quiet window
tetap memutar 4 putaran).

## Properties under test

**Property 9 (Preservation, sebagian) di design.md:**

> Saat `(now - lastEnded) >= quietMs` (di luar window),
> `shouldStartAlarm'(now, lastEnded, quietMs) == true`.

**Property 11 (Preservation, sebagian) di design.md:**

> Event `apd_stop` tidak pernah di-gate. APD trigger di luar quiet window
> tetap memanggil `startAlarm()` 4 putaran.

## Why deferred for `shouldStartAlarm` (verifiable post-fix di task 6.4)

Helper `shouldStartAlarm(now, lastEnded, quietMs)` belum ada di UNFIXED
code — akan ditambahkan oleh task 6.2. Native test
`alarm_apd/test/test_should_start_alarm/test_should_start_alarm.cpp`
(ditulis di task 1d) sudah memuat:

- 2 case Property 8 (dalam window → `false`):
  - `test_within_quiet_window_returns_false`
  - `test_just_inside_quiet_window_returns_false`
- 2 case Property 9 (di luar window → `true`):
  - `test_at_quiet_window_boundary_returns_true`
  - `test_well_after_quiet_window_returns_true`
- 2 edge case (`lastEndedAt == 0` → `true`, overflow → `true`):
  - `test_no_previous_alarm_returns_true`
  - `test_millis_overflow_returns_true`

Pada UNFIXED code semua case **gagal compile / link** (helper belum ada).
Status: **deferred preservation** — verifiable setelah fix task 6.2 menambah
helper, dijalankan di task 6.4.

```bash
# POST-FIX (task 6.4):
pio test -e native -f test_should_start_alarm
# Expected: 6/6 PASS.
```

## P11.A — `apd_stop` tidak pernah di-gate (static-source verification, UNFIXED)

**Anchor 1:** `mqttCallback()` di `alarm_apd.ino` ~baris 425–428.

Saat `topic` = topic node (handler MQTT utama):

```cpp
if (strcmp(event, "apd_violation") == 0 || strcmp(event, "apd_test") == 0) {
  startAlarm();
} else if (strcmp(event, "apd_stop") == 0) {
  stopAlarm();
} else if (strcmp(event, "gas_test") == 0) {
  // ...
}
```

**Anchor 2:** `mqttCallback()` di `alarm_apd.ino` ~baris 444–447 (control topic):

```cpp
const char* event = doc["event"] | "";
Serial.printf("[mqtt] control event='%s'\n", event);
if (strcmp(event, "apd_stop") == 0) {
  stopAlarm();
} else if (strcmp(event, "reboot") == 0) {
  // ...
}
```

**Observasi UNFIXED code:**

- Branch `apd_stop` di kedua handler **langsung** memanggil `stopAlarm()`,
  tanpa kondisi tambahan (tanpa pengecekan `lastAlarmEndedAt`, tanpa
  `shouldStartAlarm`, tanpa `quietWindow`).
- Branch `apd_stop` SHALL tetap **tidak di-gate** setelah fix task 6.2
  (klausa 3.6).

**Status preservation pada UNFIXED code:** ✅ PASS (lock baseline).

## P11.B — Out-of-window APD tetap 4 putaran

**Anchor:** `startAlarm()` di `alarm_apd.ino` (path APD).

```cpp
void startAlarm() {
  // ...
  alarmPlayCount = 1;       // mulai dari 1, akan di-increment per putaran
  systemState = ALARM_ACTIVE;
}
```

`handleAudioLoop()` mengulang sampai `alarmPlayCount > ALARM_PLAY_MAX` (`= 4`).

**Observasi UNFIXED code:**

- Tanpa quiet window (UNFIXED): `mqttCallback()` event `apd_violation`
  langsung memanggil `startAlarm()` setiap kali, total 4 putaran.
- Setelah fix task 6.2: `shouldStartAlarm()` mengembalikan `true` jika
  `(now - lastAlarmEndedAt) >= QUIET_WINDOW_MS` (10 detik) → `startAlarm()`
  tetap dipanggil → 4 putaran. Identik dengan baseline.

**Status preservation:** ✅ PASS (UNFIXED baseline = 4 putaran APD;
post-fix juga 4 putaran asal request datang di luar window).

## Static checks (verifiable post-fix di task 6.4)

Setelah fix Bug 4 firmware (task 6.2), `grep` firmware harus mengkonfirmasi:

1. **HARUS** ada helper `shouldStartAlarm` (signature `bool shouldStartAlarm(...)`).

   ```bash
   # POST-FIX expected: minimal satu match (deklarasi/implementasi).
   grep -n "bool shouldStartAlarm" alarm_apd/alarm_apd.ino
   ```

2. **HARUS** ada konstanta `QUIET_WINDOW_MS` dan state `lastAlarmEndedAt`.

   ```bash
   grep -n "QUIET_WINDOW_MS\|lastAlarmEndedAt" alarm_apd/alarm_apd.ino
   # Expected: minimal 3 match (1 untuk konstanta, 1 untuk state, 1+ pemakaian).
   ```

3. Branch `apd_stop` di `mqttCallback()` **TIDAK boleh** di-gate oleh
   `shouldStartAlarm`. Static check: pastikan `if (strcmp(event, "apd_stop") == 0)`
   diikuti langsung oleh `stopAlarm();` (atau equivalent), bukan oleh
   pengecekan window.

   ```bash
   # POST-FIX expected: branch apd_stop tetap memanggil stopAlarm() langsung.
   grep -A2 -n '"apd_stop"' alarm_apd/alarm_apd.ino
   # Expected: pemanggilan stopAlarm() di baris berikutnya, bukan if/return guard.
   ```

4. `stopAlarm()` dan `handleAudioLoop()` natural-end **HARUS** men-set
   `lastAlarmEndedAt = millis();`.

   ```bash
   grep -n "lastAlarmEndedAt = millis" alarm_apd/alarm_apd.ino
   # POST-FIX expected: minimal 2 match (di stopAlarm() + di handleAudioLoop()).
   ```

## Manual hardware checklist (verifiable post-fix di task 6.4)

Akan dikerjakan setelah fix task 6.2 di-flash ke ESP32 demo.

- [ ] **P11.A:** Trigger `apd_violation`, biarkan audio APD bermain. Saat
      audio masih putaran ke-2, kirim event `apd_stop` → audio **harus
      berhenti seketika** (`stopAlarm()` tidak di-gate oleh quiet window).
- [ ] **P11.B:** Tunggu >10 detik setelah alarm sebelumnya, trigger
      `apd_violation` → audio APD **harus 4 putaran** seperti baseline.
- [ ] **Property 9:** Trigger gas alarm. Setelah gas selesai dan >10 detik
      berlalu, trigger `apd_violation` → audio APD **harus menyala**
      (`shouldStartAlarm` mengembalikan `true` di luar window).

## Status preservation firmware pada UNFIXED code

| Preservation | Cara verifikasi | Status UNFIXED |
|--------------|-----------------|----------------|
| P9 — Out-of-window APD trigger | Native test `test_should_start_alarm.cpp` (4 cases) | ⏳ DEFERRED (helper belum ada; verifiable post-fix di 6.4) |
| P11.A — `apd_stop` tidak di-gate | Static-source `mqttCallback()` baris 425–428, 444–447 | ✅ PASS (lock baseline) |
| P11.B — Out-of-window APD 4 putaran | Static-source `startAlarm()` + `handleAudioLoop()` + manual hw | ✅ PASS (lock baseline) |

Preservation P11.A dan P11.B teramati dari source code dan akan
dipertahankan oleh task 6.2: fix hanya **menambah** gating di branch
`apd_violation`/`apd_test`, **tidak mengubah** branch `apd_stop` atau path
APD di luar window.

---

# Bug 4 — Post-Fix Verification (Task 6.3)

**Spec:** `dashboard-and-alarm-quickfix` task 6.3.

**Validates:** Requirements 2.7 (firmware quiet window), 2.8 (backend
`COOLDOWN_SECONDS` default).

Section ini menutup loop verifikasi exploration tests dari task 1d setelah
fix di task 6.1 (backend) dan task 6.2 (firmware) selesai.

## Backend — pytest results (5/5 PASSED)

```
$ python -m pytest tests/test_config.py -v

============================ test session starts ============================
platform win32 -- Python 3.13.7, pytest-8.3.4, pluggy-1.6.0
collected 5 items

tests/test_config.py::TestCooldownDefaultExploration::test_cooldown_seconds_default_is_20_when_env_unset PASSED [ 20%]
tests/test_config.py::TestCooldownEnvOverridePreservation::test_cooldown_seconds_respects_env_override[1]  PASSED [ 40%]
tests/test_config.py::TestCooldownEnvOverridePreservation::test_cooldown_seconds_respects_env_override[5]  PASSED [ 60%]
tests/test_config.py::TestCooldownEnvOverridePreservation::test_cooldown_seconds_respects_env_override[10] PASSED [ 80%]
tests/test_config.py::TestCooldownEnvOverridePreservation::test_cooldown_seconds_respects_env_override[60] PASSED [100%]

============================= 5 passed in 0.07s =============================
```

**Status:** ✅ PASS.

- `TestCooldownDefaultExploration::test_cooldown_seconds_default_is_20_when_env_unset`
  — exploration test dari task 1d sekarang PASS karena `config.py` sudah
  memuat default literal `"20"` (task 6.1).
- 4 case `TestCooldownEnvOverridePreservation` (override `1`, `5`, `10`,
  `60`) tetap PASS — env override dihormati apa adanya, mengkonfirmasi
  Property 11 (preservation klausa 3.9).

**Property 10 (Fix Checking) terkonfirmasi:**

> `load_config'(env).COOLDOWN_SECONDS == 20` saat `env.COOLDOWN_SECONDS`
> unset, dan `== int(env.COOLDOWN_SECONDS)` saat di-set.

## Firmware — static-source verification

PlatformIO native test environment **tidak** dikonfigurasi di
`alarm_apd/platformio.ini`, sehingga
`pio test -e native -f test_should_start_alarm` tidak dapat dijalankan
langsung. Verifikasi dilakukan via static logic equivalence terhadap
sumber `alarm_apd/alarm_apd.ino`.

### Helper `shouldStartAlarm` ada (forward decl + implementasi)

```
$ grep -n "bool shouldStartAlarm" alarm_apd/alarm_apd.ino
192:bool shouldStartAlarm(unsigned long now,
1077:bool shouldStartAlarm(unsigned long now,
```

2 matches ✓ — sesuai dengan struktur forward declaration (baris 192) +
implementasi (baris 1077). Implementasi (baris 1077–1083):

```cpp
bool shouldStartAlarm(unsigned long now,
                      unsigned long lastEndedAt,
                      unsigned long quietMs) {
  if (lastEndedAt == 0) return true;
  if (now < lastEndedAt) return true;          // overflow safety
  return (now - lastEndedAt) >= quietMs;
}
```

### Trace 6 test cases dari `test_should_start_alarm.cpp`

Setiap case di-trace lewat tiga branch helper di atas (urut: `lastEndedAt
== 0` → `now < lastEndedAt` → `(now - lastEndedAt) >= quietMs`).

| # | Test case (file `test_should_start_alarm.cpp`) | Args `(now, lastEndedAt, quietMs)` | Branch yang aktif | Hasil | Expected | ✓ |
|---|---|---|---|---|---|---|
| 1 | `test_within_quiet_window_returns_false` | `(19000, 18000, 10000)` | `(19000-18000)=1000 < 10000` | `false` | `false` | ✓ |
| 2 | `test_just_inside_quiet_window_returns_false` | `(19999, 10000, 10000)` | `(19999-10000)=9999 < 10000` | `false` | `false` | ✓ |
| 3 | `test_at_quiet_window_boundary_returns_true` | `(20000, 10000, 10000)` | `(20000-10000)=10000 >= 10000` | `true` | `true` | ✓ |
| 4 | `test_well_after_quiet_window_returns_true` | `(100000, 10000, 10000)` | `(100000-10000)=90000 >= 10000` | `true` | `true` | ✓ |
| 5 | `test_no_previous_alarm_returns_true` | `(50000, 0, 10000)` | `lastEndedAt == 0` → early return | `true` | `true` | ✓ |
| 6 | `test_millis_overflow_returns_true` | `(100, 4294967200, 10000)` | `now < lastEndedAt` → early return | `true` | `true` | ✓ |

**Hasil:** 6/6 case sesuai logic equivalence. Bila environment native PIO
nanti dikonfigurasi, jalankan `pio test -e native -f test_should_start_alarm`
— ekspektasinya 6/6 PASS karena helper di-defined dan logic identik.

### `mqttCallback` event handling untuk `apd_violation`/`apd_test`

```
$ grep -n "shouldStartAlarm\(millis" alarm_apd/alarm_apd.ino
448:        if (!shouldStartAlarm(millis(), lastAlarmEndedAt, QUIET_WINDOW_MS)) {
```

Anchor di `alarm_apd.ino` ~baris 444–460 (post-fix task 6.2):

```cpp
if (strcmp(event, "apd_violation") == 0 || strcmp(event, "apd_test") == 0) {
  // Bug 4 (firmware) — gating quiet window 10 detik setelah alarm
  // sebelumnya selesai. Mencegah audio APD retrigger tepat setelah
  // alarm gas / APD selesai (lihat design.md Bug 4 Sisi B).
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
  stopAlarm();   // TIDAK di-gate (klausa 3.6)
} else if (strcmp(event, "gas_test") == 0) {
  handleGasAlert(true);   // TIDAK di-gate (out of scope)
}
```

✓ Branch `apd_violation`/`apd_test` sekarang melakukan gating via
`shouldStartAlarm(...)` sebelum memanggil `startAlarm()`, persis seperti
yang dideskripsikan di design.md "Diagram alur Bug 4 (firmware)".

✓ Branch `apd_stop` tetap memanggil `stopAlarm()` langsung tanpa gating
(preservation P11.A — klausa 3.6).

## Property summary (post-fix)

| Property | Sumber pengecekan | Status |
|----------|-------------------|--------|
| Property 8 (fix — dalam window → `false`) | Logic trace cases #1, #2 | ✅ PASS (static) |
| Property 9 (komplemen — di luar window → `true`) | Logic trace cases #3, #4 + edge #5, #6 | ✅ PASS (static, partial — out-of-window cases lengkap) |
| Property 10 (backend default `20` saat unset) | pytest `test_cooldown_seconds_default_is_20_when_env_unset` | ✅ PASS |
| Property 11 (backend env override + preservation `apd_stop`/out-of-window) | pytest 4-case parametrize + static `mqttCallback` | ✅ PASS |

**Catatan:**
- Property 9 disebut "partial confirmation" karena verifikasi via static
  logic equivalence (bukan eksekusi binary native test). Logic yang di-trace
  identik dengan yang akan dieksekusi Unity test runner; ekspektasi run-time
  identik.
- Property 8 dan 10 sudah terkonfirmasi penuh lewat masing-masing channel
  (static trace 100% match + pytest 5/5 PASS).

## Constraint terdokumentasi

- **`pio test` tidak dijalankan** — `alarm_apd/platformio.ini` belum
  mendefinisikan environment `[env:native]`, jadi PlatformIO native test
  runner Unity tidak tersedia. Ini diketahui sebagai keterbatasan
  environment, bukan defect helper.
- Verifikasi firmware Bug 4 dilakukan via static logic equivalence
  (trace 6 case) + grep static-source — kedua sumber kebenaran konsisten
  dengan helper definition di baris 1077–1083.
- Acceptance step 4 (manual hardware: trigger gas, dalam 10 detik kirim
  `apd_violation` → audio APD harus skip) **deferred ke Task 7**
  (acceptance demo end-to-end).

## Status verifikasi Bug 4

| Layer | Verifikasi | Status |
|-------|-----------|--------|
| Backend `config.py` (Property 10) | pytest `test_config.py` 5/5 PASS | ✅ PASS |
| Firmware `shouldStartAlarm` (Property 8, 9) | Static logic trace 6/6 + grep helper | ✅ PASS (static) |
| Firmware `mqttCallback` gating (Property 8) | Static-source `mqttCallback` baris 448–460 | ✅ PASS |
| Manual hardware step 4 acceptance | Deferred | ⏳ TASK 7 |


---

# Post-fix Preservation Verification (Task 6.4)

**Spec:** `dashboard-and-alarm-quickfix` task 6.4.

**Validates:** Requirements 3.5, 3.6, 3.8, 3.9, 3.10 — Property 9 (out-of-window
APD trigger), Property 11 (preservation: `apd_stop` ungated, env override
honored, sub-threshold no-publish, ESP32-disabled skip path).

Section ini mengunci hasil re-run preservation tests dari Task 2d setelah fix
Task 6.1 (`config.py` + `.env.example`) dan Task 6.2 (`alarm_apd.ino` quiet
window) selesai. **Tidak ada perubahan** ke production code di task ini —
hanya verifikasi observasional.

## Pytest re-run — 4/4 PASSED (P11.C, env override preservation)

```
$ python -m pytest tests/test_config.py::TestCooldownEnvOverridePreservation -v

============================ test session starts ============================
platform win32 -- Python 3.13.7, pytest-8.3.4, pluggy-1.6.0
collected 4 items

tests/test_config.py::TestCooldownEnvOverridePreservation::test_cooldown_seconds_respects_env_override[1]  PASSED [ 25%]
tests/test_config.py::TestCooldownEnvOverridePreservation::test_cooldown_seconds_respects_env_override[5]  PASSED [ 50%]
tests/test_config.py::TestCooldownEnvOverridePreservation::test_cooldown_seconds_respects_env_override[10] PASSED [ 75%]
tests/test_config.py::TestCooldownEnvOverridePreservation::test_cooldown_seconds_respects_env_override[60] PASSED [100%]

============================= 4 passed in 0.10s =============================
```

✅ Property 11 (sisi backend) — env override pada nilai `1`, `5`, `10`, `60`
tetap dihormati setelah default literal di `config.py` berubah dari `"2"` →
`"20"` (Task 6.1).

## Static confirmation — P11.A (`apd_stop` ungated)

```
$ grep -n '"apd_stop"' alarm_apd/alarm_apd.ino

458:      } else if (strcmp(event, "apd_stop") == 0) {
477:      if (strcmp(event, "apd_stop") == 0) {
669://   6. Validasi event ∈ {"apd_violation", "apd_test", "apd_stop"}
787:      strcmp(event, "apd_stop")      != 0 &&
942://   - mqttCallback() saat event "apd_stop"
```

**Anchor 1 — `mqttCallback()` topic node (baris 458–460):**

```cpp
} else if (strcmp(event, "apd_stop") == 0) {
  stopAlarm();   // TIDAK di-gate (klausa 3.6)
} else if (strcmp(event, "gas_test") == 0) {
```

**Anchor 2 — `mqttCallback()` control topic (baris 477–479):**

```cpp
if (strcmp(event, "apd_stop") == 0) {
  stopAlarm();
} else if (strcmp(event, "reboot") == 0) {
```

✅ Kedua branch `apd_stop` memanggil `stopAlarm();` **langsung** tanpa
pengecekan `shouldStartAlarm`, tanpa `if (!shouldStart...) return;`, tanpa
guard apapun. Properti P11.A (klausa 3.6) **terpreservasi** setelah fix
Task 6.2.

## Static confirmation — P9 (out-of-window APD trigger)

PlatformIO native test environment **belum dikonfigurasi** di
`alarm_apd/platformio.ini` — verifikasi via static logic equivalence
(sudah dilakukan di Task 6.3, di-konfirmasi ulang di sini).

| # | Test case | Args `(now, lastEndedAt, quietMs)` | Branch yang aktif | Hasil | Expected | ✓ |
|---|---|---|---|---|---|---|
| 3 | `test_at_quiet_window_boundary_returns_true` | `(20000, 10000, 10000)` | `(20000-10000)=10000 >= 10000` | `true` | `true` | ✓ |
| 4 | `test_well_after_quiet_window_returns_true` | `(100000, 10000, 10000)` | `(100000-10000)=90000 >= 10000` | `true` | `true` | ✓ |
| 5 | `test_no_previous_alarm_returns_true` | `(50000, 0, 10000)` | `lastEndedAt == 0` → early return | `true` | `true` | ✓ |
| 6 | `test_millis_overflow_returns_true` | `(100, 4294967200, 10000)` | `now < lastEndedAt` → early return | `true` | `true` | ✓ |

✅ Cases 3, 4, 5, 6 (out-of-window + edge cases) → `shouldStartAlarm` mengembalikan
`true`. Property 9 (preservation di luar window) terpreservasi via static
logic equivalence.

## Static confirmation — P11.D (ESP32-disabled skip) & P11.E (sub-threshold no-publish)

```
$ grep -n "esp32.enabled\|mqtt_topic" ServiceAPDBackend.py

856:                        mqtt_topic = (esp32_cfg.get("mqttTopic") or "").strip()
857:                        esp32_enabled = esp32_cfg.get("enabled", True)
859:                        if not mqtt_topic or not esp32_enabled:
864:                                f"esp32.enabled={esp32_enabled}, mqttTopic={'<empty>' if not mqtt_topic else mqtt_topic!r}"
876:                                self.mqtt_client.publish(mqtt_topic, enc_msg, qos=1)
878:                                    f"[{sektor_name}] MQTT publish ke {mqtt_topic} "
```

✅ Anchor lines 855–867 (skip path) dan publish path 875–881 **identik**
dengan baseline yang didokumentasikan di section P11.D di atas. Task 6.1
hanya menyentuh `config.py` (default literal `"2"` → `"20"`) dan
`.env.example` (entri komentar) — **tidak menyentuh `ServiceAPDBackend.py`**.

P11.D dan P11.E tetap terpreservasi karena fix tidak menyentuh file ini.

## Konfirmasi `ServiceAPDBackend.py` tidak dimodifikasi

Task 6.1 hanya mengubah:

1. `config.py` — satu baris (default literal `"2"` → `"20"`).
2. `.env.example` — entri `COOLDOWN_SECONDS=20` (komentar dokumentasi).

`ServiceAPDBackend.py` **tidak disentuh** oleh Task 6.1. Verifikasi via grep
di atas mengkonfirmasi anchor lines (skip path 855–867, publish path 875–881)
identik dengan baseline. Tidak ada regresi pada P11.D atau P11.E.

## Status preservation post-fix

| Property | Cara verifikasi | Status |
|----------|-----------------|--------|
| P9 — Out-of-window APD trigger (`shouldStartAlarm` returns `true`) | Static logic trace cases 3, 4, 5, 6 | ✅ PASS (static, partial) |
| P11.A — `apd_stop` tidak pernah di-gate | `grep "apd_stop"` + read mqttCallback baris 458, 477 | ✅ PASS |
| P11.C — Env override (backend) | pytest 4/4 PASSED | ✅ PASS |
| P11.D — ESP32-disabled skip | Static `ServiceAPDBackend.py:856–867` unchanged | ✅ PASS |
| P11.E — Sub-threshold no-publish | Static `ServiceAPDBackend.py` publish guard unchanged | ✅ PASS |

## Manual hardware steps — deferred ke Task 7

- **P11.A interruption manual:** Trigger `apd_violation`, biarkan audio
  putaran ke-2, kirim `apd_stop` → audio harus berhenti seketika.
- **P11.B 4 putaran out-of-window manual:** Tunggu >10 detik setelah alarm
  sebelumnya, trigger `apd_violation` → audio APD harus 4 putaran.

Kedua manual hardware steps di atas **deferred ke Task 7** (acceptance demo
end-to-end), karena membutuhkan flashing ESP32 + MQTT broker live.
