# Other

Parking lot untuk file/folder yang **tidak dipakai aktif** tapi belum dihapus karena masih ada nilai historis atau referensi.

Aturan: kalau bingung apakah file boleh dihapus, taruh di sini dulu. Setiap beberapa bulan, audit isinya — yang terbukti tidak pernah dipakai dipindah ke `legacy/` atau dihapus permanen.

## Struktur

```
other/
├── datasets/             # Dataset alternative
│   └── VEST-1/           # Dataset Roboflow dari iterasi awal (sudah migrasi ke CHV-YOLOv8)
│
├── esp32-alarm-orig/     # Firmware ESP32 generasi pertama (eksperimen sebelum alarm_apd)
│
├── ptz-control/          # Eksperimen kontrol PTZ camera (server.py standalone)
│
├── sound/                # Source audio + helper upload ke VPS
│   ├── alaram_gas.mp3.mpeg    # Source audio gas alarm
│   ├── jokowiv2.mpeg          # Source audio APD violation
│   ├── gas_b64.txt            # Base64 helper saat upload via SSH
│   └── ssh_cmd.txt            # SSH command sequence saat upload
│
├── orphan-models/        # Model weights yang tidak ada referensi di kode
│
└── dev-utils/            # Helper script untuk development
    ├── check_disk.ps1         # Cek disk space (saat training butuh ruang)
    ├── check_disk_2.ps1       # Versi alternative
    └── test_agentrouter.py    # Eksperimen LangChain (orphan)
```

## Kapan Dihapus?

- `datasets/VEST-1/` — kalau training pipeline tidak pernah balik pakai ini
- `esp32-alarm-orig/` — kalau `alarm_apd/` proven stabil di production
- `sound/*.mpeg` — sudah di-upload ke VPS, file source tidak dipakai
- `dev-utils/` — kalau tidak dipakai >6 bulan
- `orphan-models/` — selalu OK dihapus (tidak ada referensi)

## Catatan

Folder `other/sound/*.mp3`, `*.mpeg`, `*.txt` di-`.gitignore` agar file audio besar tidak ke-commit.
