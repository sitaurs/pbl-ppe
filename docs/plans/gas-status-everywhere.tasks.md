# Tasks — gas-status-everywhere

> Plan: `docs/plans/gas-status-everywhere.md`
>
> Sebagian besar wiring frontend — backend MQTT + endpoint sudah siap.
>
> Komponen reusable: `GasAlertBadge.tsx` (sudah ada, lengkap polling).

---

## Wave 1 — Audit & opsional refactor

Persiapan: pahami komponen existing sebelum tempel di tempat baru.

- [x] **1.1** Audit `web-dashboard/src/components/nodes/GasAlertBadge.tsx` (line 1-201).
  - Catat props yang diterima: minimal `nodeId`.
  - Catat polling behavior: interval, endpoint, no-data threshold (5 menit).
  - Catat hardcoded asumsi: apakah pakai context auth? apakah bergantung pada parent layout?
  - Output: 1 paragraf di plan tasks ini, atau di komen file, mendokumentasikan API komponen.

- [x] **1.2** Putuskan refactor opsional `<GasIndicatorPill>` (presentational).
  - Kalau home page sudah polling `gasLatestByNode` (page.tsx:87-104, tiap 15s), dan kita pasang badge di 3 tempat di home, akan ada 4 polling paralel (1 existing + 3 dari badge instances).
  - Refactor: extract presentational `GasIndicatorPill` yang terima `data: GasTelemetry | null` + `staleMs` prop. `GasAlertBadge` jadi wrapper dengan polling.
  - **Decision point**: kalau audit step 1.1 menunjukkan badge sudah ringan (cuma 1 fetch per node per 30s), skip refactor. Kalau berat atau rendernya kompleks, lakukan refactor.
  - Catat keputusan di tasks ini sebelum lanjut.

- [x] **1.3** Cek tipe data response `/api/telemetry/gas`.
  - File: `web-dashboard/src/app/api/telemetry/gas/route.ts:69-91` (GET handler).
  - Pastikan response shape match dengan asumsi `<GasIndicatorPill>` (kalau direfactor) atau `<GasAlertBadge>`.
  - Field minimum: `nodeId`, `alert`, `raw`, `timestamp`. Kalau ada field tambahan dari backend (mis. `gasThreshold` dari payload ESP32 line 1869), pertimbangkan persist ke schema atau abaikan.

---

## Wave 2 — Wiring di /monitor page

Depends on: Wave 1 selesai.

- [x] **2.1** Update `web-dashboard/src/app/monitor/page.tsx`.
  - Import `GasAlertBadge` dari `@/components/nodes/GasAlertBadge`.
  - Di card grid (line 198-214), sisipkan `<GasAlertBadge nodeId={node.id} />` di dalam div flex `items-center gap-3` (line 207-213).
  - Posisi: antara violation count badge (line 201-205) dan "Live" pulse dot.
  - Ukuran: pastikan tidak break layout di mobile. Gunakan `text-[10px]` atau prop `compact` kalau ada.

- [x] **2.2** Update modal MJPEG full-screen di `/monitor` (line 230-275).
  - Cari pill "MJPEG" di line 241-244.
  - Sebelahin `<GasAlertBadge nodeId={selected} />` di sana.
  - Test: klik card → modal terbuka → gas badge tampil bersama MJPEG pill.

- [ ] **2.3** Verifikasi visual. _Pending: butuh user runtime + hardware gas trigger._
  - Jalankan `npm run dev`.
  - Buka `/monitor` → grid card harus tampilkan gas pill.
  - Trigger gas alert manual (atau tunggu data dari ESP32) → badge berubah dari "Gas: OK" ke "Gas: ALERT" dalam 30 detik (interval polling badge).
  - Tab inactive lalu kembali → badge tidak crash, polling tetap jalan.

---

## Wave 3 — Wiring di dashboard home (Live Sektor Preview cards)

Depends on: Wave 1 selesai.

- [x] **3.1** Pasang gas indicator di Live Sektor Preview cards.
  - File: `web-dashboard/src/app/page.tsx`, line 359-411 (sektor preview tile).
  - Posisi: dalam div flex `items-center justify-between` di line 394-401, di samping `node.sektorName`.
  - Sumber data: `gasLatestByNode[node.id]` yang sudah di-compute di line 187-196 (jangan polling baru).
  - Render approach (kalau Wave 1.2 putuskan TIDAK refactor): pakai `<GasAlertBadge nodeId={node.id} />` apa adanya — dia akan polling sendiri (overhead minor, ok untuk kartu kecil).
  - Render approach (kalau Wave 1.2 putuskan refactor): pakai `<GasIndicatorPill data={gasLatestByNode[node.id]} />` — pakai data home yang sudah ada, no double polling.

- [x] **3.2** Adjust styling untuk fit kartu kecil.
  - Sektor preview tile sempit. Kalau pill terlalu lebar → break wrap.
  - Pakai compact variant: cuma dot warna + text "Gas" / sembunyikan teks status, atau truncate "ALERT" jadi "!".
  - Test di viewport 375px (mobile) dan 1280px (desktop).

- [x] **3.3** Verifikasi tidak ada race condition dengan stat card existing.
  - Stat card "Gas Alert" di line 268-289 sudah ada, baca dari same source.
  - Pastikan saat alert berubah, kedua tempat update bersamaan (atau dalam 1 polling cycle = 15s).

---

## Wave 4 — Wiring di Ringkasan Sektor table

Depends on: Wave 1 selesai. Boleh paralel dengan Wave 2-3.

- [x] **4.1** Tambah indicator di tabel "Ringkasan Sektor" (`page.tsx:463-499`).
  - Pilihan A (rekomendasi): kolom baru "Gas" antara "PIC" (line 480-483) dan "Pelanggaran" (line 484-491).
  - Pilihan B: inline dot di cell Sektor (line 481), sebelum atau setelah `node.sektorName`.

- [x] **4.2** Implementasi pilihan A — kolom baru.
  - Update header table (line 466-475) tambah `<th>Gas</th>`.
  - Di body (line 476-498) tambah `<td className="px-3 py-2"><GasIndicatorPill data={gasLatestByNode[node.id]} /></td>` (atau `<GasAlertBadge>` kalau tidak refactor).
  - Pastikan colspan untuk row "tidak ada data" (kalau ada) menyesuaikan.

- [ ] **4.3** Implementasi pilihan B — inline dot (kalau dipilih). _Skipped: pilih A._
  - Wrap `node.sektorName` dalam div flex dengan dot warna kecil (`w-2 h-2 rounded-full`) di kiri.
  - Warna: hijau kalau `gasLatestByNode[node.id]?.alert === false`, merah kalau true, abu kalau no data atau stale.

- [x] **4.4** Verifikasi konsistensi dengan stat card + sektor preview cards.
  - Saat 1 node alert, 3 lokasi (stat, preview, table) harus sama-sama merah.
  - Saat data hilang > 5 menit, badge no-data di semua tempat.

---

## Wave 5 — Tests + verifikasi + smoke

Depends on: Wave 2-4 selesai. Final gate.

- [x] **5.1** Update tests existing (kalau ada).
  - Cek `web-dashboard/src/components/nodes/__tests__/GasAlertBadge.test.tsx` — kalau ada, run dan pastikan tidak break.
  - Kalau Wave 1.2 refactor jadi `<GasIndicatorPill>`, tambah test snapshot atau RTL untuk komponen baru.

- [x] **5.2** Run full verification chain (sesuai AGENTS.md).
  - `npx tsc --noEmit` di `web-dashboard/` → no type errors.
  - `npm run lint` → no eslint warnings/errors.
  - `npm test` (vitest --run) → semua pass termasuk property test permission-map (tidak boleh break karena tidak ada endpoint baru).

- [ ] **5.3** Smoke test E2E hardware. _Pending: butuh user runtime + ESP32 + MQ-135._
  - Setup: ESP32 + MQ-135 + dashboard + Python service jalan.
  - Trigger gas: semprot gas pemantik dekat sensor (atau `python trigger_alarm.py --gas` kalau support).
  - Observe:
    - `/monitor` card pill berubah OK → ALERT dalam 30s.
    - Live Sektor Preview cards di home update.
    - Ringkasan Sektor table baris relevan update.
    - Setelah threshold turun, semua kembali OK.
  - Catat timing actual update di tiap lokasi.

- [ ] **5.4** Update `follow-ups.md` di spec quickfix. _Pending: tutup item D setelah hardware test._
  - Tutup item D (sensor gas indicator di UI) dengan referensi ke commit.
  - Tandai plan done via `markPlanDone gas-status-everywhere`.

---

## Dependency graph

```
Wave 1 (audit + decision)
   │
   ├── Wave 2 (/monitor) ──┐
   │                       │
   ├── Wave 3 (home cards) ┼─── Wave 5 (tests + smoke) — gate
   │                       │
   └── Wave 4 (table) ─────┘
```

Wave 2, 3, 4 independent setelah Wave 1 — boleh paralel kalau dikerjakan tim berbeda. Kalau solo, urutan rekomendasi: 2 → 3 → 4 (dari yang paling visible ke yang detail).

