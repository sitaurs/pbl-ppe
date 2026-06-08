# Training Pipeline

ML pipeline untuk train model deteksi APD (helmet + vest) dengan YOLOv8.

## Prasyarat

- Python 3.10+
- NVIDIA GPU dengan CUDA 11.8+ (CPU juga bisa, tapi sangat lambat)
- `pip install -r ../requirements.txt`

## Workflow

Jalankan script secara berurutan dari **project root**:

### 1. Download Dataset

```bash
python training/1_download_dataset.py
```

Download dataset PPE dari Roboflow API. Set env `ROBOFLOW_API_KEY` di `.env` dulu.

Output: folder `CHV-YOLOv8/` di project root.

### 2. Prepare CHV Dataset (opsional, jika sumber bukan Roboflow)

```bash
python training/3_prepare_chv_dataset.py
```

Konversi dataset CHV (Construction Helmet & Vest) format raw ke struktur YOLO. Class mapping:
- vest → 1
- blue/red/white/yellow helmet → 0

### 3. Train Model

```bash
python training/2_train_ppe.py
```

Hyperparameter default sudah dioptimasi untuk GPU VRAM kecil (NVIDIA MX350 2GB):
- epochs 50, batch 4, image size 640, patience 15

Output: `runs/detect/ppe_training/helmet_vest_v1/weights/best.pt`

### 4. Deploy

Salin weights ke `models/` agar dipakai backend:

```bash
copy runs\detect\ppe_training\helmet_vest_v1\weights\best.pt models\ppe_best.pt
```

Restart backend Python (`python ServiceAPDBackend.py`) — model baru otomatis di-load.

### 5. Upload ke Roboflow (opsional)

```bash
python training/upload_model_to_roboflow.py
```

Upload weights dan dataset ke Roboflow project untuk hosted inference. Edit `WORKSPACE`/`PROJECT_ID` di file dulu.

## Override via Environment

```bash
# Override path data.yaml (mis. testing dataset alternative)
$env:DATA_YAML="D:\path\to\custom\data.yaml"
python training/2_train_ppe.py

# Override base model
$env:BASE_MODEL="models/yolov8s.pt"  # gunakan yolov8s daripada yolov8n
```

## Catatan

- File-file di sini **tidak dipakai saat runtime** (hanya untuk training fase development).
- Backend production cukup butuh `models/ppe_best.pt` + `models/yolov8n.pt`.
- Folder `runs/` di-gitignore (output ultralytics, regenerate setiap training).
