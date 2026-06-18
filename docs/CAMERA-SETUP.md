# Panduan Pemasangan Kamera — SafeGuard APD

> Bagian dari `docs/plans/detection-quality-fix.md` Wave 6.1.
>
> Penempatan kamera yang tepat = deteksi yang akurat. False positive
> "setengah badan" terbesar berasal dari sudut kamera yang salah,
> bukan dari kekurangan model.

---

## TL;DR

| Aspek | Rekomendasi |
|---|---|
| Sudut | Sejajar mata pekerja, hindari low-angle dari bawah |
| Jarak | 3 – 5 meter dari titik akses |
| Ketinggian | 1.7 – 2.0 m, sedikit di atas kepala |
| Framing | Wajib menampilkan FULL BODY (kepala s/d kaki) |
| Min height ratio | Person bbox ≥ 60% tinggi frame (default `is_full_body_bbox`) |

---

## Mengapa full-body penting

`detect_ppe()` di `ServiceAPDBackend.py` memutuskan pelanggaran APD
dengan logic dasar:

```
kalau model TIDAK mendeteksi vest → person tersebut dianggap "no_vest"
```

Logika ini benar untuk full-body, tapi **rusak** untuk close-up:

```
Skenario: kamera close-up wajah-saja
  → person bbox tinggi 80% tapi yang masuk frame cuma kepala-dada
  → vest ada di tubuh tapi keluar frame
  → model tidak deteksi vest (karena memang tidak terlihat)
  → sistem tag "VIOLATION" ❌ FALSE POSITIVE
```

Wave 3 (lihat `docs/plans/detection-quality-fix.tasks.md`) menutup gap
ini dengan **bbox completeness gate**: kalau person bbox tidak full-body
(kaki tidak visible), sistem hanya men-trigger violation kalau model
secara EKSPLISIT mendeteksi `no_helmet` atau `no_vest`. Tidak ada lagi
"default violation".

Tapi gate ini hanya menutupi efek samping. Akar masalahnya tetap:
**kamera yang setup-nya salah membuat model bekerja di luar zona
performanya**. Dataset CHV-YOLOv8 dilatih dengan gambar full-body —
out-of-distribution input akan kurang akurat apa pun gate-nya.

---

## Setup ideal

### 1. Sudut kamera

- **Sejajar mata pekerja** (parallel ke lantai). Hindari pitch >15°.
- **Bukan top-down** (CCTV langit-langit). Top-down menyembunyikan vest.
- **Bukan low-angle** (kamera di lantai mengarah ke atas). Low-angle
  membuat helm keluar frame.

### 2. Jarak

- **3 – 5 meter** ke titik di mana pekerja akan lewat.
- Lebih dekat: bbox terlalu besar, mudah cropped.
- Lebih jauh: bbox terlalu kecil, model person bisa missing.

### 3. Ketinggian

- **1.7 – 2.0 meter** di atas lantai.
- Sedikit di atas tinggi rata-rata kepala (rata-rata 1.65 m di Indonesia).
- Mounting di pintu masuk: pakai bracket yang bisa di-tilt 0–10° ke bawah.

### 4. Framing

- **Vertikal**: frame menampilkan dari atas helm (15 cm di atas kepala)
  sampai 5 cm di bawah ujung kaki.
- **Horizontal**: pekerja paling lebar (mengangkat tangan) tetap muat.

### 5. Pencahayaan

- Hindari backlight (lampu di belakang pekerja). YOLO sulit mendeteksi
  silhouette.
- Lampu LED 5000K (cool white) di depan area deteksi.
- Outdoor: hindari kamera menghadap matahari pagi/sore.

---

## Threshold default `is_full_body_bbox`

Helper `is_full_body_bbox(person_bbox, frame_shape, min_height_ratio=0.6, edge_margin_px=20)`
di `detection_filters.py` mengeluarkan `True` ketika:

1. `(y2 - y1) / frame_height >= 0.6` — person mengisi minimal 60% tinggi
   frame.
2. `frame_height - y2 <= 20` piksel — kaki dekat bottom frame.

Jika setup kamera kamu memenuhi panduan di atas, pekerja yang berdiri di
titik akses akan otomatis lulus gate. Jika tidak (mis. kamera atap
melihat top-down), gate akan reject sebagian besar deteksi sebagai
"non-conclusive".

### Menyesuaikan threshold

Threshold default cocok untuk kamera 640×480 atau 1280×720 yang
menampilkan pekerja berdiri di tengah frame. Kalau kamu pakai setup
spesifik (mis. lorong sempit yang memaksa close-up), kamu bisa override
parameter saat memanggil — tapi ingat trade-off:

| min_height_ratio | Efek |
|---|---|
| Lebih kecil (0.4) | Lebih banyak deteksi lulus, tapi false positive naik lagi |
| Lebih besar (0.8) | Hanya pekerja di tengah frame yang dicek, miss yang di pinggir |

---

## Trade-off close-up vs full-body

| Setup | Pro | Kontra |
|---|---|---|
| Close-up (kepala-dada) | Recall tinggi untuk helm, mudah lihat wajah | False positive vest tinggi, butuh bbox completeness gate |
| Full-body (mengikuti panduan ini) | Akurasi terbaik, sedikit FP | Butuh ruang & ketinggian mounting |
| Top-down (CCTV langit-langit) | Tidak perlu mounting baru | YOLO lemah di pose ini, akurasi rendah |

**Rekomendasi**: full-body untuk titik akses utama (gerbang masuk),
close-up sebagai backup di lokasi sempit dengan toleransi false
positive.

---

## Verifikasi setelah pemasangan

1. Jalankan `python ServiceAPDBackend.py` dengan node baru terdaftar.
2. Buka `/monitor` di dashboard.
3. Berdiri di titik akses, perhatikan kotak hijau "APD OK" muncul
   (Wave 5.5 — sebelumnya tidak ada visual feedback untuk safe).
4. Mundur ke ujung frame: kotak harus tetap muncul kalau full-body
   tetap visible.
5. Maju mendekat sampai cuma kepala-dada terlihat: sistem TIDAK boleh
   trigger violation kecuali model memang mendeteksi `no_helmet`
   secara eksplisit.
6. Cek log Python: cari baris `[detect] person bbox not full-body
   (conclusive_only)` — itu konfirmasi gate aktif.

Kalau false positive masih sering muncul di setup full-body, cek:
- Pencahayaan (lihat section 5).
- Confidence threshold di `/settings` (Wave 5.4 — slider sekarang
  ter-apply tanpa restart).
- Apakah model `ppe_best.pt` perlu di-retrain dengan dataset
  spesifik lapangan (lihat `training/2_train_ppe.py`).
