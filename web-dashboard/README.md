# Web Dashboard — Sistem Monitoring APD

Dashboard web untuk monitoring real-time deteksi pelanggaran APD, manajemen node/kamera, dan log pelanggaran.

## Tech Stack

- **Next.js 16** (App Router)
- **React 19**
- **Tailwind CSS 4**
- **Lucide React** (icons)
- **TypeScript 5**

## Menjalankan

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`

## Halaman

| Route | Fungsi |
|-------|--------|
| `/` | Live Dashboard — streaming video real-time via WebSocket |
| `/pic` | Manajemen Node & PIC — tabel data kamera dan penanggung jawab |
| `/node/add` | Tambah Node — form pendaftaran kamera baru |
| `/violations` | Log Pelanggaran — riwayat pelanggaran + status notifikasi WA |

## API Routes

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| `GET` | `/api/nodes` | Daftar semua node |
| `POST` | `/api/nodes` | Tambah node baru |
| `DELETE` | `/api/nodes/[id]` | Hapus node |
| `GET` | `/api/violations` | Daftar log pelanggaran |
| `POST` | `/api/violations` | Catat pelanggaran baru |

## Database

Data disimpan di file JSON (`data/db.json` dan `data/violations.json`).
Dibaca oleh backend Python (`ServiceAPDBackend.py`) untuk konfigurasi kamera.
