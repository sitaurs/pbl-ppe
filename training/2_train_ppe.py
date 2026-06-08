# 2_train_ppe.py
# Script training YOLOv8 custom model untuk deteksi APD (helmet dan vest).
# Dioptimasi untuk NVIDIA GPU dengan VRAM kecil, dan wajib memakai CUDA.
# Jalankan dari project root:  python training/2_train_ppe.py

import os
from pathlib import Path

# Script ini ada di training/ — project root adalah parent
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BASE_DIR = PROJECT_ROOT  # backwards compat untuk variabel lokal di bawah

# Pakai GPU pertama secara eksplisit sebelum PyTorch membaca device CUDA.
os.environ.setdefault("CUDA_VISIBLE_DEVICES", "0")
(PROJECT_ROOT / ".ultralytics").mkdir(exist_ok=True)
os.environ.setdefault("YOLO_CONFIG_DIR", str(PROJECT_ROOT / ".ultralytics"))

import torch
from ultralytics import YOLO


# =========================
# Konfigurasi Training
# =========================

# Path ke data.yaml. Bisa dioverride:
#   $env:DATA_YAML="D:\path\to\VEST-1\data.yaml"
DATA_YAML = os.environ.get("DATA_YAML", str(PROJECT_ROOT / "CHV-YOLOv8" / "data.yaml"))

# Base model ringan agar cocok untuk GPU VRAM kecil.
# Setelah refactor struktur, weights tinggal di models/.
BASE_MODEL = str(PROJECT_ROOT / "models" / "yolov8n.pt")

# Hyperparameters untuk GPU kecil seperti NVIDIA MX350 2GB.
EPOCHS = 50
BATCH_SIZE = 4
IMG_SIZE = 640
PATIENCE = 15
WORKERS = 2
GPU_DEVICE = 0

# Output Ultralytics akan masuk ke runs/detect/ppe_training/helmet_vest_v1.
PROJECT_DIR_NAME = "ppe_training"
PROJECT_DIR = str(BASE_DIR / "runs" / "detect" / PROJECT_DIR_NAME)
RUN_NAME = "helmet_vest_v1"


def require_cuda():
    """Pastikan training/validasi hanya berjalan di GPU CUDA."""
    if not torch.cuda.is_available():
        raise RuntimeError(
            "CUDA tidak tersedia. Training dibatalkan supaya beban tidak jatuh ke CPU.\n"
            "Pastikan NVIDIA driver aktif dan PyTorch yang terpasang adalah build CUDA."
        )

    torch.cuda.set_device(GPU_DEVICE)
    torch.backends.cudnn.benchmark = True
    return GPU_DEVICE


def check_environment():
    """Cek environment sebelum training."""
    print("=" * 60)
    print("  CEK ENVIRONMENT")
    print("=" * 60)

    print(f"\nPyTorch version : {torch.__version__}")
    print(f"CUDA available  : {torch.cuda.is_available()}")

    try:
        require_cuda()
    except RuntimeError as exc:
        print(f"\n{exc}")
        print("Install PyTorch CUDA, contoh:")
        print("  pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121")
        return False

    gpu_name = torch.cuda.get_device_name(GPU_DEVICE)
    gpu_memory = torch.cuda.get_device_properties(GPU_DEVICE).total_memory / (1024**3)
    print(f"GPU             : {gpu_name}")
    print(f"VRAM            : {gpu_memory:.1f} GB")

    if gpu_memory < 2.5:
        print(f"\nVRAM kecil ({gpu_memory:.1f} GB), batch_size=4 dipakai agar lebih aman.")

    if os.path.exists(DATA_YAML):
        print(f"\ndata.yaml ditemukan: {DATA_YAML}")
        with open(DATA_YAML, "r", encoding="utf-8") as f:
            print("\n  Isi data.yaml:")
            for line in f.readlines():
                print(f"    {line.rstrip()}")
    else:
        print(f"\ndata.yaml TIDAK ditemukan di: {DATA_YAML}")
        print("Pastikan kamu sudah menjalankan 1_download_dataset.py")
        print("Dan sesuaikan path DATA_YAML di file ini")
        return False

    return True


def train_model():
    """Training YOLOv8 dengan dataset PPE."""
    print("\n" + "=" * 60)
    print("  MULAI TRAINING MODEL PPE")
    print("=" * 60)

    device = require_cuda()
    print(f"\nDevice: GPU CUDA:{device}")
    print(f"Base model: {BASE_MODEL}")
    print(f"Dataset: {DATA_YAML}")
    print(f"Epochs: {EPOCHS}")
    print(f"Batch size: {BATCH_SIZE}")
    print(f"Image size: {IMG_SIZE}")
    print(f"Output: {Path(PROJECT_DIR) / RUN_NAME}")
    print()

    model = YOLO(BASE_MODEL)

    model.train(
        data=DATA_YAML,
        epochs=EPOCHS,
        batch=BATCH_SIZE,
        imgsz=IMG_SIZE,
        device=device,
        patience=PATIENCE,
        workers=WORKERS,
        project=PROJECT_DIR,
        name=RUN_NAME,
        exist_ok=True,
        amp=True,
        cache=False,
        optimizer="AdamW",
        lr0=0.001,
        lrf=0.01,
        hsv_h=0.015,
        hsv_s=0.7,
        hsv_v=0.4,
        degrees=5.0,
        translate=0.1,
        scale=0.3,
        flipud=0.0,
        fliplr=0.5,
        mosaic=0.8,
    )

    save_dir = Path(getattr(model.trainer, "save_dir", Path(PROJECT_DIR) / RUN_NAME))
    best_model_path = save_dir / "weights" / "best.pt"

    print("\n" + "=" * 60)
    print("  TRAINING SELESAI!")
    print("=" * 60)
    print("\n  Model terbaik tersimpan di:")
    print(f"  {best_model_path}")
    print()
    print("  Untuk menggunakan model ini di backend:")
    print("  update PPE_MODEL_PATH di ServiceAPDBackend.py menjadi:")
    print(f'  "{best_model_path}"')

    return str(best_model_path)


def validate_model(model_path):
    """Validasi model yang sudah ditrain."""
    print("\n" + "=" * 60)
    print("  VALIDASI MODEL")
    print("=" * 60)

    model = YOLO(model_path)
    device = require_cuda()

    results = model.val(
        data=DATA_YAML,
        device=device,
        batch=BATCH_SIZE,
        imgsz=IMG_SIZE,
    )

    print(f"\n  mAP50     : {results.box.map50:.4f}")
    print(f"  mAP50-95  : {results.box.map:.4f}")
    print(f"  Precision : {results.box.mp:.4f}")
    print(f"  Recall    : {results.box.mr:.4f}")

    if results.box.map50 > 0.5:
        print("\n  Model cukup baik (mAP50 > 0.5)")
    else:
        print("\n  Model kurang baik, coba tambah epochs atau gunakan dataset lebih banyak")


if __name__ == "__main__":
    print("=" * 60)
    print("  TRAINING YOLOV8 - DETEKSI APD (HELMET & VEST)")
    print("  GPU ONLY / CUDA REQUIRED")
    print("=" * 60)

    if not check_environment():
        print("\nTraining dibatalkan. Perbaiki error di atas terlebih dahulu.")
        exit(1)

    input("\nTekan ENTER untuk mulai training (atau Ctrl+C untuk batal)...")

    best_path = train_model()

    if os.path.exists(best_path):
        validate_model(best_path)
    else:
        print(f"\nModel tidak ditemukan di {best_path}")
