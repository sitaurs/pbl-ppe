# Tasks — detection-quality-fix

> Plan: `docs/plans/detection-quality-fix.md`
>
> Setiap wave/phase diturunkan ke sub-task. Tandai `[x]` saat selesai.
>
> Live-reload `/api/settings` dipilih untuk Task 6 (poll per 5 menit).

---

## Wave 1 — Pure helpers (foundation)

Bisa dikerjakan paralel, semua pure functions tanpa cv2/YOLO/threading. Output: module `detection_filters.py` siap di-import.

- [x] **1.1** Buat file baru `detection_filters.py` di repo root.
  - Tambah module docstring Indonesian-friendly.
  - Tidak boleh import cv2, ultralytics, paho, requests — pure stdlib only.

- [x] **1.2** Implement `is_full_body_bbox(person_bbox, frame_shape, min_height_ratio=0.6, edge_margin_px=20) -> bool`.
  - Input: `person_bbox = [x1, y1, x2, y2]`, `frame_shape = (h, w)` (cv2 convention) atau `(h, w, c)`.
  - Return True kalau `(y2 - y1) / h >= min_height_ratio` AND `(h - y2) <= edge_margin_px` (kaki dekat bottom frame).
  - Edge case: bbox invalid (`y2 <= y1`, atau di luar frame) → return False.
  - Edge case: frame_shape kurang dari 2 dimensi → raise ValueError dengan pesan jelas.

- [x] **1.3** Implement `should_publish_violation(streak_count, min_streak=5) -> bool`.
  - Return `streak_count >= min_streak`.
  - Pure trivial, tapi tetap dijadikan helper agar threshold mudah di-mock di test.

- [x] **1.4** Implement class `AdaptiveSkip` (stateful tapi tanpa side-effect external).
  - Constructor: `target_latency_ms=50`, `min_n=1`, `max_n=5`, `window=30`.
  - Method `record(latency_ms)` → push ke deque.
  - Method `current_n() -> int` → return skip factor terkini berdasar avg latency.
  - Aturan: avg > target → naikkan n (clamp ke max_n). avg < target/2 → turunkan (clamp ke min_n). Update bertahap (1 step per call) supaya tidak osilasi.

---

## Wave 2 — Tests untuk pure helpers

Depends on: Wave 1 selesai.

- [x] **2.1** Buat `tests/test_detection_filters.py`.
  - Import dari `detection_filters` module.
  - Pakai pytest + parametrize. Tidak butuh fast-check; cukup parametrize + property-style cases.

- [x] **2.2** Test `is_full_body_bbox`.
  - Bbox 80% tinggi, bottom dekat frame bottom → True.
  - Bbox 30% tinggi → False.
  - Bbox 80% tinggi tapi bottom jauh dari frame bottom (orang melayang/di tengah) → False.
  - Bbox menyentuh frame top tapi pendek → False.
  - Bbox invalid (y2 < y1) → False, no crash.
  - frame_shape malformed (1D tuple) → ValueError.

- [x] **2.3** Test `should_publish_violation`.
  - streak < min → False.
  - streak == min → True.
  - streak > min → True.
  - streak negatif → False (defensive).

- [x] **2.4** Test `AdaptiveSkip`.
  - Initial `current_n()` == min_n.
  - Record N high-latency samples → n naik tapi tidak melebihi max_n.
  - Record N low-latency samples → n turun tapi tidak di bawah min_n.
  - Tidak boleh osilasi: 10 sample bolak-balik di sekitar target tidak bikin n melompat-lompat.

- [x] **2.5** Jalankan `pytest tests` dari repo root.
  - Verifikasi semua test pass tanpa import cv2/torch (helper murni).
  - Catat coverage line (boleh manual: `pytest --cov=detection_filters tests/test_detection_filters.py`).
  - **Hasil:** 33/33 test_detection_filters.py pass; total 52/52 (no regresi pada test_aes_roundtrip + test_config).

---

## Wave 3 — Integrasi: bbox filter + streak gating

Depends on: Wave 1 + 2 selesai. Mulai sentuh `ServiceAPDBackend.py`.

- [x] **3.1** Import helpers di `ServiceAPDBackend.py`.
  - Tambahkan `from detection_filters import is_full_body_bbox, should_publish_violation` setelah block import existing (dekat line 30-50).

- [x] **3.2** Modifikasi `detect_ppe()` (line 651-684) — bbox completeness gate.
  - Sebelum loop class check, panggil `is_full_body = is_full_body_bbox(person['bbox'], frame.shape)`.
  - Kalau `is_full_body == True`: logic existing tetap (line 670-672 `if explicit_no_helmet or not has_helmet: missing.append("helmet")`).
  - Kalau `is_full_body == False`: hanya check `if explicit_no_helmet: missing.append("helmet")` dan `if explicit_no_vest: missing.append("vest")`. Tidak ada default-violation.
  - Tambah `logger.debug(f"[detect] node={...} full_body={is_full_body} explicit={explicit_no_helmet or explicit_no_vest}")`.

- [x] **3.3** Tambah state per-thread di `process_camera_node` (line 801-810).
  - Tambah `consecutive_violation_count = 0` di initial state.
  - Setelah `detect_ppe`, di branch `if frame_count % DETECT_EVERY_N == 0` (line 832): kalau `len(violations) > 0` → `consecutive_violation_count += 1`, kalau tidak → `consecutive_violation_count = 0`.
  - PENTING: jangan increment di branch else (frame skip carryover line 838-840), kalau tidak streak akan ter-inflate.

- [x] **3.4** Update publish gate di line 846.
  - Sekarang: `if has_violation and (current_time - last_notification_time) > COOLDOWN_SECONDS:`.
  - Jadi: `if has_violation and should_publish_violation(consecutive_violation_count, min_streak=MIN_VIOLATION_STREAK) and (current_time - last_notification_time) > COOLDOWN_SECONDS:`.
  - Setelah publish, reset streak agar tidak loop publish: `consecutive_violation_count = 0` di akhir block publish (sebelum line 913 `last_notification_time = current_time`).

- [x] **3.5** Tambah `MIN_VIOLATION_STREAK` di `config.py`.
  - Default `5` (= 0.25s di 20 FPS).
  - Comment Indonesian: "Jumlah frame deteksi konsisten sebelum publish MQTT/WA. Mengurangi false positive jitter."
  - Tambahkan juga di `.env.example` dengan keterangan.

- [ ] **3.6** Smoke test lokal (tanpa hardware ESP32). _Pending: butuh user run dengan webcam._
  - Jalankan `python ServiceAPDBackend.py` dengan webcam laptop.
  - Stand di depan kamera tanpa vest, hitung berapa frame sebelum publish (target ~5).
  - Sandar ke kamera close-up (kepala saja) → tidak ada publish, log debug `full_body=False`.

---

## Wave 4 — Performance: FP16 + adaptive skip

Depends on: Wave 1 (untuk AdaptiveSkip) selesai. Independen dari Wave 3 — boleh paralel.

- [x] **4.1** Tambah flag `USE_FP16` di `config.py`.
  - Default: `True if torch.cuda.is_available() else False`.
  - Override via env `USE_FP16=0` untuk debug.
  - Import `torch` dengan try/except agar config tetap importable di CI tanpa torch.

- [x] **4.2** Aktifkan FP16 di `load_model()` (line 369-390).
  - Setelah `self.model.to(self.device)` dan `self.person_model.to(self.device)`:
    `if USE_FP16 and self.device.startswith("cuda"): self.model.model.half(); self.person_model.model.half()`.
  - Log: `logger.info(f"[model] FP16 enabled: {USE_FP16}")`.

- [x] **4.3** Pass `half=True` ke inference call di line 627-628.
  - Hanya kalau `USE_FP16 == True`.
  - Pakai `**({"half": True} if USE_FP16 else {})` atau conditional kwargs.

- [x] **4.4** Ganti static `DETECT_EVERY_N` (line 809) dengan `AdaptiveSkip`.
  - Inisialisasi `skip_controller = AdaptiveSkip(target_latency_ms=50)` di awal `process_camera_node`.
  - Wrap `detect_ppe()` call dengan `t0 = time.perf_counter(); ...; skip_controller.record((time.perf_counter() - t0) * 1000)`.
  - Ganti `if frame_count % DETECT_EVERY_N == 0:` jadi `if frame_count % skip_controller.current_n() == 0:`.

- [x] **4.5** Tambah FPS counter sederhana untuk verifikasi.
  - Track `frames_processed` + `t_start` per node.
  - Tiap 30 detik, log `logger.info(f"[perf] node={node_id} fps={frames_processed/30:.1f} skip_n={skip_controller.current_n()}")`.

- [ ] **4.6** Verifikasi FP16 vs FP32. _Pending: butuh hardware GPU + 30s run._
  - Jalankan service 30 detik dengan `USE_FP16=1`, catat FPS.
  - Restart dengan `USE_FP16=0`, catat FPS.
  - Target: FP16 1.5–2× lebih cepat di GPU. Kalau tidak, cek apakah model weights mendukung half (YOLOv8n harusnya iya).

---

## Wave 5 — Settings live-reload + safe-bbox drawing (independent)

Depends on: hanya `ServiceAPDBackend.py` access. Boleh paralel dengan Wave 3-4.

- [x] **5.1** Tambah method `fetch_dashboard_settings()` di `ServiceAPDBackend.py`.
  - Pattern mirip `fetch_nodes_from_dashboard()` (line ~107).
  - Endpoint: `GET {DASHBOARD_API_URL}/api/settings` dengan header `Authorization: Bearer {APD_SERVICE_TOKEN}`.
  - Parse `data["system"]["confidenceThreshold"]` dan `data["system"]["personConfidence"]`.
  - Validate range (0 < x <= 1) sebelum override `CONFIDENCE_THRESHOLD` dan `PERSON_CONFIDENCE_THRESHOLD` global.
  - Try/except wrap — kalau gagal, log warning dan biarkan nilai existing.

- [x] **5.2** Cek permission map di `web-dashboard/src/lib/rbac/permission-map.ts`.
  - Pastikan `GET /api/settings` punya entry dengan `serviceTokenAllowed: true` (untuk Bearer access dari Python).
  - Kalau belum, tambahkan. Property test akan fail kalau lupa.

- [x] **5.3** Wire periodic refresh di `process_camera_node` atau di main loop.
  - Tambah `_last_settings_refresh = 0.0` ke `self`.
  - Interval default 300 detik (5 menit). Constant: `SETTINGS_REFRESH_INTERVAL_S = 300`.
  - Di awal frame loop: `if time.time() - self._last_settings_refresh > SETTINGS_REFRESH_INTERVAL_S: self.fetch_dashboard_settings(); self._last_settings_refresh = time.time()`.
  - Locking: kalau threshold global di-baca multi-thread, pakai `self._settings_lock` (threading.Lock) saat write. Read tetap atomic karena Python GIL untuk float assignment.

- [ ] **5.4** Test live-reload manual. _Pending: butuh user runtime._
  - Jalankan dashboard + Python.
  - Dari UI `/settings`, geser slider confidence dari 0.65 ke 0.40.
  - Tunggu 5 menit, cek log Python harus muncul `[settings] confidence=0.40`.
  - Verifikasi deteksi pakai threshold baru (jadi lebih sensitif).

- [x] **5.5** Fix safe-bbox drawing di `detect_ppe()` line 682-684.
  - Di branch `else` (saat `not missing`):
    `cv2.rectangle(annotated_frame, (px1, py1), (px2, py2), COLOR_SAFE, 3)`.
    `label = "APD OK"; (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)`.
    `cv2.rectangle(annotated_frame, (px1, py1 - lh - 10), (px1 + lw, py1), COLOR_SAFE, -1)`.
    `cv2.putText(annotated_frame, label, (px1, py1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)`.
  - Visual verify di `/monitor` page: orang pakai vest+helm punya kotak hijau.

---

## Wave 6 — Dokumentasi + acceptance

Depends on: semua Wave 1-5 selesai. Final gate.

- [x] **6.1** Tulis `docs/CAMERA-SETUP.md` (atau extend `docs/PBL-PENGOLAHAN-CITRA.md` line 222-232).
  - Section: Angle (sejajar mata, hindari low-angle).
  - Section: Jarak (3-5 meter ideal untuk full-body).
  - Section: Ketinggian (1.5-2m, sedikit di atas kepala).
  - Section: Framing (kaki harus terlihat, jangan crop ke kepala).
  - Section: Trade-off close-up vs full-body, hubungannya dengan `is_full_body_bbox` threshold default.
  - Sertakan diagram ASCII atau screenshot good/bad placement.

- [ ] **6.2** Update `README.md` quick start kalau perlu. _Skip — README sudah link ke docs/._
  - Tambah catatan: "Untuk akurasi optimal, lihat `docs/CAMERA-SETUP.md`."

- [x] **6.3** Run full verification chain.
  - `pytest tests` di repo root → semua pass.
  - `python -c "import config"` → tidak ada exception (env shape ok).
  - `npx tsc --noEmit && npm run lint && npm test` di `web-dashboard/` (kalau ada perubahan permission-map.ts).

- [ ] **6.4** Hardware E2E smoke test. _Pending user runtime._
  - Setup: ESP32 hidup, dashboard running, Python service running, kamera webcam atau RTSP.
  - Skenario A: orang full-body pakai vest+helm → green box drawn, no violation publish.
  - Skenario B: orang full-body tanpa vest → red box, violation publish setelah ~5 frame (= 0.25s).
  - Skenario C: orang setengah badan kepala-dada → no violation publish, log debug `full_body=False`.
  - Skenario D: bandingkan FPS log dengan FP16 vs FP32 (target 1.5-2× lebih cepat).
  - Skenario E: ubah threshold di `/settings` → tunggu 5 menit → verifikasi log `[settings] confidence=...`.

- [ ] **6.5** Update `follow-ups.md` di spec quickfix lama. _Pending: tutup item E + I setelah hardware test._
  - Tambah section "Detection quality fix — completed" dengan ringkasan hasil.
  - Tutup item E (false positive setengah badan) dan I (optimasi performa) dengan referensi ke commit ini.
  - Tandai plan sebagai done via `markPlanDone detection-quality-fix`.

---

## Dependency graph

```
Wave 1 (helpers + module)
   │
   ├── Wave 2 (tests) ──────────┐
   │                            │
   ├── Wave 3 (integration) ◀───┤  (butuh helper + tests pass)
   │                            │
   ├── Wave 4 (perf) ◀──────────┘  (butuh AdaptiveSkip dari W1)
   │
   ├── Wave 5 (settings + UX) — paralel sejak Wave 1 (tidak butuh helper)
   │
   └── Wave 6 (docs + acceptance) — gate, butuh semua wave selesai
```

Wave 5 boleh dimulai bersamaan dengan Wave 1 karena tidak butuh helper baru. Wave 3 dan 4 saling independen tapi sama-sama edit `ServiceAPDBackend.py` — koordinasikan urutan commit (Wave 3 dulu karena lebih besar) untuk hindari merge conflict di file yang sama.

