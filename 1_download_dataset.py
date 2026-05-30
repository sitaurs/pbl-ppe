# 1_download_dataset.py
# Script untuk download dataset PPE dari Roboflow dan remap class yang duplikat
# Jalankan: python 1_download_dataset.py

import os
import glob
import shutil

# =========================
# GANTI API KEY KAMU DI SINI
# Cara mendapatkan API Key:
# 1. Login ke roboflow.com
# 2. Klik avatar → Settings → API Key
# 3. Copy dan paste di bawah
# =========================
ROBOFLOW_API_KEY = "7Rbela7NM129E023jux0"  # <-- GANTI INI


def download_dataset():
    """Download dataset dari Roboflow Universe."""
    # pyrefly: ignore [missing-import]
    from roboflow import Roboflow

    if ROBOFLOW_API_KEY == "YOUR_API_KEY":
        print("=" * 60)
        print("ERROR: Kamu belum mengisi API Key Roboflow!")
        print()
        print("Cara mendapatkan API Key:")
        print("1. Buka https://roboflow.com dan login/sign up")
        print("2. Klik avatar di kanan atas → Settings")
        print("3. Copy API Key")
        print("4. Paste di variabel ROBOFLOW_API_KEY di file ini")
        print("=" * 60)
        return None

    print("Downloading dataset dari Roboflow...")
    print("Workspace: harami-rdknl")
    print("Project: vest-ctyuk")
    print("Version: 1")
    print()

    rf = Roboflow(api_key=ROBOFLOW_API_KEY)
    project = rf.workspace("harami-rdknl").project("vest-ctyuk")
    version = project.version(1)

    dataset = version.download("yolov8")

    print(f"\nDataset berhasil didownload ke: {dataset.location}")
    return dataset.location


def remap_classes(dataset_path):
    """
    Remap class-class yang duplikat menjadi 4 class utama:
    - 0: helmet     (dari: helmet, Helmet)
    - 1: no_helmet  (dari: no helmet, no_helmet, No-Helmet)
    - 2: vest       (dari: vest, Vest, Reflective-vest, Safety-Vest, Safety-vest, safety vest..., Yelek)
    - 3: no_vest    (dari: no vest, no_vest, No-Vest)

    Class lain (Person, worker, Glass, Goggles, Gloves, Safety-Boot, 
    protective_suit, 0, 1, 2, 3, 4) akan diabaikan/dihapus.
    """
    print("\n" + "=" * 60)
    print("Remapping class labels...")
    print("=" * 60)

    # Pertama, baca data.yaml untuk mendapatkan mapping class asli
    yaml_path = os.path.join(dataset_path, "data.yaml")

    if not os.path.exists(yaml_path):
        print(f"ERROR: data.yaml tidak ditemukan di {yaml_path}")
        return

    # Parse data.yaml secara manual
    original_classes = {}
    with open(yaml_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    in_names = False
    for line in lines:
        stripped = line.strip()

        if stripped.startswith("names:"):
            in_names = True
            continue

        if in_names:
            if stripped.startswith("- "):
                # Format list: - classname
                class_name = stripped[2:].strip().strip("'\"")
                class_id = len(original_classes)
                original_classes[class_id] = class_name
            elif ":" in stripped and stripped[0].isdigit():
                # Format dict: 0: classname
                parts = stripped.split(":", 1)
                class_id = int(parts[0].strip())
                class_name = parts[1].strip().strip("'\"")
                original_classes[class_id] = class_name
            elif stripped and not stripped.startswith("#") and not stripped.startswith("-"):
                in_names = False

    print(f"\nClass asli dari dataset ({len(original_classes)} classes):")
    for cid, cname in sorted(original_classes.items()):
        print(f"  {cid}: {cname}")

    # Definisikan mapping ke 4 class baru
    helmet_names = {"helmet", "Helmet"}
    no_helmet_names = {"no helmet", "no_helmet", "No-Helmet"}
    vest_names = {
        "vest", "Vest", "Reflective-vest", "Safety-Vest",
        "Safety-vest", "Yelek"
    }
    # Juga termasuk nama yang panjang
    vest_partial = "safety vest"
    no_vest_names = {"no vest", "no_vest", "No-Vest"}

    # Buat mapping: old_class_id -> new_class_id (atau None jika dihapus)
    class_remap = {}
    for old_id, old_name in original_classes.items():
        if old_name in helmet_names:
            class_remap[old_id] = 0
        elif old_name in no_helmet_names:
            class_remap[old_id] = 1
        elif old_name in vest_names or old_name.lower().startswith(vest_partial):
            class_remap[old_id] = 2
        elif old_name in no_vest_names:
            class_remap[old_id] = 3
        else:
            class_remap[old_id] = None  # Skip class ini

    print(f"\nMapping ke class baru:")
    new_class_names = {0: "helmet", 1: "no_helmet", 2: "vest", 3: "no_vest"}
    for old_id, new_id in sorted(class_remap.items()):
        old_name = original_classes[old_id]
        if new_id is not None:
            print(f"  {old_id} ({old_name}) -> {new_id} ({new_class_names[new_id]})")
        else:
            print(f"  {old_id} ({old_name}) -> SKIP (dihapus)")

    # Proses semua file label di train, valid, test
    total_files = 0
    total_remapped = 0
    total_removed = 0

    for split in ["train", "valid", "test"]:
        label_dir = os.path.join(dataset_path, split, "labels")

        if not os.path.exists(label_dir):
            print(f"\n  Folder {split}/labels tidak ditemukan, skip.")
            continue

        label_files = glob.glob(os.path.join(label_dir, "*.txt"))
        print(f"\n  Processing {split}: {len(label_files)} label files...")

        for label_file in label_files:
            with open(label_file, "r", encoding="utf-8") as f:
                lines = f.readlines()

            new_lines = []
            for line in lines:
                parts = line.strip().split()
                if len(parts) < 5:
                    continue

                old_class_id = int(parts[0])
                new_class_id = class_remap.get(old_class_id)

                if new_class_id is not None:
                    parts[0] = str(new_class_id)
                    new_lines.append(" ".join(parts) + "\n")
                    total_remapped += 1
                else:
                    total_removed += 1

            with open(label_file, "w", encoding="utf-8") as f:
                f.writelines(new_lines)

            total_files += 1

    # Update data.yaml
    new_yaml_content = f"""train: {os.path.join(dataset_path, 'train', 'images')}
val: {os.path.join(dataset_path, 'valid', 'images')}
test: {os.path.join(dataset_path, 'test', 'images')}

nc: 4
names:
  0: helmet
  1: no_helmet
  2: vest
  3: no_vest
"""

    with open(yaml_path, "w", encoding="utf-8") as f:
        f.write(new_yaml_content)

    print(f"\n{'=' * 60}")
    print(f"Remapping selesai!")
    print(f"  Files diproses  : {total_files}")
    print(f"  Labels di-remap : {total_remapped}")
    print(f"  Labels dihapus  : {total_removed}")
    print(f"  data.yaml diupdate ke 4 class:")
    print(f"    0: helmet")
    print(f"    1: no_helmet")
    print(f"    2: vest")
    print(f"    3: no_vest")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    print("=" * 60)
    print("  DOWNLOAD & REMAP DATASET PPE (Helmet & Vest)")
    print("  Dataset: Roboflow Universe - harami-rdknl/vest-ctyuk")
    print("=" * 60)

    dataset_location = download_dataset()

    if dataset_location:
        remap_classes(dataset_location)
        print(f"\n✓ Dataset siap digunakan untuk training!")
        print(f"  Lokasi: {dataset_location}")
        print(f"  Selanjutnya jalankan: python 2_train_ppe.py")
