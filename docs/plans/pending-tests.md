# Pending Manual Tests

> Test yang belum dilakukan setelah Plan D + Plan C selesai code-side.
> Semua butuh runtime user (webcam, ESP32, gas trigger).
>
> Plan D: `docs/plans/detection-quality-fix.md` + `.tasks.md`
> Plan C: `docs/plans/gas-status-everywhere.md` + `.tasks.md`

---

## Plan D — detection-quality-fix

### D-1. Per-zone evaluation re-test (PRIORITAS — fix terbaru)

Skenario yang sebelumnya bug, sekarang harus benar:

- [ ] **Pakai vest tanpa helm, kepala terlihat** → expect VIOLATION missing helmet
  (sebelumnya: unknown — masih konservatif)
- [ ] **Pakai helm, body terlihat tanpa vest** → expect VIOLATION missing vest
  (sudah benar, regression check)
- [ ] **Helm dipegang di tangan, kepala telanjang** → expect VIOLATION missing helmet
  (helm di luar head zone harus di-ignore)
- [ ] **Wajah saja close-up extreme** → expect TIDAK DINILAI / unknown
  (head_evaluable + torso_evaluable dua-duanya False)

**Cara:**
```powershell
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force
python ServiceAPDBackend.py
```
Buka `/monitor`, lakukan 4 skenario di atas, screenshot atau catat counter
`OK | Violation | Unknown` per skenario.

### D-2. Live-reload settings

- [ ] Geser slider `Detection Confidence` di `/settings` dari 0.65 → 0.40
- [ ] Tunggu max 5 menit
- [ ] Cek log Python harus muncul:
      `[settings] refreshed: confidence=0.40, person=0.60`
- [ ] Verifikasi deteksi jadi lebih sensitif (lebih banyak bbox lemah ke-detect)

### D-3. Multi-person test

- [ ] 1 orang full PPE (helm+vest) + 1 orang tanpa vest, dua-duanya menjauh
- [ ] Expect: orang #1 = APD OK, orang #2 = VIOLATION missing vest
- [ ] Counter top-left video harus `OK: 1 | Violation: 1 | Unknown: 0`
- [ ] Bbox PPE harus assign ke person yang benar (vest #1 jangan ke person #2)

### D-4. (Skipped) FP16 vs FP32 benchmark

Laptop CPU-only, tidak ada GPU NVIDIA. Skip permanent.

---

## Plan C — gas-status-everywhere

ESP32 sudah connect ke MQTT (verified flash YR2 cert).

### C-1. Gas badge update real-time

- [ ] Trigger gas: semprot pemantik dekat MQ-135
- [ ] `/monitor` card pill harus berubah `Gas: OK` → `Gas: ALERT` dalam 30s
- [ ] Modal MJPEG full-screen → pill gas update juga
- [ ] Setelah threshold turun → pill kembali `Gas: OK` dalam ~60s

### C-2. Dashboard home sync

Polling 15s di home page.

- [ ] Trigger gas → kolom **Gas** di Ringkasan Sektor table update merah
- [ ] Live Sektor Preview cards → dot kecil sebelah nama sektor update
- [ ] Stat card "Gas Alert" di top → counter naik
- [ ] Setelah threshold turun → semua kembali normal

### C-3. No-data state

- [ ] Matikan ESP32 (cabut power)
- [ ] Tunggu 5 menit (freshness limit)
- [ ] Badge harus berubah ke `Gas: —` (no-data state)
- [ ] Hidupkan lagi → kembali ke `Gas: OK`

---

## Setelah test selesai

- [ ] Update `docs/plans/detection-quality-fix.tasks.md` — checklist hardware
- [ ] Update `docs/plans/gas-status-everywhere.tasks.md` — Wave 5.3
- [ ] Update `.kiro/specs/dashboard-and-alarm-quickfix/follow-ups.md` —
      tutup item D (gas indicator) + item E/I (detection quality)
- [ ] `markPlanDone detection-quality-fix` (kalau pakai planning toolkit)
- [ ] `markPlanDone gas-status-everywhere`

---

## Backlog feature (belum di-spec)

Dari 6 spec asli + saran GPT yang ditunda:

| Spec | Effort | Value |
|---|---|---|
| F — live-snapshot-mode | menengah | tinggi (bandwidth) |
| H — tui-responsive-and-refresh | menengah | medium (TUI broken) |
| E — node-config-runtime | menengah | medium |
| G — wifi-manager-portal | menengah-besar | lower |
| Cooldown per (node_id, missing_type) | kecil | medium (anti-spam) |
| Multi-person bbox assignment | kecil | medium |
| Debug overlay toggle env | kecil | low |
