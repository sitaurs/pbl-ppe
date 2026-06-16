# Bugfix Requirements Document

## Introduction

Selama uji lapangan PBL pada sistem **SafeGuard APD** (deteksi PPE YOLO di backend Python + dashboard Next.js + firmware ESP32 alarm), ditemukan empat bug yang saling terhubung dan memengaruhi alur monitor → notifikasi → alarm fisik. Spec ini me-bundle keempatnya dalam satu siklus perbaikan karena cakupan kode kecil, semuanya sudah terkonfirmasi melalui pembacaan source, dan keempatnya saling tumpang-tindih saat skenario demo end-to-end.

Empat bug yang dicakup:

1. **Bug 1 — CSRF token hilang pada `POST /api/nodes/test-connection`** (dashboard `/nodes`). Tombol "Test Camera" / "Test MQTT" di tree view memakai `fetch` mentah tanpa `X-CSRF-Token`, sehingga middleware membalas `403 csrf_token_invalid` dan spinner berputar selamanya.
2. **Bug 2 — Nama PIC dan nomor WhatsApp PIC tidak bisa di-input/edit di mana pun** (dashboard). Kolom `Node.picName` / `Node.picPhone` ada di skema dan dipakai backend Python untuk dispatch WhatsApp, tapi wizard meng-hardcode keduanya menjadi string kosong → alert WA tidak pernah punya tujuan.
3. **Bug 3 — Alarm gas hanya berbunyi 1 putaran** (firmware). `handleGasAlert()` sengaja men-set `alarmPlayCount = ALARM_PLAY_MAX` sehingga `handleAudioLoop()` langsung berhenti. Seharusnya 4 putaran seperti alarm APD (atau jumlah putaran yang dapat dikonfigurasi).
4. **Bug 4 — Alarm APD langsung menyala tepat setelah alarm gas selesai** (firmware + backend). Backend mem-publish `apd_violation` setiap `COOLDOWN_SECONDS = 2` detik (terlalu agresif) dan firmware tidak punya quiet window setelah alarm sebelumnya selesai, sehingga MP3 APD langsung di-stream begitu MP3 gas berhenti.

Semua bug ini dianggap "buggy input" yang spesifik dan terbatas; perilaku non-buggy (alur live monitor `/api/monitor/stream` via GET, alarm APD normal, alarm gas yang sukses men-trigger LED + buzzer) wajib dipertahankan apa adanya.

> **Catatan scope.** Out-of-scope dan akan dibahas di spec lain: peningkatan akurasi deteksi (temporal smoothing / bbox filter), badge gas di `/monitor` & dashboard home, push threshold ke ESP32, WiFi manager portal, dan optimasi performa. Spec ini dijaga sempit pada empat bug condition di atas.

---

## Bug Analysis

### Current Behavior (Defect)

Perilaku yang sedang terjadi di kode saat ini, tergroup per bug.

**Bug 1 — CSRF token hilang pada `/api/nodes/test-connection` (NodeTable):**

1.1 WHEN seorang user yang sudah login menekan tombol "Test Camera" pada tree view di halaman `/nodes` THEN `NodeTable.handleTestConnection` memanggil `fetch('/api/nodes/test-connection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ... })` tanpa header `X-CSRF-Token`, middleware membalas HTTP 403 dengan body `{ "error": "csrf_token_invalid" }`, dan UI menampilkan spinner yang tidak pernah selesai.

1.2 WHEN seorang user yang sudah login menekan tombol "Test MQTT" pada tree view di halaman `/nodes` THEN `NodeTable.handleTestConnection` mengirim `POST /api/nodes/test-connection` tanpa header `X-CSRF-Token`, middleware membalas HTTP 403 `{ "error": "csrf_token_invalid" }`, dan UI menampilkan spinner yang tidak pernah selesai.

**Bug 2 — Field PIC name / PIC phone tidak bisa di-input atau di-edit:**

1.3 WHEN user membuat node baru lewat NodeWizard THEN `buildNodeDataFromWizardState` menetapkan `picName: initialData?.picName || ''` dan `picPhone: initialData?.picPhone || ''`, sehingga node tersimpan dengan `picName === ''` dan `picPhone === ''` karena Step 1 wizard (`StepSectorInfo`) tidak menyediakan input untuk kedua field tersebut.

1.4 WHEN user mengedit node yang sudah ada lewat NodeWizard THEN tidak ada UI untuk mengubah `picName` / `picPhone`; nilai-nilai tersebut hanya bisa berubah jika `initialData` membawanya dari sumber lain, sehingga dalam praktik UI tidak pernah bisa men-set/mengubah keduanya.

1.5 WHEN backend Python (`ServiceAPDBackend.py`) memproses pelanggaran APD pada node yang dibuat via dashboard THEN `node.get("picPhone")` mengembalikan string kosong, branch `if pic_phone` evaluate ke `False`, log mencatat `"Tidak ada nomor WA terdaftar."`, dan tidak ada notifikasi WhatsApp yang dikirim ke siapa pun.

**Bug 3 — Alarm gas hanya berbunyi 1 putaran:**

1.6 WHEN MQ-135 average ADC melewati `GAS_THRESHOLD` dan `handleGasAlert(true)` berhasil men-start sesi audio dengan `mp3->begin(audioBuf, i2sOut) == true` THEN kode menetapkan `alarmPlayCount = ALARM_PLAY_MAX` (komentar: "Gas alarm cukup 1 putaran"), sehingga setelah satu putaran `handleAudioLoop()` melakukan `alarmPlayCount++` → `alarmPlayCount > ALARM_PLAY_MAX` → langsung `stopAlarm()`, total hanya 1 putaran.

**Bug 4 — Alarm APD menyala langsung setelah alarm gas selesai:**

1.7 WHEN alarm gas baru saja selesai (state kembali ke `STANDBY`) DAN backend Python masih mem-publish event `apd_violation` ke topik node THEN firmware memanggil `startAlarm()` segera tanpa pengecekan jeda; audio APD ter-stream dari URL dan diputar walau hanya beberapa detik setelah gas alarm berhenti.

1.8 WHEN frame deteksi mengandung `has_violation == true` (mis. operator close-up tanpa rompi terdeteksi) THEN backend mem-publish pesan `apd_violation` setiap `COOLDOWN_SECONDS == 2` detik (default `config.py`), menghasilkan stream notifikasi yang sangat agresif; ini memperbesar peluang firmware menerima `apd_violation` tepat setelah gas alarm selesai.

### Expected Behavior (Correct)

Perilaku yang seharusnya, setiap klausa di sini berkorespondensi dengan klausa Current Behavior bernomor sama (offset +1 di section).

**Bug 1 — CSRF token harus ikut pada quick-action `/nodes`:**

2.1 WHEN seorang user yang sudah login menekan tombol "Test Camera" pada tree view di halaman `/nodes` THEN `NodeTable.handleTestConnection` SHALL mengirim `POST /api/nodes/test-connection` dengan header `X-CSRF-Token` valid (mis. dengan memakai `useApiFetch()` dari `@/hooks/use-csrf-token`), middleware SHALL meneruskan request ke handler, dan UI SHALL menampilkan hasil koneksi (`ok` / `failed` / pesan error) lalu menghentikan spinner.

2.2 WHEN seorang user yang sudah login menekan tombol "Test MQTT" pada tree view di halaman `/nodes` THEN `NodeTable.handleTestConnection` SHALL mengirim `POST /api/nodes/test-connection` dengan header `X-CSRF-Token` valid, request SHALL melewati middleware tanpa 403, dan UI SHALL menampilkan hasil tes (kuantitas `ok` / `failed` + pesan) lalu menghentikan spinner.

**Bug 2 — Field PIC name / PIC phone harus bisa di-input dan di-edit:**

2.3 WHEN user membuat node baru lewat NodeWizard THEN wizard SHALL menampilkan input "Nama PIC" (free text) dan "No WhatsApp PIC" (telepon) di langkah pertama atau langkah lain yang jelas terlihat; SHALL melakukan validasi non-kosong + format telepon Indonesia (8–15 digit setelah normalisasi, hanya digit) jika user ingin alert WA aktif; SHALL melakukan auto-normalization nomor dengan aturan:
- prefix `+62` → `62`
- prefix `0` → `62`
- prefix `62` tetap `62`
- selain itu (langsung digit, mis. `81358959349`) dianggap valid dan diberi prefix `62`
- karakter non-digit (spasi, `-`, `.`) dibuang sebelum aturan di atas;
SHALL menyimpan `picName` dan `picPhone` (hasil normalisasi) ke kolom `Node.picName` / `Node.picPhone` di database via `POST /api/nodes`.

2.4 WHEN user mengedit node lewat NodeWizard THEN wizard SHALL menampilkan nilai `picName` dan `picPhone` saat ini sebagai prefill, SHALL mengizinkan user mengubah keduanya (termasuk mengosongkan jika user secara eksplisit memilih opt-out alert WA), dan SHALL menyimpan perubahan via `PUT /api/nodes/{id}` ke kolom `Node.picName` / `Node.picPhone`. Mengosongkan `picPhone` SHALL diizinkan tetapi UI SHALL menampilkan peringatan "Alert WhatsApp tidak akan dikirim untuk node ini" agar user sadar konsekuensinya.

2.5 WHEN backend Python (`ServiceAPDBackend.py`) memproses pelanggaran APD pada node yang `picPhone`-nya sudah diisi via dashboard THEN `node.get("picPhone")` SHALL mengembalikan nomor format `62…` (hasil normalisasi UI), branch `if pic_phone` SHALL evaluate ke `True`, dan `send_whatsapp_alert(pic_phone, …)` SHALL dipanggil dengan nomor tersebut.

**Bug 3 — Alarm gas harus berbunyi 4 putaran (atau sebanyak konstanta yang dikonfigurasi):**

2.6 WHEN MQ-135 average ADC melewati `GAS_THRESHOLD` dan `handleGasAlert(true)` berhasil men-start sesi audio THEN firmware SHALL men-set `alarmPlayCount = 1` (analog dengan `startAlarm()` APD), sehingga `handleAudioLoop()` mengulang stream audio gas hingga `alarmPlayCount > GAS_ALARM_PLAY_MAX`, di mana `GAS_ALARM_PLAY_MAX` adalah konstanta `#define` baru dengan default `4`. Dengan begitu alarm gas total berbunyi 4 putaran sebelum kembali ke `STANDBY`.

**Bug 4 — Alarm APD tidak menyala langsung setelah alarm gas selesai:**

2.7 WHEN sebuah alarm (gas atau APD) selesai dan firmware kembali ke `STANDBY` THEN firmware SHALL menyimpan `lastAlarmEndedAt = millis()`. Saat `startAlarm()` dipanggil oleh `mqttCallback()` untuk event `apd_violation`/`apd_test`, firmware SHALL mengevaluasi `(millis() - lastAlarmEndedAt) < QUIET_WINDOW_MS` (default `QUIET_WINDOW_MS = 10000`); JIKA benar, SHALL menolak/melewatkan pemanggilan (return tanpa men-stream audio, log "[alarm] skip — quiet window aktif") dan tidak mengubah `systemState`. Quiet window berlaku untuk APD dan gas dengan satu pengecualian: jika gas alarm sedang aktif (state `ALARM_ACTIVE` karena gas), `apd_violation` SHALL tidak menginterupsi; gas alarm SHALL diizinkan selesai.

2.8 WHEN backend Python mendeteksi `has_violation == true` THEN backend SHALL membaca `COOLDOWN_SECONDS` dari environment variable `COOLDOWN_SECONDS` dengan default baru `20` detik (sebelumnya `2`); pesan `apd_violation` SHALL hanya di-publish jika `(current_time - last_notification_time) > COOLDOWN_SECONDS`. Default `20` SHALL juga didokumentasikan di `.env.example`.

### Unchanged Behavior (Regression Prevention)

Perilaku yang tidak terkait empat bug di atas wajib bekerja persis seperti sebelumnya.

**Dashboard non-`/nodes` quick-action paths:**

3.1 WHEN user membuka halaman `/monitor/[id]` dan stream MJPEG dimuat via `<img src="/api/monitor/stream/[id]">` (request GET) THEN middleware SHALL CONTINUE TO meneruskan request tanpa pemeriksaan CSRF (GET dikecualikan), stream SHALL CONTINUE TO mengalir, dan tidak ada perubahan perilaku live monitor.

3.2 WHEN user mengoperasikan NodeWizard untuk Step Camera, Step ESP32, Step Detection, atau Step Review (di luar field PIC) THEN field-field tersebut (`cameraSource`, `camera`, `esp32`, `detection`, dst.) SHALL CONTINUE TO divalidasi dan disimpan persis seperti sekarang; behavior composition nullification (camera/detection null saat camera di-skip; esp32 null saat ESP32 di-skip) SHALL CONTINUE TO bekerja.

3.3 WHEN user menggunakan NodeWizard versi sebelum perubahan (mis. unit test yang memanggil `useApiFetch()` untuk tombol Test Camera/Test MQTT internal wizard) THEN tombol-tombol Test internal wizard tersebut SHALL CONTINUE TO bekerja, karena perbaikan Bug 1 hanya menambah CSRF token pada path `/nodes` table-tree (NodeTable), tidak mengubah `useApiFetch()` itu sendiri.

3.4 WHEN node memiliki `picName` non-kosong dan `picPhone` non-kosong yang sudah dalam format `62xxxxxxxxxx` (mis. data lama yang di-seed langsung ke DB) THEN normalisasi UI SHALL CONTINUE TO membaca nilai apa adanya tanpa mengubah, dan backend Python SHALL CONTINUE TO mengirim WhatsApp seperti biasa.

**Firmware non-buggy paths:**

3.5 WHEN `mqttCallback()` menerima event `apd_violation` lebih dari `QUIET_WINDOW_MS` setelah alarm sebelumnya selesai THEN firmware SHALL CONTINUE TO memanggil `startAlarm()` dan memutar 4 putaran audio APD seperti perilaku awal.

3.6 WHEN `mqttCallback()` menerima event `apd_stop` THEN firmware SHALL CONTINUE TO memanggil `stopAlarm()` dan langsung membersihkan sesi audio + mereset `alarmPlayCount`, tanpa terblokir oleh quiet window.

3.7 WHEN MQ-135 average ADC turun di bawah `GAS_THRESHOLD` setelah sebelumnya `handleGasAlert(true)` aktif THEN firmware SHALL CONTINUE TO mematikan `LED_GAS` dan log "alert cleared", tanpa mengubah audio yang sedang berjalan; jika audio gas masih dalam putaran ke-N, putaran SHALL CONTINUE TO selesai sampai `GAS_ALARM_PLAY_MAX` tercapai.

3.8 WHEN MQ-135 menghasilkan reading di bawah threshold dan tidak ada violation APD THEN backend Python SHALL CONTINUE TO tidak mem-publish `apd_violation`, dan firmware SHALL CONTINUE TO berada di `STANDBY` tanpa memutar audio apa pun — perubahan `COOLDOWN_SECONDS` dari `2` ke `20` tidak boleh memunculkan side-effect lain selain memperjarang publish saat `has_violation == true`.

**Backend non-buggy paths:**

3.9 WHEN environment variable `COOLDOWN_SECONDS` di-set ke nilai eksplisit (mis. `5`) di `.env` THEN backend SHALL CONTINUE TO menghormati nilai tersebut; default `20` hanya berlaku jika variabel tidak di-set sama sekali.

3.10 WHEN node memiliki `esp32.enabled == false` atau `esp32.mqttTopic` kosong THEN backend SHALL CONTINUE TO men-skip MQTT publish (perilaku saat ini di `ServiceAPDBackend.py`) tanpa berubah; perubahan `COOLDOWN_SECONDS` tidak menyentuh logika ini.

---

## Deriving the Bug Conditions

Karena ini bundle empat bug, ada empat fungsi `isBugCondition` dan empat properti, masing-masing dengan koresponden Fix dan Preservation.

### Bug 1 — CSRF token hilang pada NodeTable test-connection

```pascal
FUNCTION isBugConditionCsrf(X)
  INPUT: X = QuickActionTestRequest {
    page: '/nodes' | '/nodes/wizard' | other,
    button: 'TestCamera' | 'TestMQTT' | other,
    method: 'POST' | 'GET' | other,
    csrfHeaderPresent: boolean,
    userAuthenticated: boolean
  }
  OUTPUT: boolean

  RETURN X.page = '/nodes'
     AND X.button IN { 'TestCamera', 'TestMQTT' }
     AND X.method = 'POST'
     AND X.userAuthenticated = true
     AND X.csrfHeaderPresent = false
END FUNCTION
```

```pascal
// Property: Fix Checking — CSRF token harus ikut pada quick-action /nodes
FOR ALL X WHERE isBugConditionCsrf(X) DO
  responseAfterFix ← simulate_handleTestConnection'(X)
  ASSERT responseAfterFix.status = 200
     AND responseAfterFix.body has shape { status: 'ok' | 'failed', error?: string }
     AND responseAfterFix.usedCsrfToken = true
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugConditionCsrf(X) DO
  ASSERT simulate_handleTestConnection(X) = simulate_handleTestConnection'(X)
END FOR
```

> **Counterexample konkret:** klik "Test Camera" pada baris node `S-01-Cam-A` di `/nodes` → request `POST /api/nodes/test-connection` tanpa `X-CSRF-Token` → 403 `csrf_token_invalid` → spinner berputar selamanya.

### Bug 2 — `picPhone` / `picName` selalu `''` setelah create/edit lewat dashboard

```pascal
FUNCTION isBugConditionPic(X)
  INPUT: X = NodeMutation {
    source: 'NodeWizardCreate' | 'NodeWizardEdit' | 'DirectDB',
    userIntendsWaAlert: boolean,
    inputPicName: string | null,
    inputPicPhone: string | null
  }
  OUTPUT: boolean

  RETURN X.source IN { 'NodeWizardCreate', 'NodeWizardEdit' }
     AND X.userIntendsWaAlert = true
     AND (X.inputPicName IS NULL OR X.inputPicPhone IS NULL)
END FUNCTION
```

```pascal
// Property: Fix Checking — wizard menyediakan input + normalisasi telepon
FOR ALL X WHERE isBugConditionPic(X) DO
  // Setelah fix, wizard memaksa user mengisi inputPicName & inputPicPhone
  // sebelum lanjut, jadi X.inputPicName & X.inputPicPhone tidak akan NULL.
  result ← buildNodeDataFromWizardState'(X)
  ASSERT result.picName ≠ ''
     AND result.picPhone matches /^62[0-9]{8,14}$/
END FOR

// Property: phone normalization (helper murni)
FOR ALL raw WHERE raw IS digits-only-after-strip AND len(digits) >= 9 DO
  ASSERT normalizePhone(raw) matches /^62[0-9]{8,14}$/
  ASSERT normalizePhone(normalizePhone(raw)) = normalizePhone(raw)  // idempoten
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugConditionPic(X) DO
  ASSERT buildNodeDataFromWizardState(X) = buildNodeDataFromWizardState'(X)
END FOR
```

> **Counterexample konkret:** create node "Pintu Utara" di sektor S-01 lewat wizard → DB row tersimpan dengan `picPhone = ''` → backend Python log `"Tidak ada nomor WA terdaftar."` saat violation di-trigger.

### Bug 3 — Gas alarm hanya 1 putaran

```pascal
FUNCTION isBugConditionGasLoop(X)
  INPUT: X = GasAlarmEvent {
    avgAdc: int,
    threshold: int,
    audioBeginOk: boolean,
    prevState: SystemState
  }
  OUTPUT: boolean

  RETURN X.avgAdc > X.threshold
     AND X.prevState ≠ ALARM_ACTIVE
     AND X.audioBeginOk = true
END FUNCTION
```

```pascal
// Property: Fix Checking — gas alarm berbunyi sebanyak GAS_ALARM_PLAY_MAX
FOR ALL X WHERE isBugConditionGasLoop(X) DO
  loopsPlayed ← simulate_gasAlarmSession'(X)
  ASSERT loopsPlayed = GAS_ALARM_PLAY_MAX  // default 4
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugConditionGasLoop(X) DO
  ASSERT simulate_gasAlarmSession(X) = simulate_gasAlarmSession'(X)
END FOR
```

> **Counterexample konkret:** semprot gas pemantik dekat MQ-135 sehingga ADC > threshold dan `mp3->begin()` sukses → speaker mengeluarkan suara 1× lalu sunyi, walau threshold masih terlewati.

### Bug 4 — APD alarm langsung menyala setelah alarm gas selesai (compound)

```pascal
FUNCTION isBugConditionPostAlarmRetrigger(X)
  INPUT: X = AlarmTriggerSequence {
    now: ms,
    lastAlarmEndedAt: ms,
    incomingEvent: 'apd_violation' | 'apd_test' | 'apd_stop' | 'gas_alert',
    quietWindowMs: int
  }
  OUTPUT: boolean

  RETURN X.incomingEvent IN { 'apd_violation', 'apd_test' }
     AND (X.now - X.lastAlarmEndedAt) < X.quietWindowMs
END FUNCTION
```

```pascal
// Property: Fix Checking (firmware) — quiet window mencegah retrigger
FOR ALL X WHERE isBugConditionPostAlarmRetrigger(X) DO
  result ← shouldStartAlarm'(X.now, X.lastAlarmEndedAt, X.quietWindowMs)
  ASSERT result = false
END FOR

FOR ALL X WHERE X.incomingEvent IN { 'apd_violation', 'apd_test' }
            AND (X.now - X.lastAlarmEndedAt) >= X.quietWindowMs DO
  ASSERT shouldStartAlarm'(X.now, X.lastAlarmEndedAt, X.quietWindowMs) = true
END FOR

// Property: Fix Checking (backend) — COOLDOWN_SECONDS default = 20
FOR ALL env WHERE env.COOLDOWN_SECONDS IS UNSET DO
  ASSERT load_config'(env).COOLDOWN_SECONDS = 20
END FOR
FOR ALL env WHERE env.COOLDOWN_SECONDS IS SET DO
  ASSERT load_config'(env).COOLDOWN_SECONDS = int(env.COOLDOWN_SECONDS)
END FOR

// Property: Preservation Checking
FOR ALL X WHERE NOT isBugConditionPostAlarmRetrigger(X) DO
  ASSERT shouldStartAlarm(X.now, X.lastAlarmEndedAt, X.quietWindowMs)
       = shouldStartAlarm'(X.now, X.lastAlarmEndedAt, X.quietWindowMs)
END FOR
```

> **Counterexample konkret:** trigger gas alarm via `python trigger_alarm.py --gas` → alarm gas selesai pada `t = 18s` → backend masih mem-publish `apd_violation` tiap 2 detik → firmware memutar audio APD pada `t ≈ 19s`, kurang dari 1 detik setelah alarm gas selesai.

---

## End-to-End Acceptance Demo

Cross-cutting acceptance criterion (untuk verifikasi manual setelah semua fix diterapkan; klausa 2.x di atas tetap menjadi specnya, ini hanya alur demo):

1. Create satu node lewat wizard, isi PIC name = "Operator Demo" dan PIC phone = "081358959349". DB row harus menyimpan `picPhone = "6281358959349"`.
2. Buka `/nodes`, klik "Test Camera" → response 200 dengan body `{ status: 'ok' | 'failed', … }`. Klik "Test MQTT" → response 200 (bukan 403).
3. Trigger gas alarm: `python trigger_alarm.py --gas`. Speaker ESP32 harus berbunyi 4 putaran (Bug 3).
4. Selama dan sampai 10 detik setelah alarm gas selesai, `python trigger_alarm.py` (atau backend mem-publish `apd_violation` karena false positive deteksi) tidak boleh menyebabkan audio APD menyala (Bug 4 — quiet window).
5. Setelah 10+ detik post-alarm, trigger `apd_violation` harus tetap memutar 4 putaran audio APD seperti biasa (regresi 3.5).
6. Backend dengan `.env` tanpa `COOLDOWN_SECONDS` harus memakai default `20` detik; dengan `COOLDOWN_SECONDS=5` di `.env` harus memakai `5` (regresi 3.9).
7. Saat node tersebut men-trigger pelanggaran APD nyata, GoWA harus menerima request kirim WA ke `6281358959349` (Bug 2 end-to-end).
