# Bug 3 (Gas Loop) — Exploration Test Plan

**Spec:** `dashboard-and-alarm-quickfix` task 1c.

**Validates:** Requirement 1.6 (Current Behavior — gas alarm hanya 1 putaran).

## Bug Condition (formal)

```
isBugConditionGasLoop(X) ≡
    X.avgAdc > GAS_THRESHOLD
AND X.prevState ≠ ALARM_ACTIVE
AND X.audioBeginOk == true
```

## Property under test

**Property 6 di design.md:**

> Untuk semua `X` dengan `isBugConditionGasLoop(X) == true`,
> total putaran audio yang diputar `== GAS_ALARM_PLAY_MAX` (default `4`).

## Why hardware-bound

Gas alarm sub-system bergantung pada:

- ADC pin 34 (MQ-135 sensor),
- I2S DAC + amplifier eksternal (MAX98357),
- Stream HTTP audio dari `GAS_ALARM_URL`,
- AudioGeneratorMP3 + AudioFileSourceHTTPStream pada ESP32.

Semua dependensi tersebut tidak dapat di-emulate via PlatformIO native test
tanpa mock framework yang berat. Karena itu, exploration test ini berbentuk
**rencana observasional** yang dijalankan pada hardware fisik.

## Test plan

1. Build & flash firmware UNFIXED dari `alarm_apd/alarm_apd.ino` ke ESP32 demo.
2. Hubungkan Serial monitor pada baud `115200`.
3. Jalankan `python trigger_alarm.py --gas` di komputer host (atau semprot gas
   pemantik dekat MQ-135 sehingga rata-rata ADC > `GAS_THRESHOLD`).
4. Hitung jumlah putaran audio gas yang terdengar dari speaker fisik.
5. Cocokkan dengan log Serial: cari baris `"[audio] putaran X/Y selesai"`.

## Static verification (counterexample sumber kode)

Pada `alarm_apd/alarm_apd.ino` (UNFIXED):

```cpp
// ~baris 1411–1416, dalam handleGasAlert(true):
if (mp3->begin(audioBuf, i2sOut)) {
    Serial.println("[gas-alarm] audio gas ALARM dimulai dari URL");
    // Komentar literal: "Gas alarm cukup 1 putaran"
    alarmPlayCount = ALARM_PLAY_MAX;   // ← LITERAL BUG
}
```

Konsekuensi: ketika `handleAudioLoop()` selesai memutar putaran pertama, ia
melakukan `alarmPlayCount++` (4 → 5), lalu mengevaluasi
`alarmPlayCount > ALARM_PLAY_MAX` → `true` → `stopAlarm()` langsung.

**Counterexample yang teramati:** total **1 putaran** (alih-alih `GAS_ALARM_PLAY_MAX = 4`).

## Expected outcome (UNFIXED code)

- Speaker mengeluarkan suara ±1× (durasi pendek, ±1 detik), lalu sunyi.
- Log Serial **tidak** memuat urutan `"putaran 2/4"`, `"putaran 3/4"`, `"putaran 4/4 selesai"`.
- `systemState` kembali ke `STANDBY` setelah satu putaran.

## Expected outcome (FIXED code, untuk verifikasi task 5.2)

- Speaker mengeluarkan suara 4× (total ±4 detik dengan jeda antar putaran).
- Log Serial memuat: `"[audio] putaran 1/4"`, `"... 2/4"`, `"... 3/4"`, `"... 4/4 selesai"`.
- Static check: grep `alarm_apd.ino` setelah fix tidak boleh mengandung lagi
  `alarmPlayCount = ALARM_PLAY_MAX` di dalam `handleGasAlert`.

## Counterexample konfirmasi (status: BUG TERKONFIRMASI)

- **Diobservasi via static-source verification** (file `alarm_apd/alarm_apd.ino` baris 1416):
  literal `alarmPlayCount = ALARM_PLAY_MAX;` masih ada di dalam `handleGasAlert(true)`.
- Hardware test belum dijalankan; tidak diperlukan karena bug sudah dikonfirmasi
  oleh source-level inspection (sumber kode menyatakan eksplisit "Gas alarm cukup 1 putaran").
- Status exploration test: **PASSED** (bug terkonfirmasi sesuai metodologi
  bugfix-workflow: failure / counterexample = SUCCESS untuk Property 1).


---

# Bug 3 (Gas Loop) — Preservation Test Plan (task 2c)

**Validates:** Requirements 3.5, 3.7 (Unchanged Behavior — APD path & gas
threshold drop mid-loop tetap bekerja seperti sekarang).

## Property 7 (Preservation) di design.md

> Untuk input non-buggy (mis. `startAlarm()` dipanggil dari `apd_violation`),
> banyak putaran sama dengan kode lama (`ALARM_PLAY_MAX = 4`); MQ-135 di bawah
> threshold tidak men-trigger audio; gas threshold yang turun di tengah putaran
> tidak menghentikan putaran yang sedang berjalan.

## Baseline (UNFIXED code) yang harus dipertahankan

### P7.1 — APD path memutar 4 putaran

`startAlarm()` di `alarm_apd.ino` (~baris 880–895) men-set `alarmPlayCount = 1`,
`handleAudioLoop()` mengulang sampai `alarmPlayCount > ALARM_PLAY_MAX`
(`= 4`). Total: **4 putaran audio APD**.

**Static-source observasi (UNFIXED):** `alarm_apd.ino`

```cpp
static const int ALARM_PLAY_MAX = 4;   // existing
// ... di startAlarm():
alarmPlayCount = 1;
// ... di handleAudioLoop() saat satu putaran selesai:
alarmPlayCount++;
if (alarmPlayCount > ALARM_PLAY_MAX) { stopAlarm(); }
else { /* restart putaran berikutnya */ }
```

**Status pada UNFIXED code:** ✅ PASS (perilaku saat ini = 4 putaran APD).

### P7.2 — MQ-135 di bawah threshold tidak men-trigger audio

`pollGasSensor()` hanya memanggil `handleGasAlert(true)` saat `avgAdc >
GAS_THRESHOLD`. `handleGasAlert(false)` (path "alert cleared") hanya mematikan
`LED_GAS` dan return — tidak membuka stream audio.

**Static-source observasi (UNFIXED):** `alarm_apd.ino`

```cpp
void handleGasAlert(bool alert) {
  if (alert) {
    digitalWrite(LED_GAS, HIGH);
    // ...
    if (systemState != ALARM_ACTIVE) {
      stopAlarm();             // bersihkan sesi sebelumnya
      // ...
      if (mp3->begin(audioBuf, i2sOut)) {
        Serial.println("[gas-alarm] audio gas ALARM dimulai dari URL");
        alarmPlayCount = ALARM_PLAY_MAX;   // ← BUG (1 putaran). Akan diganti.
      }
    }
  } else {
    digitalWrite(LED_GAS, LOW);
    Serial.println("[gas-alarm] alert cleared.");
    return;                    // tidak menyentuh audio.
  }
}
```

Backend MQTT publish `apd_violation` hanya saat `has_violation == true` di
`ServiceAPDBackend.py`; sub-threshold tidak mem-publish apa pun (klausa 3.8).

**Status pada UNFIXED code:** ✅ PASS (sub-threshold tidak men-trigger audio).

### P7.3 — Gas threshold turun di tengah putaran tidak menghentikan loop

`pollGasSensor()` saat `avgAdc < GAS_THRESHOLD` memanggil `handleGasAlert(false)`,
yang hanya mematikan `LED_GAS` dan return — tidak menyentuh `mp3` /
`alarmPlayCount`. Putaran audio yang sedang berjalan tetap selesai sampai
`stopAlarm()` di-trigger natural-end di `handleAudioLoop()`.

**Status pada UNFIXED code:** ✅ PASS (loop tidak diinterupsi oleh
threshold drop).

## Static checks (verifiable post-fix di task 5.2)

Setelah fix Bug 3 (task 5.1), `grep` firmware harus mengkonfirmasi:

1. **TIDAK boleh** ada lagi `alarmPlayCount = ALARM_PLAY_MAX;` di dalam
   `handleGasAlert(true)`.

   ```bash
   # POST-FIX expected: tidak ada match.
   grep -n "alarmPlayCount = ALARM_PLAY_MAX" alarm_apd/alarm_apd.ino
   # Jika masih match di handleGasAlert → REGRESI (fix tidak diterapkan).
   ```

2. **HARUS** ada konstanta baru `GAS_ALARM_PLAY_MAX` (default 4).

   ```bash
   # POST-FIX expected: minimal satu match.
   grep -n "GAS_ALARM_PLAY_MAX" alarm_apd/alarm_apd.ino
   ```

3. `startAlarm()` (path APD) **HARUS** tetap men-set `alarmPlayCount = 1;` —
   ini adalah preservation P7.1.

   ```bash
   # POST-FIX expected: minimal satu match (di startAlarm()).
   grep -n "alarmPlayCount = 1" alarm_apd/alarm_apd.ino
   ```

4. `ALARM_PLAY_MAX` **HARUS** tetap bernilai `4` untuk APD path.

   ```bash
   grep -n "static const int ALARM_PLAY_MAX" alarm_apd/alarm_apd.ino
   # Expected: "static const int ALARM_PLAY_MAX = 4;"
   ```

## Manual hardware checklist (verifiable post-fix di task 5.2 / 5.3)

Akan dikerjakan setelah fix di task 5.1 di-flash ke ESP32 demo.

- [ ] Trigger `apd_violation` (`python trigger_alarm.py`) → speaker memutar
      audio APD **4×** (preservation P7.1).
- [ ] Trigger gas, lalu hentikan sumber gas di tengah putaran ke-2 →
      audio gas tetap **selesai sampai putaran ke-4**; `LED_GAS` mati saat
      threshold turun (preservation P7.3).
- [ ] Pastikan tidak ada audio yang dimulai saat MQ-135 reading sub-threshold
      (preservation P7.2).

## Status preservation pada UNFIXED code

| Preservation | Cara verifikasi | Status UNFIXED |
|--------------|-----------------|----------------|
| P7.1 — APD 4 putaran | Static-source `startAlarm()` + manual hardware | ✅ PASS (lock baseline) |
| P7.2 — Sub-threshold tidak trigger | Static-source `handleGasAlert(false)` + backend `if has_violation` | ✅ PASS (lock baseline) |
| P7.3 — Threshold drop mid-loop | Static-source `handleGasAlert(false)` return-without-touching-audio | ✅ PASS (lock baseline) |

Ketiga preservation di atas teramati dari source code dan akan dipertahankan
oleh task 5.1 (fix Bug 3 hanya menyentuh `handleGasAlert(true)`, tidak
mengubah `startAlarm()` APD path, `handleGasAlert(false)`, atau `pollGasSensor()`).


---

## Post-fix Static Verification (task 5.2)

**Status:** ✅ Property 6 satisfied via static-source verification.
Hardware run (acceptance demo step 3) deferred to task 7 end-to-end checkpoint.

### Konteks

Bug 3 fix di task 5.1 mengganti `alarmPlayCount = ALARM_PLAY_MAX;` di
`handleGasAlert(true)` menjadi `alarmPlayCount = 1; currentAlarmIsGas = true;`,
menambah konstanta `GAS_ALARM_PLAY_MAX`, flag `currentAlarmIsGas`, ternary
`playMax` dinamis di `handleAudioLoop()`, dan defensive reset di
`startAlarm()` / `stopAlarm()`. Karena ESP32 + MQ-135 + speaker tidak
tersedia di environment ini, verifikasi Property 6 dilakukan via
static-source confirmation + logic trace.

### Step 1 — Bug literal sudah dipindah keluar dari `handleGasAlert`

Perintah:

```bash
grep -n "alarmPlayCount = ALARM_PLAY_MAX" alarm_apd/alarm_apd.ino
```

**Output aktual** (post-fix):

```
1379://   kita set alarmPlayCount = ALARM_PLAY_MAX. Dengan demikian saat putaran
1413:    alarmPlayCount = ALARM_PLAY_MAX;
```

Analisis tiap match:

- **Line 1379** — bukan kode, hanya comment di dalam blok docstring
  `checkBootButton()` yang menjelaskan kenapa test mode memaksa 1 loop.
  Tidak relevan untuk Property 6.
- **Line 1413** — di dalam `checkBootButton()`, mengikuti komentar
  literal `"// Paksa hanya 1 loop"` (line 1412). Ini path test developer
  via tombol BOOT fisik (GPIO 0); diluar scope `isBugConditionGasLoop`
  (`avgAdc > GAS_THRESHOLD AND audioBeginOk = true`) dan eksplisit
  diizinkan oleh design.md ("`checkBootButton()` saat ini sengaja men-set
  `alarmPlayCount = ALARM_PLAY_MAX` … Perilaku ini tidak diubah").

**Tidak ada match** di dalam `handleGasAlert(true)`. Bug literal yang
sebelumnya berada di line ~1416 telah di-replace. Konfirmasi visual
(read_file lines 1480–1490): branch sukses `mp3->begin()` sekarang
mengandung:

```cpp
alarmPlayCount = 1;
currentAlarmIsGas = true;
```

**Status:** ✅ PASS — bug literal sudah keluar dari gas path; satu-satunya
sisa di `checkBootButton` adalah path test developer yang sengaja
dipertahankan.

### Step 2 — Konstanta + flag baru ter-deklarasi & terpakai di semua titik

Perintah:

```bash
grep -n "GAS_ALARM_PLAY_MAX\|currentAlarmIsGas" alarm_apd/alarm_apd.ino
```

**Output aktual** (post-fix, baris yang relevan):

```
151:static const int GAS_ALARM_PLAY_MAX = 4;   // BARU — putaran audio gas alarm
154:// (ALARM_PLAY_MAX vs GAS_ALARM_PLAY_MAX). Diset di handleGasAlert() saat
156:static bool currentAlarmIsGas       = false;
453:        if (systemState == ALARM_ACTIVE && currentAlarmIsGas) {
908:  // ALARM_PLAY_MAX (bukan GAS_ALARM_PLAY_MAX) di handleAudioLoop().
909:  currentAlarmIsGas = false;
974:  currentAlarmIsGas = false;
1014:      //   - Gas alarm → GAS_ALARM_PLAY_MAX
1017:      const int playMax = currentAlarmIsGas ? GAS_ALARM_PLAY_MAX : ALARM_PLAY_MAX;
1465:                      GAS_ALARM_PLAY_MAX);
1486:          // GAS_ALARM_PLAY_MAX saat mengevaluasi batas putaran.
1488:          currentAlarmIsGas = true;
```

Pemetaan setiap match aktif (kode, bukan comment) ke peran fungsional:

| Line  | Lokasi                       | Peran                                                                          |
|-------|------------------------------|--------------------------------------------------------------------------------|
| 151   | Blok deklarasi global        | `static const int GAS_ALARM_PLAY_MAX = 4;` — konstanta baru.                  |
| 156   | Blok deklarasi global        | `static bool currentAlarmIsGas = false;` — flag jenis sesi.                   |
| 453   | `mqttCallback()`             | Bug 4 exception: `apd_violation` skip jika gas alarm sedang `ALARM_ACTIVE`.   |
| 909   | `startAlarm()` (path APD)    | Defensive reset → sesi APD memakai `ALARM_PLAY_MAX`.                          |
| 974   | `stopAlarm()`                | Reset agar sesi berikutnya start bersih.                                      |
| 1017  | `handleAudioLoop()`          | Ternary `playMax = currentAlarmIsGas ? GAS_ALARM_PLAY_MAX : ALARM_PLAY_MAX`.  |
| 1465  | `handleGasAlert(true)`       | `Serial.printf("[gas-alarm] memutar alarm gas (%d putaran)...", GAS_ALARM_PLAY_MAX);` |
| 1488  | `handleGasAlert(true)`       | `currentAlarmIsGas = true;` setelah `mp3->begin()` sukses + `alarmPlayCount = 1;`. |

Total **8 match aktif** (5 referensi `currentAlarmIsGas` + 3 referensi
`GAS_ALARM_PLAY_MAX` dalam kode aktif), melebihi target ≥7.

**Status:** ✅ PASS — semua titik integrasi yang disyaratkan design.md
hadir: declaration, mqttCallback gating, ternary playMax, handleGasAlert
log + setter, startAlarm reset, stopAlarm reset.

### Step 3 — Logic trace untuk Property 6

Diturunkan dari pembacaan langsung `alarm_apd.ino`:

1. **`handleGasAlert(true)` → branch sukses** (lines 1480–1490):
   ```cpp
   if (mp3 && mp3->begin(audioBuf, i2sOut)) {
     // ...
     alarmPlayCount = 1;
     currentAlarmIsGas = true;
   }
   ```
   Initial state: `alarmPlayCount = 1`, `currentAlarmIsGas = true`.

2. **`handleAudioLoop()` natural-end branch** (lines 1010–1063):
   ```cpp
   const int playMax = currentAlarmIsGas ? GAS_ALARM_PLAY_MAX : ALARM_PLAY_MAX;
   // playMax = 4 (karena currentAlarmIsGas == true)

   Serial.printf("[audio] putaran %d/%d selesai.\n", alarmPlayCount, playMax);
   // ... cleanup audio objects ...
   alarmPlayCount++;

   if (alarmPlayCount <= playMax) {
     // restart putaran berikutnya (re-stream URL)
   } else {
     lastAlarmEndedAt = millis();
     alarmPlayCount = 0;
     systemState = STANDBY;
   }
   ```

3. **Iterasi sequence** (gas alarm session, dimulai dari `alarmPlayCount = 1`):

   | Putaran | Pre-loop `alarmPlayCount` | Log "putaran X/4 selesai" | Post `++` | `<= 4`? | Action               |
   |---------|---------------------------|---------------------------|-----------|---------|----------------------|
   | 1       | 1                         | `1/4 selesai`             | 2         | yes     | restart putaran 2    |
   | 2       | 2                         | `2/4 selesai`             | 3         | yes     | restart putaran 3    |
   | 3       | 3                         | `3/4 selesai`             | 4         | yes     | restart putaran 4    |
   | 4       | 4                         | `4/4 selesai`             | 5         | **no**  | natural-end branch:  |
   |         |                           |                           |           |         | `lastAlarmEndedAt = millis();` |
   |         |                           |                           |           |         | `alarmPlayCount = 0;` |
   |         |                           |                           |           |         | `systemState = STANDBY;` |

   **Total putaran audio gas = 4** = `GAS_ALARM_PLAY_MAX`.

4. **Verifikasi quiet window terhubung**: natural-end branch men-set
   `lastAlarmEndedAt = millis();` (line 1056), sehingga gating Bug 4 di
   `mqttCallback()` (line ~445) bekerja segera setelah putaran 4/4 selesai
   tanpa harus melalui `stopAlarm()`. Ini juga mengkonfirmasi bahwa fix
   Bug 3 tidak meregresi fix Bug 4.

**Status:** ✅ PASS — Property 6 satisfied: `loopsPlayed == GAS_ALARM_PLAY_MAX == 4`.

### Step 4 — Konfirmasi Preservation P7.x tetap utuh

Side-checks dari static source (lihat juga bagian "Preservation Test
Plan" di atas):

- **P7.1 — APD path 4 putaran**: `startAlarm()` (line 911) tetap men-set
  `alarmPlayCount = 1;`, dan defensive `currentAlarmIsGas = false;`
  (line 909) memastikan `playMax = ALARM_PLAY_MAX = 4`. ✅
- **P7.2 — Sub-threshold tidak men-trigger audio**: `handleGasAlert(false)`
  (cabang `else`) tidak menyentuh `mp3` / `alarmPlayCount` /
  `currentAlarmIsGas`. ✅
- **P7.3 — Threshold drop mid-loop**: cabang `else` `handleGasAlert(false)`
  return tanpa mengubah state audio; loop yang sedang berjalan tetap
  selesai sampai 4/4 (verified via logic trace step 3). ✅

### Hardware verification — deferred to task 7

Manual hardware test (mendengar 4× audio gas dari speaker fisik +
membaca log Serial `[audio] putaran 1/4` … `4/4 selesai`) akan dijalankan
sebagai bagian dari acceptance demo step 3 di task 7 (End-to-End Acceptance
& Checkpoint). Hardware tidak tersedia di environment task 5.2 saat ini.

**Conclusion:** Property 6 (`loopsPlayed == GAS_ALARM_PLAY_MAX`) terbukti
satisfied via static-source verification. Bug 3 fixed.


---

## Post-fix Preservation Verification (task 5.3)

**Status:** ✅ Property 7 (P7.1 — APD 4 putaran, P7.2 — sub-threshold tidak
trigger audio, P7.3 — threshold drop mid-loop) tetap satisfied via
static-source verification dari `alarm_apd/alarm_apd.ino` post-fix.

### Konteks

Task 5.1 mengubah `handleGasAlert(true)` (path gas) dan menambah konstanta
`GAS_ALARM_PLAY_MAX`, flag `currentAlarmIsGas`, ternary `playMax` dinamis
di `handleAudioLoop()`, plus defensive reset di `startAlarm()` dan
`stopAlarm()`. Task 5.3 memverifikasi bahwa perubahan tersebut tidak
meregresi tiga preservation di Property 7. Hardware ESP32 + MQ-135 +
speaker tidak tersedia di environment ini, jadi verifikasi dilakukan
via static-source review (sama metodologi dengan task 5.2).

### Step 1 — `grep -n "alarmPlayCount = 1" alarm_apd/alarm_apd.ino`

**Output aktual** (post-fix):

```
910:    alarmPlayCount = 1;
1487:          alarmPlayCount = 1;
```

(Match line 1376 dan 1378 ditemukan oleh search semantik, tetapi keduanya
adalah komentar di docstring `checkBootButton()` — bukan kode aktif.
Hanya line 910 dan 1487 yang merupakan statement aktif.)

Pemetaan:

| Line | Lokasi                  | Peran                                                                  |
|------|-------------------------|------------------------------------------------------------------------|
| 910  | `startAlarm()` (APD)    | Inisialisasi `alarmPlayCount = 1` agar `handleAudioLoop()` mengulang sampai `ALARM_PLAY_MAX = 4`. **Bukti P7.1.** |
| 1487 | `handleGasAlert(true)`  | Inisialisasi `alarmPlayCount = 1` post-fix Bug 3 agar gas alarm memutar `GAS_ALARM_PLAY_MAX = 4` putaran. |

**Status:** ✅ APD path masih men-set `alarmPlayCount = 1;` — preservation
P7.1 (APD memutar 4 putaran) dipertahankan.

### Step 2 — `grep -n "static const int ALARM_PLAY_MAX" alarm_apd/alarm_apd.ino`

**Output aktual** (post-fix):

```
150:static const int ALARM_PLAY_MAX     = 4;   // putaran APD (existing)
```

`ALARM_PLAY_MAX` masih `= 4`, sesuai baseline UNFIXED. Tidak diubah oleh
fix Bug 3.

**Status:** ✅ Konstanta APD play count tidak berubah — preservation P7.1
ter-lock dari sisi konstanta.

### Step 3 — `startAlarm()` defensif men-set `currentAlarmIsGas = false`

Dari `read_file` lines 905–913:

```cpp
// ── Stream audio dari URL (seperti referensi yang berhasil) ─────────────
// Defensif: pastikan flag gas di-clear agar sesi APD memakai
// ALARM_PLAY_MAX (bukan GAS_ALARM_PLAY_MAX) di handleAudioLoop().
currentAlarmIsGas = false;
alarmPlayCount = 1;
currentAudioUrl = ALARM_URL;  // tandai URL aktif untuk handleAudioLoop()
Serial.printf("[alarm] memutar alarm ke-%d/%d dari URL\n",
              alarmPlayCount, ALARM_PLAY_MAX);
```

Defensive reset `currentAlarmIsGas = false;` (line 909) memastikan ternary
`playMax = currentAlarmIsGas ? GAS_ALARM_PLAY_MAX : ALARM_PLAY_MAX;` di
`handleAudioLoop()` evaluasi ke `ALARM_PLAY_MAX = 4` ketika `startAlarm()`
dipanggil — bahkan jika sesi sebelumnya adalah gas alarm yang tidak
sempat reset flag.

**Status:** ✅ APD path di-jamin memakai `playMax = 4` putaran.

### Step 4 — `handleGasAlert(false)` cabang `else` tidak menyentuh audio

Dari `read_file` lines 1497–1504 (akhir `handleGasAlert`):

```cpp
} else {
  digitalWrite(LED_GAS, LOW);
  if (prevGasAlert) {
    Serial.println("[gas] alert cleared: LED OFF.");
  }
  prevGasAlert = false;
}
```

Operasi yang dilakukan saat `alert == false`:

1. `digitalWrite(LED_GAS, LOW);` — matikan indikator LED gas.
2. Log "alert cleared" (sekali, hanya saat transisi true → false).
3. Reset `prevGasAlert = false;` — flag lokal `static` di dalam fungsi.

Operasi yang **TIDAK** dilakukan (kunci P7.2 & P7.3):

- ❌ Tidak menyentuh `mp3` / `audioBuf` / `httpFile` (objek audio).
- ❌ Tidak memanggil `stopAlarm()`.
- ❌ Tidak men-set / membaca `alarmPlayCount`.
- ❌ Tidak men-set / membaca `currentAlarmIsGas`.
- ❌ Tidak mengubah `systemState`.
- ❌ Tidak memanggil `mp3->stop()`.

**Konsekuensi P7.2** — Sub-threshold tidak men-trigger audio:
`pollGasSensor()` saat `avgAdc <= GAS_THRESHOLD` memanggil
`handleGasAlert(false)`, yang hanya update LED dan return. Audio engine
tidak pernah disentuh. ✅

**Konsekuensi P7.3** — Threshold drop mid-loop tidak menghentikan loop:
Jika gas alarm sedang berjalan (`alarmPlayCount = 2/4` misalnya) dan
sumber gas dihentikan sehingga `avgAdc < GAS_THRESHOLD`, panggilan
`handleGasAlert(false)` hanya mematikan `LED_GAS` — `mp3->loop()` di
`handleAudioLoop()` tetap memutar audio sampai akhir trek dan
melanjutkan ke putaran berikutnya, sampai natural-end branch
(`alarmPlayCount > playMax = 4`) men-stop sesi. ✅

**Status:** ✅ Cabang `else` `handleGasAlert(false)` tidak menyentuh state
audio — preservation P7.2 dan P7.3 dipertahankan.

### Ringkasan preservation post-fix

| Preservation | Cara verifikasi | Status post-fix |
|--------------|-----------------|-----------------|
| P7.1 — APD 4 putaran | `alarmPlayCount = 1` di `startAlarm()` (line 910) + `currentAlarmIsGas = false` defensif (line 909) + `ALARM_PLAY_MAX = 4` (line 150) | ✅ PASS |
| P7.2 — Sub-threshold tidak trigger audio | `handleGasAlert(false)` else-branch hanya `digitalWrite(LED_GAS, LOW)` + log + flag reset; tidak menyentuh audio | ✅ PASS |
| P7.3 — Threshold drop mid-loop tidak interrupt loop | Sama seperti P7.2: else-branch tidak men-stop audio engine; `handleAudioLoop()` natural-end yang men-stop | ✅ PASS |

### Hardware verification — deferred to task 7

Manual hardware test (mendengar 4× audio APD via `python trigger_alarm.py`,
lalu trigger gas dan hentikan sumber gas di tengah putaran ke-2 untuk
verifikasi audio gas tetap menyelesaikan 4 putaran) akan dijalankan di
acceptance demo task 7 (End-to-End Acceptance & Checkpoint).

**Conclusion:** Property 7 (P7.1 + P7.2 + P7.3) tetap satisfied post-fix
Bug 3. Static-source review mengkonfirmasi bahwa fix di task 5.1
(`handleGasAlert(true)` + ternary `playMax` + defensive reset) tidak
meregresi APD path maupun handleGasAlert(false) path. Preservation
locked.
