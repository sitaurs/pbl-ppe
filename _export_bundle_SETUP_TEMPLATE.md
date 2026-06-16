# Setup SafeGuard APD di PC Baru (Laptop NVIDIA)

Panduan memindahkan dan menjalankan project di laptop lain yang punya GPU NVIDIA.

---

## 0. Yang Ada di Bundle Ini

| File / Folder | Isi |
|---------------|-----|
| `env_root.txt` | Konfigurasi `.env` root (MQTT, AES, service token, Cloudflare) |
| `env_local.txt` | Konfigurasi `web-dashboard/.env.local` (NextAuth, service token) |
| `env.example.txt` | Template env |
| `data/safeguard.db` | Database SQLite lengkap (user, role, node, violation, audit log, gas telemetry) |
| `data/*.json` | State files legacy (db.json, settings, violations) |
| `models/*.pt` | Model YOLO (yolov8n.pt, yolo26n.pt, model hasil training) |
| `pip-freeze.txt` | Daftar versi dependency Python yang dipakai |
| `alarm_apd/` | Firmware ESP32 + audio MP3 |

> **Catatan:** Kode sumber project di-clone dari Git. Bundle ini hanya berisi
> **konfigurasi, database, dan model** yang TIDAK masuk Git (di-gitignore).

---

## 1. Clone Repo + Salin Bundle

```powershell
git clone https://github.com/sitaurs/pbl-ppe.git
cd pbl-ppe
```

Lalu salin isi bundle:
- `env_root.txt`  → rename jadi `.env` di root project
- `env_local.txt` → rename jadi `web-dashboard\.env.local`
- `data\*`        → copy ke `web-dashboard\data\`
- `models\*.pt`   → copy file `.pt` ke root project (sesuaikan `YOLO_MODEL_PATH`)

```powershell
copy _export_bundle\env_root.txt  .env
copy _export_bundle\env_local.txt web-dashboard\.env.local
xcopy /E /I _export_bundle\data web-dashboard\data
copy _export_bundle\models\*.pt .
```

---

## 2. Setup Python + CUDA (GPU NVIDIA)

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

**Untuk GPU NVIDIA** — install PyTorch versi CUDA (BUKAN versi CPU):

```powershell
# Cek CUDA version dulu:
nvidia-smi

# Install PyTorch sesuai CUDA (contoh CUDA 12.1):
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
```

Verifikasi GPU terdeteksi:
```powershell
python check_cuda.py
# atau:
python -c "import torch; print('CUDA:', torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')"
```

> Di `.env`, `GPU_DEVICE_INDEX=0` (default). Kalau GPU tidak terdeteksi,
> service tetap jalan di CPU tapi lebih lambat.

---

## 3. Setup Web Dashboard (Next.js)

```powershell
cd web-dashboard
npm install
```

Database sudah dibawa (`data\safeguard.db`), jadi **TIDAK perlu** seed ulang.
Cukup pastikan Prisma client ter-generate + migrasi sinkron:

```powershell
npx prisma generate
npx prisma migrate deploy
```

> `migrate deploy` hanya menerapkan migrasi yang belum ada — karena DB sudah
> lengkap, biasanya langsung "No pending migrations". Aman.

Kalau mau database FRESH (tanpa data lama), hapus `data\safeguard.db` lalu:
```powershell
npx prisma migrate deploy
npm run seed   # buat admin baru, password dicetak 1x di terminal
```

---

## 4. Jalankan Sistem

Urutan penting: **Next.js dulu, baru Python.**

**Terminal 1 — Dashboard:**
```powershell
cd web-dashboard
npm run dev
```

**Terminal 2 — Backend deteksi:**
```powershell
.venv\Scripts\Activate.ps1
python ServiceAPDBackend.py
```

Verifikasi:
- `http://localhost:3000/api/health` → `{"status":"ok"}`
- `http://localhost:3000/login` → halaman login muncul
- Log Python: MQTT connected, WebSocket port 8765 aktif, GPU terdeteksi

---

## 5. Penyesuaian Konfigurasi di PC Baru

### Jika TIDAK pakai Cloudflare (lokal saja)
Edit `web-dashboard\.env.local`:
```ini
NEXTAUTH_URL=http://localhost:3000
# comment / hapus baris NEXT_PUBLIC_YOLO_WS_URL biar fallback ke ws://localhost:8765
```

### Jika TETAP pakai Cloudflare Tunnel
Token tunnel ada di `.env` (`CF_TUNNEL_TOKEN`). Tunnel ini terikat ke akun
Cloudflare, jadi bisa langsung dipakai dari PC manapun:
```powershell
cloudflared tunnel run --token <CF_TUNNEL_TOKEN>
```
Domain `apd.ecosystech.me` dan `ws-apd.ecosystech.me` akan mengarah ke PC baru
selama tunnel jalan. **Hanya satu PC** yang boleh menjalankan tunnel token ini
dalam satu waktu.

### Kredensial yang HARUS tetap sama
- `APD_SERVICE_TOKEN` di `.env` == di `.env.local` (sudah sama di bundle)
- `APD_ENCRYPTION_KEY` JANGAN diubah — kalau diubah, secret 2FA TOTP user lama
  tidak bisa di-decrypt (user harus reset 2FA)
- `NEXTAUTH_SECRET` JANGAN diubah kalau mau session lama tetap valid

---

## 6. Reset Admin Password (kalau lupa)

```powershell
cd web-dashboard
npm run reset:admin
# password baru dicetak 1x di terminal
```

---

## 7. Checklist Verifikasi PC Baru

- [ ] `python check_cuda.py` → CUDA available: True
- [ ] `npm run dev` → server ready port 3000
- [ ] `/api/health` → status ok
- [ ] Login dengan akun existing (dari DB lama) berhasil
- [ ] `python ServiceAPDBackend.py` → tidak ada ERROR startup
- [ ] Halaman `/nodes` menampilkan node yang sudah terdaftar
- [ ] Halaman `/audit-log` menampilkan history lama (bukti DB terbawa)
- [ ] (opsional) Cloudflare tunnel jalan, domain accessible

---

## Troubleshooting

| Gejala | Solusi |
|--------|--------|
| `torch.cuda.is_available()` False | Install PyTorch versi CUDA, bukan CPU. Cek `nvidia-smi` |
| Login gagal 400 | Hapus folder `web-dashboard\.next`, jalankan ulang |
| Python exit saat startup | Env wajib kosong — cek `MQTT_USERNAME/PASSWORD`, `AES_KEY`, `APD_SERVICE_TOKEN` di `.env` |
| 2FA user lama error | `APD_ENCRYPTION_KEY` berubah — restore nilai dari bundle |
| DB locked | Pastikan tidak ada proses Next.js lain yang jalan; hapus `*.db-wal`, `*.db-shm` |
| Prisma client error | `npx prisma generate` ulang |
