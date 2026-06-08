"""
upload_model_to_roboflow.py

Upload dataset CHV-YOLOv8 ke project Roboflow secara PARALEL, generate
version, lalu deploy weights best.pt (YOLOv8) untuk Roboflow Deploy.

Jalankan: python upload_model_to_roboflow.py
"""
import os
import sys
import time
import glob
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock

from roboflow import Roboflow

API_KEY = "o7UVCjwbM4ubNSc9ulSF"
WORKSPACE = "muhammads-workspace-fn7q9"
PROJECT_ID = "ppe-5ozwl"
# Script ini di training/ — paths relatif ke project root.
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATASET_DIR = os.path.join(BASE, "CHV-YOLOv8")
WEIGHTS_DIR = os.path.join(BASE, "models")  # gunakan ppe_best.pt yang stable
LABELMAP = {"0": "helmet", "1": "vest"}
WORKERS = 12   # paralel upload

_counter_lock = Lock()
_done = 0
_ok = 0
_fail = 0


def log(msg):
    print(f"[upload] {msg}", flush=True)


def list_images(split):
    img_dir = os.path.join(DATASET_DIR, split, "images")
    if not os.path.isdir(img_dir):
        return []
    images = []
    for ext in ("*.jpg", "*.jpeg", "*.png"):
        images.extend(glob.glob(os.path.join(img_dir, ext)))
    images.sort()
    return images


def upload_one(project, img_path, split, total):
    global _done, _ok, _fail
    lbl_dir = os.path.join(DATASET_DIR, split, "labels")
    stem = os.path.splitext(os.path.basename(img_path))[0]
    label_path = os.path.join(lbl_dir, stem + ".txt")
    has_label = (
        os.path.exists(label_path)
        and os.path.getsize(label_path) > 0
        and any(line.strip() for line in open(label_path, encoding="utf-8"))
    )
    try:
        if has_label:
            project.upload(
                image_path=img_path,
                annotation_path=label_path,
                annotation_labelmap=LABELMAP,
                split=split,
                num_retry_uploads=3,
            )
        else:
            project.upload(image_path=img_path, split=split, num_retry_uploads=3)
        with _counter_lock:
            _ok += 1
    except Exception as e:
        with _counter_lock:
            _fail += 1
            if _fail <= 8:
                log(f"  gagal {os.path.basename(img_path)}: {e}")
    finally:
        with _counter_lock:
            _done += 1
            if _done % 50 == 0 or _done == total:
                log(f"  {split}: {_done}/{total} (ok={_ok}, fail={_fail})")


def upload_split(project, split):
    global _done, _ok, _fail
    images = list_images(split)
    total = len(images)
    if total == 0:
        log(f"Split '{split}' kosong, skip.")
        return 0, 0
    _done = 0
    _ok = 0
    _fail = 0
    log(f"Split '{split}': {total} gambar, {WORKERS} worker paralel...")
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = [ex.submit(upload_one, project, p, split, total) for p in images]
        for _ in as_completed(futures):
            pass
    log(f"Split '{split}' selesai: ok={_ok}, fail={_fail}")
    return _ok, _fail


def main():
    if not os.path.exists(os.path.join(WEIGHTS_DIR, "best.pt")):
        log(f"FATAL: best.pt tidak ada di {WEIGHTS_DIR}")
        sys.exit(1)

    rf = Roboflow(api_key=API_KEY)
    project = rf.workspace(WORKSPACE).project(PROJECT_ID)
    log(f"Project: {WORKSPACE}/{PROJECT_ID}")

    grand_ok = grand_fail = 0
    for split in ("train", "valid", "test"):
        ok, fail = upload_split(project, split)
        grand_ok += ok
        grand_fail += fail
    log(f"TOTAL upload: ok={grand_ok}, fail={grand_fail}")

    log("Generate version (auto-orient + resize 640)...")
    try:
        project.generate_version(settings={
            "preprocessing": {"auto-orient": True, "resize": {"width": 640, "height": 640, "format": "Stretch to"}},
            "augmentation": {},
        })
    except Exception as e:
        log(f"generate_version: {e}")

    time.sleep(8)
    project = rf.workspace(WORKSPACE).project(PROJECT_ID)
    versions = project.versions()
    if not versions:
        log("FATAL: tidak ada version untuk deploy.")
        sys.exit(1)
    version = versions[-1]
    log(f"Deploy ke version {version.version} ...")
    version.deploy(model_type="yolov8", model_path=WEIGHTS_DIR + os.sep)
    log("SELESAI. Model ter-deploy ke Roboflow.")


if __name__ == "__main__":
    main()
