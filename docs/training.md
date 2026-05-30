# Panduan Training Model

## Persyaratan

- GPU NVIDIA dengan CUDA (minimal 2GB VRAM)
- PyTorch dengan CUDA support terinstall
- Dataset sudah didownload

## Langkah-langkah

### 1. Verifikasi GPU

```bash
python check_cuda.py
```

Pastikan output menunjukkan `CUDA available: True`.

### 2. Download Dataset

```bash
python 1_download_dataset.py
```

Script ini akan:
- Download dataset dari Roboflow Universe (workspace: `harami-rdknl/vest-ctyuk`)
- Remap kelas yang duplikat menjadi 4 kelas kanonik:
  - `0: helmet` — semua varian helm
  - `1: no_helmet` — tidak memakai helm
  - `2: vest` — semua varian rompi
  - `3: no_vest` — tidak memakai rompi

### 3. (Opsional) Persiapkan Dataset CHV

```bash
python 3_prepare_chv_dataset.py
```

Mengkonversi dataset CHV (Construction Hard-hat & Vest) ke format 2-kelas (helmet, vest).

### 4. Mulai Training

```bash
python 2_train_ppe.py
```

**Parameter Training:**

| Parameter | Nilai | Keterangan |
|-----------|-------|------------|
| Base Model | yolov8n.pt | YOLOv8 Nano (ringan) |
| Epochs | 50 | Iterasi training |
| Batch Size | 4 | Dioptimasi untuk VRAM kecil |
| Image Size | 640 | Resolusi input |
| Optimizer | AdamW | |
| Learning Rate | 0.001 | |
| Patience | 15 | Early stopping |

**Augmentasi:**
- Mosaic: 0.8
- Flip Horizontal: 0.5
- HSV (H=0.015, S=0.7, V=0.4)
- Rotasi: ±5°
- Translate: 0.1
- Scale: 0.3

### 5. Hasil Training

Output tersimpan di:
```
runs/detect/ppe_training/helmet_vest_v1/
├── weights/
│   ├── best.pt          ← Gunakan ini untuk produksi
│   └── last.pt
├── results.png
├── confusion_matrix.png
└── args.yaml
```

### 6. Gunakan Model

Update `PPE_MODEL_PATH` di `config.py` atau `.env` jika path berbeda.
Service `ServiceAPDBackend.py` otomatis menggunakan `best.pt` dari lokasi default.
