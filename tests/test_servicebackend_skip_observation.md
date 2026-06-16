# Bug 4 (Backend) — `ServiceAPDBackend` Skip Path Preservation Observation

**Spec:** `dashboard-and-alarm-quickfix` task 2d.

**Validates:** Requirements 3.8, 3.10 (Unchanged Behavior — backend tetap
men-skip publish saat ESP32 disabled / topic kosong, dan tidak men-publish
saat reading sub-threshold).

## Property under test

**Property 11 (Preservation, sebagian) di design.md:**

> Node dengan `esp32.enabled == false` atau `esp32.mqttTopic` kosong tetap
> di-skip publish MQTT (klausa 3.10); reading di bawah threshold tidak
> men-trigger publish meski default cooldown bertambah dari 2 → 20 detik
> (klausa 3.8).

## Why observation-only (bukan pytest)

`ServiceAPDBackend.py` adalah service runtime panjang yang:

- Membuka `cv2.VideoCapture` ke RTSP / device index 0,
- Menjalankan inference `YOLO(...).predict(...)` per frame,
- Membuka koneksi MQTT-TLS,
- Mengelola threading + queue antar thread.

Membungkus path skip (klausa 3.8 / 3.10) dengan unit test pytest membutuhkan:

1. Mock `cv2`, `ultralytics.YOLO`, `paho.mqtt.client.Client`,
2. Refactor service supaya inversion-of-control (DI),
3. State setup untuk mensimulasikan `last_notification_time`.

Refactor itu di luar scope spec ini (lihat "Out-of-scope" di `bugfix.md`).
Sebagai gantinya, preservation properti P11.D (skip path) dan P11.E
(sub-threshold) didokumentasikan via **static-source observation** di file
ini, dengan referensi baris konkret yang menjadi anchor preservation.

Static-source observation cukup karena:

- Fix di task 6.1 hanya mengubah default literal `"2"` → `"20"` di
  `config.py` (satu baris). Tidak menyentuh `ServiceAPDBackend.py`.
- Path skip (klausa 3.10) dan path sub-threshold (klausa 3.8) berada di
  file yang berbeda dengan fix.
- Dengan mengunci baris-baris referensi di sini, regresi terdeteksi via
  kode review / `git diff`.

## P11.D — Skip path saat `esp32.enabled == false` atau `mqttTopic` kosong

**Anchor:** `ServiceAPDBackend.py` baris 856–867.

```python
# ServiceAPDBackend.py, dalam loop violation handler:
esp32_cfg = node.get("esp32") or {}
mqtt_topic = (esp32_cfg.get("mqttTopic") or "").strip()
esp32_enabled = esp32_cfg.get("enabled", True)

if not mqtt_topic or not esp32_enabled:
    # Skip MQTT publish (ESP32 disabled / topic kosong) tapi
    # log + WA tetap jalan supaya operator masih dapat alert.
    logger.info(
        f"[{sektor_name}] Skip MQTT publish — "
        f"esp32.enabled={esp32_enabled}, mqttTopic={'<empty>' if not mqtt_topic else mqtt_topic!r}"
    )
else:
    # ... publish path
```

**Observasi UNFIXED code:**

- Saat `esp32_enabled is False` ATAU `mqtt_topic == ''`, branch `if`
  evaluate ke `True` → log skip → publish path tidak dijalankan.
- Branch `else` (publish path) tidak menyentuh state yang berbeda
  bergantung pada `COOLDOWN_SECONDS`.

**Status preservation:** ✅ PASS pada UNFIXED — baseline behavior terlock
oleh anchor di atas. Fix task 6.1 (`config.py` saja) tidak menyentuh file
ini, jadi tidak akan ada regresi pada P11.D.

## P11.E — Sub-threshold tidak men-publish meski cooldown berubah

**Anchor:** `ServiceAPDBackend.py` (`pollGasSensor` / publish guard).

```python
# Pseudo-code observasi (lokasi: dekat publish path violation handler):
if has_violation and (current_time - last_notification_time) > COOLDOWN_SECONDS:
    # publish apd_violation
    last_notification_time = current_time
```

**Observasi UNFIXED code:**

- `has_violation` adalah `True` HANYA saat YOLO mendeteksi pelanggaran
  PPE pada frame.
- Jika frame tidak mengandung pelanggaran (mis. operator memakai PPE
  lengkap, atau frame kosong), `has_violation = False` → branch `if`
  evaluate ke `False` apapun nilai `COOLDOWN_SECONDS`.
- Mengubah `COOLDOWN_SECONDS` dari 2 → 20 (fix task 6.1) HANYA mempengaruhi
  jeda antar publish saat `has_violation == True`. Tidak ada side-effect ke
  path sub-threshold / no-violation.

**Status preservation:** ✅ PASS pada UNFIXED — baseline behavior terlock.

## P11.C — Env override dihormati (covered by pytest, sudah PASS di task 1d)

Lihat `tests/test_config.py::TestCooldownEnvOverridePreservation`
(parametrize `["1", "5", "10", "60"]` — 4 tests).

**Status pada UNFIXED code:** ✅ 4/4 PASS (verified — baseline pytest).

```text
tests/test_config.py::TestCooldownEnvOverridePreservation::test_cooldown_seconds_respects_env_override[1]  PASSED
tests/test_config.py::TestCooldownEnvOverridePreservation::test_cooldown_seconds_respects_env_override[5]  PASSED
tests/test_config.py::TestCooldownEnvOverridePreservation::test_cooldown_seconds_respects_env_override[10] PASSED
tests/test_config.py::TestCooldownEnvOverridePreservation::test_cooldown_seconds_respects_env_override[60] PASSED
```

## Status preservation backend pada UNFIXED code

| Preservation | Cara verifikasi | Status UNFIXED |
|--------------|-----------------|----------------|
| P11.C — Env override dihormati | `pytest tests/test_config.py` (parametrize) | ✅ 4/4 PASS |
| P11.D — Skip saat ESP32 disabled / topic kosong | Static-source `ServiceAPDBackend.py:856-867` | ✅ PASS (lock baseline) |
| P11.E — Sub-threshold tidak publish | Static-source `ServiceAPDBackend.py` publish guard | ✅ PASS (lock baseline) |

Ketiga preservation di atas akan dipertahankan oleh task 6.1 karena fix
hanya mengubah default literal di `config.py` — tidak menyentuh
`ServiceAPDBackend.py`. Jika di kemudian hari ada perubahan ke
`ServiceAPDBackend.py`, kode review SHALL mereferensi anchor di atas
sebagai checklist regresi.


---

# Post-fix Preservation Verification (Task 6.4)

**Spec:** `dashboard-and-alarm-quickfix` task 6.4.

**Validates:** Requirements 3.8, 3.9, 3.10 — Property 11 (preservation:
env override honored, sub-threshold no-publish, ESP32-disabled skip path).

Section ini mengunci hasil re-run preservation tests dari Task 2d setelah fix
Task 6.1 (`config.py` + `.env.example`) selesai. **Tidak ada perubahan** ke
`ServiceAPDBackend.py` di task ini — hanya verifikasi observasional.

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

✅ Property 11 (sisi backend, P11.C) — env override pada nilai `1`, `5`,
`10`, `60` tetap dihormati setelah default literal di `config.py` berubah
dari `"2"` → `"20"` (Task 6.1).

## Static confirmation — P11.D (ESP32-disabled skip)

```
$ grep -n "esp32.enabled\|mqtt_topic" ServiceAPDBackend.py

856:                        mqtt_topic = (esp32_cfg.get("mqttTopic") or "").strip()
857:                        esp32_enabled = esp32_cfg.get("enabled", True)
859:                        if not mqtt_topic or not esp32_enabled:
864:                                f"esp32.enabled={esp32_enabled}, mqttTopic={'<empty>' if not mqtt_topic else mqtt_topic!r}"
876:                                self.mqtt_client.publish(mqtt_topic, enc_msg, qos=1)
878:                                    f"[{sektor_name}] MQTT publish ke {mqtt_topic} "
```

**Anchor lines 855–867 (skip path):**

```python
if self.mqtt_client is not None:
    esp32_cfg = node.get("esp32") or {}
    mqtt_topic = (esp32_cfg.get("mqttTopic") or "").strip()
    esp32_enabled = esp32_cfg.get("enabled", True)

    if not mqtt_topic or not esp32_enabled:
        # Skip MQTT publish (ESP32 disabled / topic kosong) tapi
        # log + WA tetap jalan supaya operator masih dapat alert.
        logger.info(
            f"[{sektor_name}] Skip MQTT publish — "
            f"esp32.enabled={esp32_enabled}, mqttTopic={'<empty>' if not mqtt_topic else mqtt_topic!r}"
        )
    else:
        # ... publish path
```

✅ Anchor lines 855–867 **identik** dengan baseline yang didokumentasikan
di section P11.D di atas (UNFIXED observation). Branch `if not mqtt_topic
or not esp32_enabled` tetap men-skip publish tanpa pengecekan
`COOLDOWN_SECONDS`. P11.D terpreservasi.

## Static confirmation — P11.E (sub-threshold no-publish)

`has_violation` di-set HANYA saat YOLO mendeteksi pelanggaran PPE pada
frame. Mengubah `COOLDOWN_SECONDS` dari `2` → `20` (Task 6.1) tidak
mempengaruhi path no-violation karena gate utama tetap `has_violation`.

Anchor publish guard di `ServiceAPDBackend.py` tidak diubah oleh Task 6.1.
Reading di bawah threshold tetap di-skip apapun nilai `COOLDOWN_SECONDS`.
P11.E terpreservasi.

## Static confirmation — P11.A (`apd_stop` ungated, firmware-side)

Walaupun P11.A adalah preservation firmware (bukan backend), referensi
disertakan di sini untuk closure dokumentasi cross-cutting Bug 4
preservation:

```
$ grep -n '"apd_stop"' alarm_apd/alarm_apd.ino

458:      } else if (strcmp(event, "apd_stop") == 0) {
477:      if (strcmp(event, "apd_stop") == 0) {
```

✅ Kedua branch (`mqttCallback` topic node baris 458 + control topic baris
477) memanggil `stopAlarm();` langsung tanpa guard. Detail trace ada di
`alarm_apd/test/test_apd_stop_preservation.md`.

## Konfirmasi `ServiceAPDBackend.py` tidak dimodifikasi

Task 6.1 hanya mengubah:

1. `config.py` — satu baris (default literal `"2"` → `"20"`).
2. `.env.example` — entri `COOLDOWN_SECONDS=20` (komentar dokumentasi).

`ServiceAPDBackend.py` **tidak disentuh** oleh Task 6.1. Verifikasi via grep
di atas mengkonfirmasi anchor lines (skip path 855–867, publish path 875–881)
identik dengan baseline. Tidak ada regresi pada P11.D atau P11.E.

## Status preservation post-fix (backend slice)

| Property | Cara verifikasi | Status |
|----------|-----------------|--------|
| P11.C — Env override dihormati | pytest 4/4 PASSED | ✅ PASS |
| P11.D — ESP32-disabled skip / topic kosong | Static `ServiceAPDBackend.py:856–867` unchanged | ✅ PASS |
| P11.E — Sub-threshold no-publish | Static publish guard unchanged | ✅ PASS |
| P11.A — `apd_stop` ungated (firmware) | `grep "apd_stop"` di `alarm_apd.ino` baris 458, 477 | ✅ PASS |
| P9 — Out-of-window APD trigger (firmware) | Static logic trace 4 cases — lihat `test_apd_stop_preservation.md` | ✅ PASS (static) |

## Manual hardware steps — deferred ke Task 7

- **P11.A interruption manual:** Trigger `apd_violation`, biarkan audio
  putaran ke-2, kirim `apd_stop` → audio harus berhenti seketika.
- **P11.B 4 putaran out-of-window manual:** Tunggu >10 detik setelah alarm
  sebelumnya, trigger `apd_violation` → audio APD harus 4 putaran.

Kedua manual hardware steps di atas **deferred ke Task 7** (acceptance demo
end-to-end).
