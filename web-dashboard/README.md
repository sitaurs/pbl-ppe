# Web Dashboard — Sistem Monitoring APD

Dashboard web untuk monitoring real-time deteksi pelanggaran APD, manajemen node/kamera, dan log pelanggaran. Dilengkapi sistem **Auth + RBAC** (5 role default, 34 permission granular, isolasi data per sektor) dan deployment opsional via **Cloudflare Tunnel**.

## Tech Stack

- **Next.js 16** (App Router)
- **React 19**
- **Tailwind CSS 4**
- **Lucide React** (icons)
- **TypeScript 5**
- **Prisma 5 + SQLite** untuk persistensi
- **Argon2id** (`@node-rs/argon2`) untuk hashing password
- **otpauth** untuk TOTP 2FA (RFC 6238)

## Menjalankan (mode lab / lokal)

```bash
npm install
npm run setup:env             # generate .env.local awal jika belum ada
npx prisma migrate deploy     # apply migrasi schema
npm run seed                  # seed 5 role default + user admin
npm run migrate:json-to-db    # (opsional) pindahkan data JSON lama ke DB
npm run dev
```

Buka `http://127.0.0.1:3000`. Login dengan akun `admin` (password sekali tampil di stdout saat seed pertama, simpan baik-baik) lalu wajib ganti password.

## Halaman Utama

| Route | Permission | Fungsi |
|-------|-----------|--------|
| `/` | session aja | Dashboard ringkasan |
| `/monitor` | `live:view` | Live streaming kamera real-time |
| `/violations` | `violation:read` | Log pelanggaran + acknowledge + ekspor |
| `/nodes` | `node:read` | Manajemen node + wizard (kamera + ESP32) |
| `/map` | `sector:read` | Peta sektor |
| `/reports` | `report:read` | Laporan |
| `/sectors` | `sector:read` | Manajemen sektor + assignment user |
| `/users` | `user:read` | Manajemen akun pengguna |
| `/roles` | `role:read` | Editor role + permission tree |
| `/audit-log` | `audit-log:read` | Audit log + filter + ekspor CSV |
| `/settings` | `setting:read` | Pengaturan branding / notifikasi / sistem |
| `/settings/integrations` | `setting:update:system` | Rotasi Service Token |
| `/account/security` | session | 2FA setup + recovery codes |
| `/login`, `/change-password`, `/403` | publik | Halaman auth |

## Role Default

| Role | Ringkasan |
|------|----------|
| Super_Admin | Akses penuh termasuk user/role/setting:update:system |
| Admin_K3 | Semua kecuali user/role/setting:update:system |
| Supervisor | Live monitor + acknowledge pelanggaran + report read pada sektor yang ditugaskan |
| PIC_Sektor | Read-only data sektor yang ditugaskan |
| Auditor | Read-only seluruh data + ekspor laporan + audit-log read |

## Service Token (Backend Python)

`ServiceAPDBackend.py` mengakses HTTP API tanpa session via header `Authorization: Bearer <APD_SERVICE_TOKEN>` melalui loopback `http://127.0.0.1:3000`. Endpoint yang diperbolehkan:

- `GET /api/nodes`, `GET /api/nodes/{id}`, `GET /api/nodes/{id}/status`
- `GET /api/settings`
- `POST /api/violations`
- `POST /api/nodes/{id}/heartbeat`

Rotasi token dilakukan dari halaman `/settings/integrations` (akses Super_Admin). Token baru ditampilkan satu kali; setelahnya wajib disinkronkan ke environment service Python.

## Deployment dengan Cloudflare Tunnel

Mode ini mengekspos dashboard ke internet (untuk demo dosen penguji dari luar lab) tanpa membuka port pada router.

### Prasyarat

- Akun Cloudflare gratis dengan domain di Cloudflare DNS, **atau** quick tunnel (subdomain `*.trycloudflare.com`).
- `cloudflared` ter-install di laptop deployment. Windows: download dari https://github.com/cloudflare/cloudflared/releases.

### Langkah

```powershell
# 1) Login ke Cloudflare (membuka browser)
cloudflared tunnel login

# 2) Buat named tunnel
cloudflared tunnel create safeguard-apd
# Catat tunnel UUID yang dicetak. Credential JSON tersimpan di
# C:\Users\<USER>\.cloudflared\<UUID>.json

# 3) Edit cloudflared/config.yml — ganti placeholder <tunnel-uuid> dan <USER>
#    dan setel hostname target sesuai domain Anda.

# 4) Routing DNS (jalankan sekali)
cloudflared tunnel route dns safeguard-apd safeguard.example.com

# 5) Install sebagai service Windows agar otomatis hidup setelah reboot
cloudflared service install
```

Setelah service jalan:

1. Set `BEHIND_PROXY=cloudflare` di `.env.local` agar middleware memvalidasi `CF-Connecting-IP` dan memaksa cookie `Secure`.
2. Jalankan `npm run dev` (atau `npm run start` di production build) bind ke `127.0.0.1:3000`.
3. Buka `https://safeguard.example.com/login` dari koneksi luar.

### Verifikasi WebSocket

Buka `/monitor` di browser luar; frame video harus muncul ≤ 5 detik. Jika frame stuck:
- Pastikan `cloudflared` tidak meng-cache `/ws/live`.
- Confirm `config.yml` tidak menambahkan path rewrite untuk WS.

## Mode Lokal vs Tunnel

`http://127.0.0.1:3000` selalu berfungsi penuh (login, monitor, dst.) terlepas dari status `cloudflared`. Apabila tunnel offline, deteksi YOLO + MQTT alarm tetap berjalan dan hanya akses jarak jauh yang terganggu (Req 15.7).

`ServiceAPDBackend.py` selalu memakai loopback origin sehingga tidak terpengaruh status tunnel. Header `CF-Connecting-IP` hanya divalidasi saat origin remote dan `BEHIND_PROXY=cloudflare`.

## Pemulihan Akses

Jika Anda terkunci sebagai admin (lupa password atau 2FA), jalankan dari mesin yang sama:

```bash
npm run reset:admin-password
# atau target user spesifik:
npm run reset:admin-password -- --username admin
```

Skrip akan generate password 16 karakter yang lolos Password_Policy, set `mustChangePassword=true`, dan mencetak password baru sekali ke stdout. Login ulang lalu segera ganti password.

Untuk rollback drastis ke kondisi sebelum migrasi DB, gunakan:

```bash
npm run restore-from-backup -- --backup-dir data/backup/{timestamp}
```

## Database

Data utama tersimpan di `data/safeguard.db` (SQLite WAL). Berkas backup JSON pra-migrasi otomatis dibuat di `data/backup/{timestamp}/` saat `npm run migrate:json-to-db` pertama kali dijalankan.

Skema (`prisma/schema.prisma`) mencakup 12 model: User, Role, Permission, RolePermission, Session, Sector, SectorAssignment, Node, Violation, Setting, AuditLog, RecoveryCode.

## Environment Variables

```ini
# .env.local
DATABASE_URL=file:../data/safeguard.db
APD_SERVICE_TOKEN=<64 hex chars — rotated via /settings/integrations>
APD_ENCRYPTION_KEY=<base64 32 bytes — required for 2FA TOTP secret encryption>
BEHIND_PROXY=                 # kosong di lokal, "cloudflare" di belakang tunnel
NODE_ENV=development
```

`npm run setup:env` membuat scaffolding awal dengan `APD_SERVICE_TOKEN` dan `APD_ENCRYPTION_KEY` yang sudah tergenerate.

## Test

```bash
npm test                      # vitest --run (semua unit + property test)
npx tsc --noEmit              # type check
npm run lint                  # ESLint
```

15 correctness property tests (P1–P15) merangkum invariants kritis: seed idempotency, Argon2id rehash, password policy, permission map coverage, RBAC decision, sector isolation, cache eventual consistency, session sliding, rate limiter, CSRF uniqueness, AES-GCM round-trip, audit append-only, trusted proxy validation, redirect safety, dan logout idempotency.
