# 3_prepare_chv_dataset.py
# Konversi CHV_dataset.zip ke format YOLOv8 untuk training APD:
#   0: helmet
#   1: vest
#
# Dataset asli:
#   0: person
#   1: vest
#   2: blue helmet
#   3: red helmet
#   4: white helmet
#   5: yellow helmet
#
# Class person diabaikan karena backend memakai yolov8n.pt untuk deteksi orang.

import shutil
import zipfile
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
ZIP_PATH = Path(r"C:\Users\Xrif\Downloads\CHV_dataset.zip")
OUTPUT_DIR = BASE_DIR / "CHV-YOLOv8"

OLD_TO_NEW = {
    1: 1,  # vest -> vest
    2: 0,  # blue helmet -> helmet
    3: 0,  # red helmet -> helmet
    4: 0,  # white helmet -> helmet
    5: 0,  # yellow helmet -> helmet
}

SPLIT_FILES = {
    "train": "CHV_dataset/data split/train.txt",
    "valid": "CHV_dataset/data split/valid.txt",
    "test": "CHV_dataset/data split/test.txt",
}


def read_split(zip_file, split_path):
    content = zip_file.read(split_path).decode("utf-8", errors="replace")
    return [line.strip() for line in content.splitlines() if line.strip()]


def convert_label(label_text):
    converted = []
    for raw_line in label_text.splitlines():
        parts = raw_line.strip().split()
        if len(parts) != 5:
            continue

        try:
            old_class_id = int(parts[0])
        except ValueError:
            continue

        new_class_id = OLD_TO_NEW.get(old_class_id)
        if new_class_id is None:
            continue

        converted.append(" ".join([str(new_class_id), *parts[1:]]) + "\n")

    return converted


def prepare_dataset():
    if not ZIP_PATH.exists():
        raise FileNotFoundError(f"Dataset zip tidak ditemukan: {ZIP_PATH}")

    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)

    stats = {
        "images": 0,
        "label_files": 0,
        "labels_kept": 0,
        "empty_labels": 0,
        "missing_labels": 0,
    }

    with zipfile.ZipFile(ZIP_PATH) as zip_file:
        for split, split_path in SPLIT_FILES.items():
            image_paths = read_split(zip_file, split_path)
            image_out_dir = OUTPUT_DIR / split / "images"
            label_out_dir = OUTPUT_DIR / split / "labels"
            image_out_dir.mkdir(parents=True, exist_ok=True)
            label_out_dir.mkdir(parents=True, exist_ok=True)

            for image_path in image_paths:
                source_image = image_path
                image_name = Path(image_path).name
                label_name = Path(image_name).with_suffix(".txt").name
                source_label = f"CHV_dataset/annotations/{label_name}"

                try:
                    image_bytes = zip_file.read(source_image)
                except KeyError:
                    print(f"Skip image hilang: {source_image}")
                    continue

                (image_out_dir / image_name).write_bytes(image_bytes)
                stats["images"] += 1

                try:
                    label_text = zip_file.read(source_label).decode("utf-8", errors="replace")
                except KeyError:
                    stats["missing_labels"] += 1
                    (label_out_dir / label_name).write_text("", encoding="utf-8")
                    continue

                converted = convert_label(label_text)
                (label_out_dir / label_name).write_text("".join(converted), encoding="utf-8")
                stats["label_files"] += 1
                stats["labels_kept"] += len(converted)
                if not converted:
                    stats["empty_labels"] += 1

    data_yaml = f"""train: {OUTPUT_DIR / 'train' / 'images'}
val: {OUTPUT_DIR / 'valid' / 'images'}
test: {OUTPUT_DIR / 'test' / 'images'}

nc: 2
names:
  0: helmet
  1: vest
"""
    (OUTPUT_DIR / "data.yaml").write_text(data_yaml, encoding="utf-8")

    print("=" * 60)
    print("CHV dataset siap untuk YOLOv8")
    print("=" * 60)
    print(f"Output       : {OUTPUT_DIR}")
    print(f"Images       : {stats['images']}")
    print(f"Label files  : {stats['label_files']}")
    print(f"Labels kept  : {stats['labels_kept']}")
    print(f"Empty labels : {stats['empty_labels']}")
    print(f"Missing lbls : {stats['missing_labels']}")
    print(f"data.yaml    : {OUTPUT_DIR / 'data.yaml'}")


if __name__ == "__main__":
    prepare_dataset()
