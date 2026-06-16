# Follow-ups — `dashboard-and-alarm-quickfix`

> Catatan tindak lanjut setelah eksekusi spec selesai. Disimpan agar tidak
> hilang dari memori saat lanjut ke spec atau iterasi berikutnya.
>
> Status spec saat catatan dibuat: 22/22 task ✅, 252 automated tests pass.
> Lihat juga `acceptance-demo-checklist.md` di folder yang sama.

---

## Triage legend

- 🔴 **Diagnose dulu** — kemungkinan bukan bug code; bisa jadi efek
  deployment (firmware belum flash / server belum restart / browser cache).
  Cek dulu sebelum buat spec baru.
- 🟡 **Investigasi code** — perlu code review / cross-check sebelum
  putuskan apakah anomali atau by design.
- 🟢 **Spec baru** — feature / refactor terpisah; layak dijadikan spec
  sendiri.
- 🔵 **Manual test** — perlu user runtime test di hardware, tidak bisa
  dijalankan dari sini.

---

## A. Field test report (sesi tes terakhir)

User melakukan tes di hardware dan menemukan tiga gejala yang tampak
masih buggy. Penting: spec quickfix kemarin sudah edit kode, **tapi
firmware mungkin belum di-flash ulang** dan **dashboard mungkin belum
di-restart** — sehingga tes lama bisa jadi masih jalan di binary lama.

### A.1 Gas alarm cuma 1 putaran (lapangan) 🔴

- **Gejala:** `python trigger_alarm.py --gas` → speaker bunyi 1× saja,
  bukan 4 putaran seperti yang diharapkan post-fix Bug 3.
- **Hipotesis utama:** firmware ESP32 belum di-flash dengan binary
  post-fix. Build artifact lama masih jalan.
- **Cara cek:**
  1. Build & flash ulang:
     ```
     cd alarm_apd
     pio run -t upload
     pio device monitor -b 115200
     ```
  2. Jalankan `python trigger_alarm.py --gas`.
  3. Lihat Serial: harus ada `[audio] putaran 1/4 selesai`, `... 2/4`,
     `... 3/4`, `... 4/4 selesai`.
  4. Bila tetap 1 putaran → kirim Serial log lengkap, kita debug.
- **Static-source confirmation done:** Task 5.2 sudah verifikasi
  `handleGasAlert` post-fix tidak lagi `alarmPlayCount = ALARM_PLAY_MAX`.

### A.2 APD alarm langsung menyala setelah gas selesai (lapangan) 🔴

- **Gejala:** habis gas, langsung suara APD tanpa jeda.
- **Hipotesis utama:** sama dengan A.1 — firmware belum di-flash
  post-fix. Quiet window logic di Task 6.2 belum ada di binary aktif.
- **Cara cek:** sama dengan A.1. Setelah flash ulang, ulangi: trigger gas
  → tunggu selesai → dalam 10 detik kirim `python trigger_alarm.py` →
  Serial harus print `[alarm] skip — quiet window aktif`.
- **Bila tetap retrigger setelah flash:** kemungkinan `lastAlarmEndedAt`
  tidak ke-set di natural-end branch. Log Serial akan kasih clue.

### A.3 CSRF token error di `/nodes` Test Camera, sementara `/monitor` aman 🔴

- **Gejala:** klik Test Camera di tree view → spinner terus, error CSRF
  token.
- **Hipotesis utama:** dashboard server belum di-restart dengan kode
  post-fix dari Task 3.1. `NodeTable.tsx` di repo sudah diedit, tapi
  Next.js dev server kalau tidak hot-reload betul, bundle lama masih
  serve.
- **Cara cek:**
  1. Restart dashboard:
     ```
     # Stop dev server, lalu:
     cd web-dashboard
     pnpm dev
     ```
  2. Hard refresh browser (`Ctrl+Shift+R`) untuk buang cache.
  3. Login ulang, klik Test Camera. Lihat DevTools → Network → request
     `POST /api/nodes/test-connection` harus mengandung header
     `X-CSRF-Token`.
  4. Bila tetap 403 → cek apakah `useApiFetch` di NodeTable benar-benar
     terpasang (`grep -n "useApiFetch" NodeTable.tsx` → harus 2 match:
     import + pemanggilan).
- **Static-source confirmation done:** Vitest 5/5 PASS post-fix di
  Task 3.2 + 3.3.

---

## B. Investigasi alur user / role / sektor / PIC 🟡

### B.1 Mana UI untuk input PIC?

- **Pertanyaan user:** "no pic gimana caranya nambahinnya saya cari di
  wizard node g ada, di user role g ada sektor g ada."
- **Faktanya** (post-fix Task 4.2): field "Nama PIC" dan "No WhatsApp
  PIC" ditambahkan di **Step 1 wizard** (`StepSectorInfo.tsx`),
  bersama input nodeName & sektor.
- **Hipotesis utama:** dashboard belum di-restart, atau wizard tidak
  rebuild. Sama dengan A.3.
- **Cara cek:**
  1. Restart `pnpm dev`.
  2. Buka `/nodes/wizard` (atau equivalent).
  3. Step 1 harus menampilkan field "Nama PIC" dan "No WhatsApp PIC"
     setelah field "Sektor".
  4. Bila tidak muncul → cek build cache (`.next/cache`), hapus,
     restart.

### B.2 Audit alur user / role / sektor / PIC end-to-end 🟡

- **Pertanyaan user:** "gimana sih alur user role, sektor, pic itu
  bagaimana cek lagi apakah ada anomali."
- **Action:** code review terpisah untuk:
  1. Skema `User`, `Sektor`, `Node` di `db.json` / Prisma schema.
  2. Halaman `/users`, `/sectors`, `/nodes` — apakah field-field
     terhubung benar?
  3. Permission matrix: role apa boleh edit apa?
  4. Cross-check antara dashboard dan backend Python (`ServiceAPDBackend.py`
     baca `node.picPhone` — bagaimana kalau node tidak punya sektor?)
- **Triage:** ini bisa jadi spec mini sendiri:
  `dashboard-user-role-sektor-pic-audit`. Atau bagian dari refactor
  bigger picture.

---

## C. GoWA WhatsApp test 🔵

- **Action user:** kirim WA tes ke nomor `081358959349`.
  *(Catatan: di prompt user disebut `091358959349` — kemungkinan typo;
  format Indonesia dimulai `0813`, bukan `0913`. Konfirmasi nomor yang
  benar sebelum tes. Yang sudah disebut di `bugfix.md` step 7 adalah
  `081358959349`.)*
- **Cara cek:**
  1. Pastikan GoWA running, env `WA_API_URL` di `.env` valid, sesi WA
     tersambung di GoWA dashboard.
  2. Trigger pelanggaran APD nyata pada node yang `picPhone =
     "6281358959349"`.
  3. Backend log harus tunjukkan
     `[sektor] Mengirim WA ke Operator Demo (6281358959349)...` lalu
     `[sektor] WA terkirim sukses.`
  4. WA masuk ke nomor target.
- **Bila gagal:** kirim log backend Python segmen `send_whatsapp_alert`
  + response GoWA.

---

## D. Sensor gas indicator di UI 🟢

- **Permintaan user:** tampilkan status sensor MQ-135 di:
  1. `/monitor/[id]` — di card live monitor, di samping label "live"/
     "alert", tambah pill "Gas: OK" / "Gas: ALERT".
  2. `/nodes` (home dashboard) — di samping nama node, tambah indicator
     dot / pill kecil untuk gas alert state.
- **Sumber data:** `Node.status.gas.alert` dari endpoint
  `/api/nodes/{id}/status` (sudah ada gas telemetry via MQTT
  `gas/<node>` → backend keep latest). Cek apakah backend sudah
  publish ke endpoint status; bila belum, tambahkan.
- **Triage:** spec baru — `dashboard-gas-indicator`. Scope:
  - UI: 2 component update.
  - Backend: pastikan gas state ter-cache dan keluar dari
    `/api/nodes/{id}/status`.

---

## E. False positive deteksi "setengah badan" (overlap dgn out-of-scope sebelumnya) 🟢

- **Konteks:** sudah dibahas di section B versi awal follow-ups.
- **Permintaan user:** pertimbangkan best practice. Pilihan kombinasi:
  1. Bbox completeness filter (tolak deteksi bbox terlalu kecil / di
     edge).
  2. Temporal smoothing (publish `apd_violation` hanya kalau N frame
     berturut-turut).
  3. Retrain model dengan data setengah badan.
- **Rekomendasi:** spec baru `detection-half-body-falsepositive`,
  combo opsi 1 + 2 dulu, opsi 3 ditunda.
- **Acceptance criterion draft** sudah ditulis di section B awal
  follow-ups (di bawah).

---

## F. MQTT / HiveMQ verifikasi + redundancy wizard 🟡

### F.1 Backend connect ke HiveMQ?

- Cek `ServiceAPDBackend.py` log saat startup:
  ```
  [mqtt] connecting to <broker>:8883 ...
  [mqtt] connected.
  ```
- Cek `.env` `MQTT_BROKER`, `MQTT_PORT`, `MQTT_USERNAME`, `MQTT_PASSWORD`,
  `MQTT_CA_CERT_PATH` (kalau TLS).

### F.2 Redundansi: wizard ESP32 minta MQTT host padahal `.env` sudah ada?

- **Pertanyaan user:** wizard saat konfigurasi ESP32 minta `mqttBroker`
  + `mqttTopic`. Apakah perlu, padahal `.env` sudah ada?
- **Faktanya:** broker host di wizard adalah info yang akan di-flash
  ke ESP32 (firmware ESP32 baca dari config-nya sendiri, bukan dari
  `.env` backend). Tapi karena 1 broker biasanya dipakai semua node,
  bisa diisi otomatis dari `.env` backend dengan opsi "override per
  node" untuk fleksibilitas.
- **Topic apd vs gas:** sekarang wizard cuma minta 1 `mqttTopic` —
  tapi `pollGasSensor` di firmware publish ke topic gas terpisah
  (`gas/<node>`). Cek apakah ada redundansi atau memang dua topic
  beda.

### F.3 Threshold slider di wizard berfungsi?

- Cek di `StepCameraConfig.tsx` (atau equivalent) apakah field
  `confidenceThreshold` slider `<input type="range">` benar-benar
  trigger `onChange` dan tersimpan ke `state.cameraConfig.confidenceThreshold`.
- Cek juga `StepESP32Config.tsx` `gasThreshold` slider.
- **Test:** `npx vitest --run wizard` — kalau passing semua tetapi UI
  feel-nya tidak responsif, mungkin styling slider yang tidak match
  dengan input handler.

**Triage:** spec mini `wizard-mqtt-and-threshold-audit` untuk audit +
fix anomali F.1 / F.2 / F.3.

---

## G. WiFi manager portal (ESP32) 🟢

- **Permintaan user:** portal AP untuk konfigurasi WiFi di ESP32 (mode
  WiFiManager-style), plus tampilkan info "topic untuk dimasukkan ke
  wizard" di portal supaya user bisa copy.
- **Library populer:** `tzapu/WiFiManager` di Arduino/PlatformIO.
- **Scope:**
  1. Firmware: integrate WiFiManager, expose AP `SafeGuard-Setup`,
     web form untuk set SSID/password.
  2. Tambah halaman info di portal: tampilkan `nodeId`, `mqttTopic`
     yang harus dimasukkan ke wizard.
  3. Persist credentials ke NVS / SPIFFS.
- **Triage:** spec baru `firmware-wifi-manager-portal`. Cukup besar,
  layak spec sendiri.

---

## H. Live monitor bandwidth optimization 🟢

- **Permintaan user:** halaman `/monitor/[id]` boros bandwidth.
- **Pendekatan yang masuk akal:**
  1. **Adaptive frame rate:** turunkan FPS saat tab tidak aktif
     (`document.visibilityState`), throttle saat user idle.
  2. **JPEG quality scaling:** kurangi JPEG quality di backend
     `ServiceAPDBackend.py` saat encode frame untuk stream MJPEG
     (`cv2.imencode(..., [cv2.IMWRITE_JPEG_QUALITY, 60])`).
  3. **Resolution downsample untuk preview:** stream 480p untuk monitor
     UI, 720p/1080p hanya saat user klik fullscreen.
  4. **Pause stream saat tidak terlihat:** hentikan request `<img>` saat
     tab inactive.
- **Triage:** spec baru `monitor-bandwidth-optimization`.

---

## I. Optimasi performa & akurasi deteksi 🟢

- **Permintaan user:** "deteksi lebih akurat dan ringan."
- **Akurasi:** overlap dengan section E (false positive setengah badan).
- **Ringan:**
  1. Frame skipping — inference setiap N-th frame (mis. setiap 2 frame
     → ½ FPS deteksi tapi ½ load CPU).
  2. Resolution downsample sebelum inference (deteksi di 640×480, render
     box di resolusi asli).
  3. Switch ke YOLOv8n (nano) bila saat ini pakai s/m/l.
  4. Quantize INT8 (kalau hardware support).
  5. Async inference — deteksi di thread terpisah, tidak blocking
     stream.
- **Triage:** spec baru `detection-performance-optimization`.
  Saling overlap dengan E + H — pertimbangkan satu spec besar
  `detection-and-streaming-optimization` atau pisah jadi 3 spec kecil.

---

## J. TUI update 🟢

### J.1 Konten TUI sudah outdated

- **Permintaan user:** "TUI nya update banyak banget, padatin juga
  mungkin ada yg udah nggk relefan, tambahin apalagi gitu."
- **Action:** review file TUI utama (kemungkinan `apd_detection.log` /
  service launcher script / dashboard CLI). Identifikasi block yang
  tidak relevan.

### J.2 TUI tidak fit window — kepotong + tidak bisa scroll

- **Gejala spesifik:** "tampilannya cuman sampe backend ru ja, bawah
  bawahnya g kelihatan, scroll g bisa."
- **Hipotesis:** TUI memakai static print ke stdout yang lebih panjang
  dari terminal height. Perlu refactor pakai `rich.live.Live` atau
  `textual` agar responsive ke `os.get_terminal_size()` dan
  re-render saat resize.
- **Action:**
  1. Identifikasi file TUI (perlu code lookup; kemungkinan di
     `ServiceAPDBackend.py` atau script launcher terpisah).
  2. Refactor pakai library responsive (`rich` sudah dipakai di
     project? cek `requirements.txt`).
  3. Test di laptop dengan terminal kecil + resize.

**Triage:** spec baru `backend-tui-revamp`. Bisa kecil-menengah.

---

## K. Acceptance demo manual yang masih harus dikerjakan

(Tetap dari section A versi awal — tidak diubah.)

Lihat `acceptance-demo-checklist.md`. Update kolom `Manual status`
saat hardware siap.

---

## L. Backlog detection setengah badan (lengkap)

(Tetap dari section B versi awal — di-refer dari section E di atas.)

### Tiga opsi solusi (urut termurah → termahal)

1. **Bbox completeness filter** — tolak deteksi kalau tinggi bbox <
   60% frame ATAU bbox center-y terlalu dekat ke edge atas. Cepat,
   deterministik, tanpa retrain.
2. **Temporal smoothing** — publish `apd_violation` hanya kalau
   pelanggaran konsisten N frame berturut-turut (mis. 5 frame ≈
   0.25s pada 20 FPS).
3. **Model retraining / data augmentation** — tambah anotasi
   setengah badan ke CHV-YOLOv8 dataset, retrain. Paling akurat
   tapi butuh waktu + GPU.

**Rekomendasi:** kombinasi #1 + #2 dulu; #3 ditunda sampai feedback
lapangan baru.

### Acceptance criterion awal (draft)

- WHEN bbox person `tinggi_bbox / tinggi_frame < 0.6` THEN backend
  SHALL menandai sebagai "tidak conclusive" dan tidak menambah
  counter pelanggaran.
- WHEN pelanggaran tidak konsisten selama 5 frame berturut-turut
  THEN backend SHALL tidak publish `apd_violation`.
- WHEN operator masuk frame penuh dan benar-benar tanpa rompi
  THEN backend SHALL tetap publish `apd_violation` setelah
  konsistensi tercapai.

---

## M. Catatan teknis lain

- **PlatformIO `[env:native]` belum ada** — perlu ditambahkan kalau
  ingin menjalankan PBT C++ secara runtime (`pio test -e native`).
  Bisa jadi spec mini `firmware-test-infra`.
- **Test fixture migration Bug 2** sukses — semua wizard property test
  sudah pakai `picName`/`picPhone`. Tidak ada utang teknis.
- **`alarm_apd.ino` global block** — sekarang menampung empat state
  global terkait alarm: `alarmPlayCount`, `currentAlarmIsGas`,
  `lastAlarmEndedAt`, `QUIET_WINDOW_MS`. Bila bertambah, pertimbangkan
  refactor jadi struct `AlarmState`.

---

## Proposed roadmap (priority order)

Saran urutan kerja, dari yang paling penting / paling cepat:

| # | Item | Triage | Estimasi effort |
|---|------|--------|-----------------|
| 1 | A.1, A.2, A.3, B.1 — diagnose deployment | 🔴 | < 30 menit (user run + restart) |
| 2 | C — GoWA test | 🔵 | 5 menit user runtime |
| 3 | F.1, F.2, F.3 — MQTT/wizard audit | 🟡 | 1 jam code review |
| 4 | B.2 — user/role/sektor/PIC audit | 🟡 | 1–2 jam code review |
| 5 | E — detection setengah badan (filter + smoothing) | 🟢 | spec mini ~1 hari |
| 6 | D — gas indicator UI | 🟢 | spec mini ~½ hari |
| 7 | J — TUI revamp | 🟢 | spec mini ~½ hari |
| 8 | I — detection performance optimization | 🟢 | spec sedang ~2 hari |
| 9 | H — monitor bandwidth optimization | 🟢 | spec sedang ~1 hari |
| 10 | G — WiFi manager portal | 🟢 | spec sedang ~2 hari |
| 11 | M — firmware test infra `[env:native]` | 🟢 | spec mini ~½ hari |

> Cara mengisi follow-up: pilih item tier 1–4 dulu (diagnose / audit
> ringan); itu mungkin sudah menutup sebagian "yang belum-belum".
> Setelah itu pilih spec baru sesuai prioritas operasional (deteksi
> akurat biasanya paling penting buat lapangan).
