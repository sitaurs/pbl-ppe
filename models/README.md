# Models

YOLO model weights yang dipakai backend deteksi APD.

## Isi

| File | Ukuran | Sumber | Fungsi |
|---|---|---|---|
| `yolov8n.pt` | ~6 MB | Pretrained Ultralytics COCO | Person detection (kelas `person` dari COCO) |
| `ppe_best.pt` | ~6 MB | Hasil training `training/2_train_ppe.py` | Deteksi helmet + vest (custom 2 kelas) |

## Kenapa Tidak Di-Commit

Weights tidak di-commit ke git karena:

- File `.pt` berukuran besar (puluhan MB+ kalau di-train ulang dengan dataset penuh)
- Hasil training spesifik per-machine (bisa beda akurasi antar checkpoint)
- Git LFS akan memakan kuota cepat

## Cara Mendapatkan Weights

### Opsi 1: Download dari laptop dev via TUI Config Bundle

Cara paling cepat — paket weights ikut di-bundle:

```bash
# Di laptop dev
python tui.py
# tekan E (Export Bundle), bundle akan include models/*.pt
```

```bash
# Di laptop demo
python tui.py
# tekan I (Import Bundle), pilih file ZIP, weights otomatis ke models/
```

### Opsi 2: Train ulang dari dataset CHV

```bash
# Pertama, download dataset (jika CHV-YOLOv8/ kosong)
python training/1_download_dataset.py

# Train (butuh GPU NVIDIA + CUDA)
python training/2_train_ppe.py

# Output: runs/detect/ppe_training/helmet_vest_v1/weights/best.pt
# Salin ke models/ppe_best.pt agar dipakai backend
copy runs\detect\ppe_training\helmet_vest_v1\weights\best.pt models\ppe_best.pt
```

### Opsi 3: Download yolov8n.pt manual (untuk person detection)

Pretrained COCO yolov8n (~6 MB):

```bash
# Auto-download saat pertama kali pakai
python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

# Atau dari Ultralytics releases:
# https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt
# Pindahkan ke models/yolov8n.pt
```

## Override Path via Environment Variable

Backend baca path model dari env, default ke `models/`:

```bash
# .env
PPE_MODEL_PATH=models/ppe_best.pt
PERSON_MODEL_PATH=models/yolov8n.pt
```

Override jika lokasi berbeda (misal habis training, mau coba checkpoint baru):

```bash
PPE_MODEL_PATH=runs/detect/ppe_training/helmet_vest_v2/weights/best.pt
```
