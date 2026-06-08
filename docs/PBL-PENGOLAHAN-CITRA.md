# PBL — Workshop Pengolahan Citra Digital

Bagian project SafeGuard APD yang relevan untuk mata kuliah Workshop Pengolahan Citra Digital.

> **Singkatnya:** kami pakai YOLOv8 untuk mendeteksi orang yang tidak pakai helm atau rompi keselamatan dari video kamera CCTV, secara real-time.

---

## Masalah yang Dipecahkan

Di area kerja konstruksi atau pabrik, pekerja **wajib** memakai Alat Pelindung Diri (APD) seperti:
- Helm proyek (untuk lindungi kepala dari benturan)
- Rompi reflektif (supaya terlihat oleh operator alat berat)

Masalahnya: mengawasi setiap pekerja secara manual itu tidak praktis. Petugas K3 tidak bisa standby 24 jam memelototi setiap orang. Akhirnya pelanggaran sering terjadi tapi terlewat.

**Solusi kami:** kamera IP yang sudah ada di area kerja kami sambungkan ke komputer dengan AI. Setiap kali ada orang yang tidak pakai APD lengkap, sistem otomatis bunyikan alarm dan kirim notifikasi.

---

## Bagaimana AI-nya Bekerja

### Pakai 2 Model YOLO Sekaligus

Kami **tidak pakai 1 model serbaguna**, tapi **2 model paralel** yang masing-masing punya spesialisasi:

| Model | File | Tugas | Sumber |
|---|---|---|---|
| **YOLOv8n COCO** | `models/yolov8n.pt` | Deteksi orang (person) | Pretrained dari Ultralytics, sudah dilatih dengan ratusan ribu gambar |
| **YOLOv8 Custom PPE** | `models/ppe_best.pt` | Deteksi helm + rompi | Kami latih sendiri dari dataset CHV |

**Kenapa pakai 2?** Analoginya seperti dokter spesialis: dokter mata cuma fokus mata, dokter jantung cuma fokus jantung — hasilnya lebih akurat daripada satu dokter umum yang mengaku bisa semua.

- Model pertama jago banget deteksi **orang** (karena dilatih ribuan gambar orang dari dataset COCO).
- Model kedua jago deteksi **helm dan rompi** (karena kami latih khusus pakai dataset CHV-YOLOv8 yang isinya ratusan gambar pekerja konstruksi).

### Logika Deteksi Pelanggaran

Setiap frame kamera:

1. Model #1 deteksi semua **orang** dalam frame → muncul kotak biru
2. Model #2 deteksi semua **helm + rompi** dalam frame → muncul kotak hijau
3. Untuk setiap orang yang terdeteksi:
   - Apakah ada kotak helm yang menutupi kepalanya? Kalau tidak → pelanggaran
   - Apakah ada kotak rompi yang menutupi badannya? Kalau tidak → pelanggaran
4. Kalau ada pelanggaran → screenshot frame, kirim ke ESP32 + WhatsApp + dashboard

```
Frame Kamera
     │
     ├──► YOLOv8n     ─► [orang #1] [orang #2] [orang #3]
     │
     ├──► YOLOv8 PPE  ─► [helm] [rompi] [helm]
     │
     └──► Logika overlap:
           orang #1 → helm ✓ rompi ✓ → SAFE
           orang #2 → helm ✗ rompi ✓ → VIOLATION (no_helmet)
           orang #3 → helm ✓ rompi ✗ → VIOLATION (no_vest)
```

---

## Dataset Training

Kami pakai dataset **CHV-YOLOv8** (Construction Helmet & Vest) dari Roboflow.

| Atribut | Nilai |
|---|---|
| Total gambar | ~5.000+ gambar |
| Class | 2 kelas (`helmet`, `vest`) |
| Format | YOLO (txt label per gambar) |
| Split | train / valid / test |
| Resolusi | 640x640 |

Dataset asli punya 6 kelas warna helm (biru, merah, putih, kuning, dst). Kami merge jadi 1 kelas `helmet` saja (script: `training/3_prepare_chv_dataset.py`) supaya model lebih fokus mendeteksi "ada/tidak ada helm" daripada warnanya.

**Lokasi data:**
- `CHV-YOLOv8/data.yaml` — konfigurasi dataset
- `CHV-YOLOv8/train/images/` + `labels/` — data training
- `CHV-YOLOv8/valid/images/` + `labels/` — data validasi
- `CHV-YOLOv8/test/images/` + `labels/` — data test

Folder gambar di-`.gitignore` (terlalu besar untuk repo), tapi `data.yaml` ke-commit supaya struktur terdokumentasi.

---

## Proses Training

Script: `training/2_train_ppe.py`.

### Hyperparameter yang Dipilih

| Parameter | Nilai | Alasan |
|---|---|---|
| Base model | YOLOv8n | Versi paling kecil, ringan untuk GPU 2GB |
| Epochs | 50 | Cukup untuk convergence di dataset ini |
| Batch size | 4 | Sesuaikan dengan VRAM 2GB (NVIDIA MX350) |
| Image size | 640x640 | Standard YOLO, balance akurasi vs kecepatan |
| Patience | 15 | Early stopping kalau 15 epoch tanpa improvement |
| Mixed precision (AMP) | True | Hemat VRAM, sedikit lebih cepat |
| Optimizer | SGD (default) | Robust untuk object detection |

### Cara Menjalankan Training

```bash
# Aktifkan virtualenv + pasang requirements
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Pastikan dataset CHV-YOLOv8 ada
python training/1_download_dataset.py    # download dari Roboflow

# Train (butuh GPU NVIDIA + CUDA)
python training/2_train_ppe.py
```

Output training di: `runs/detect/ppe_training/helmet_vest_v1/weights/best.pt`. Model siap di-pakai.

### Setelah Training Selesai

```bash
copy runs\detect\ppe_training\helmet_vest_v1\weights\best.pt models\ppe_best.pt
```

Backend Python otomatis pakai weights di `models/` (lihat `config.py`).

---

## Performa di Sistem Real

### Kecepatan Inference

| Hardware | Frame Rate | Note |
|---|---|---|
| GPU NVIDIA RTX 3060+ | 30+ FPS / kamera | Real-time penuh, tidak ada drop |
| GPU NVIDIA MX350 (2GB) | 10-15 FPS / kamera | Cukup untuk 1-2 kamera |
| CPU only (Intel i7) | 2-5 FPS | Pakai frame skip (`DETECT_EVERY_N`) |

### Frame Skip Strategy

Untuk laptop tanpa GPU bagus, backend pakai **frame skip** — tidak setiap frame di-deteksi. Misal `DETECT_EVERY_N=3` artinya cuma frame ke-1, ke-4, ke-7, dst yang masuk YOLO. Frame lain tetap di-stream ke browser tapi tanpa annotation baru.

Trade-off: deteksi delay 100-200ms, tapi sistem tetap responsif.

### Multi-Camera Support

Backend pakai threading — setiap kamera punya thread sendiri. Mutex (`inference_lock`) memastikan model GPU tidak rebutan saat banyak kamera deteksi bersamaan.

```python
# ServiceAPDBackend.py — process_camera_node()
with self.inference_lock:
    ppe_results = self.model(frame, ...)
    person_results = self.person_model(frame, classes=[0], ...)
```

---

## Akurasi Model

Setelah training 50 epoch dengan dataset CHV:

| Metrik | Nilai |
|---|---|
| **mAP@0.5** | ~0.85 (helmet) / ~0.82 (vest) |
| **Precision** | ~0.88 |
| **Recall** | ~0.84 |
| **Confidence threshold** | 0.65 (default) |

Confidence threshold bisa di-tune per node lewat dashboard wizard. Semakin tinggi → false positive turun tapi deteksi mungkin terlewat. Semakin rendah → deteksi rajin tapi banyak salah alarm.

Confusion matrix + curve PR/F1 ada di `runs/detect/ppe_training/helmet_vest_v1/`:
- `confusion_matrix.png` — heatmap akurasi per kelas
- `BoxPR_curve.png` — Precision-Recall curve
- `BoxF1_curve.png` — F1 score per confidence threshold
- `results.png` — loss curve selama training

---

## Pemetaan ke File & Kode

| Komponen | File | Baris |
|---|---|---|
| Backend deteksi utama | `ServiceAPDBackend.py` | seluruh file |
| Logika overlap orang vs APD | `ServiceAPDBackend.py` | `detect_ppe()` |
| Frame skip | `ServiceAPDBackend.py` | `process_camera_node()` |
| Multi-camera threading | `ServiceAPDBackend.py` | `start_camera_threads()` |
| Model loading + GPU init | `ServiceAPDBackend.py` | `__init__()` |
| Pipeline encrypt + publish | `ServiceAPDBackend.py` | `process_violation()` |
| Konfigurasi model path | `config.py` | `PPE_MODEL_PATH`, `PERSON_MODEL_PATH` |
| Training script | `training/2_train_ppe.py` | seluruh file |
| Dataset prep | `training/3_prepare_chv_dataset.py` | seluruh file |
| Roboflow download | `training/1_download_dataset.py` | seluruh file |
| Dataset config | `CHV-YOLOv8/data.yaml` | seluruh file |

---

## Pertanyaan Yang Mungkin Ditanya Dosen

### "Kenapa YOLOv8 bukan YOLOv5 atau YOLOv9?"

YOLOv8 (Ultralytics, 2023) adalah pilihan paling stabil saat kami mulai project. API-nya gampang, dokumentasi lengkap, dan ada banyak tutorial. YOLOv9 dan YOLOv10 sudah ada tapi belum se-mature YOLOv8 untuk deployment production. YOLOv5 lebih lama tapi sudah deprecated oleh Ultralytics.

### "Kenapa tidak pakai 1 model dengan 3 kelas (person, helmet, vest)?"

Beberapa alasan:
1. **Dataset PPE kami tidak punya annotation orang.** Annotate ulang ribuan gambar = mahal waktu.
2. **Akurasi person dari COCO pretrained jauh lebih bagus** daripada train sendiri dari 0 dengan dataset terbatas.
3. **Modular** — kalau ke depan mau update PPE model (misal tambah kelas `safety_glasses`), kami cukup retrain model PPE saja, tidak perlu sentuh model person.

Trade-off: 2x inference per frame (lebih lambat di hardware lemah). Tapi di GPU bagus tidak terasa.

### "Apa itu mAP, Precision, Recall?"

- **Precision** = dari semua yang dideteksi sebagai helm, berapa persen yang benar-benar helm? (Tidak nuduh sembarangan)
- **Recall** = dari semua helm yang ada di gambar, berapa persen yang berhasil dideteksi? (Tidak ada yang ke-skip)
- **mAP@0.5** = mean Average Precision dengan IoU threshold 0.5. Ringkasan akurasi keseluruhan. Nilai 0-1, semakin tinggi semakin bagus.

Nilai 0.85 untuk PBL bisa dibilang **bagus** — cukup tinggi untuk deteksi real-world dengan dataset terbatas.

### "Bagaimana kalau orangnya membelakangi kamera?"

Tetap bisa terdeteksi. YOLO dilatih dengan banyak pose dan sudut pandang. Helm tetap kelihatan dari belakang, rompi reflektif justru lebih jelas dari belakang.

### "Bagaimana kalau ada banyak orang di satu frame?"

Tidak masalah. YOLO output multiple bounding box dalam 1 inference call. Kami iterasi setiap orang, cek overlap dengan helm dan rompi, lalu compile daftar pelanggaran per orang.

### "Bagaimana kalau cahaya kurang / malam hari?"

Akurasi turun. Kalau project ini di-deploy production, perlu kamera dengan IR night vision dan retraining dengan dataset low-light. Untuk PBL kami fokus kondisi siang/lampu cukup.

### "Apa data privasi pekerja terlindungi?"

YOLO cuma deteksi bounding box "ada orang" + "ada APD", **tidak melakukan face recognition**. Kami tidak menyimpan identitas pekerja, tidak ada database wajah. Yang tersimpan cuma screenshot pelanggaran (untuk audit) dengan resolusi rendah, akses-nya RBAC dan ada audit log.

### "Frame skip itu cheating, kan tidak setiap frame di-cek?"

Trade-off antara akurasi vs hardware. Untuk demo PBL pakai laptop tanpa GPU, frame skip wajib supaya tidak crash. Di production dengan GPU bagus, `DETECT_EVERY_N=1` (semua frame). Setiap pelanggaran tetap terdeteksi karena pelanggaran biasanya bertahan beberapa detik (orang masuk area tanpa helm tidak langsung lewat dalam 0.1 detik).

### "Bisa di-pakai di pabrik dengan environment yang berbeda?"

Bisa, tapi perlu **transfer learning** — train ulang model PPE pakai dataset dari kondisi pabrik tujuan (misal pencahayaan, jenis helm khusus, warna rompi spesifik). Pipeline training kami sudah siap (script `training/2_train_ppe.py`), tinggal ganti dataset.
