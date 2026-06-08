# Checklist Verifikasi End-to-End Cloudflare — Task 6.7

Panduan ini adalah checklist verifikasi manual untuk task **6.7 Verifikasi end-to-end Cloudflare**.
Semua tes di bawah ini harus dijalankan secara manual karena membutuhkan deployment live.

**Referensi:** Requirements 7.6, 7.7

---

## Pre-requisites

Pastikan semua kondisi berikut terpenuhi sebelum menjalankan tes:

- [ ] **cloudflared tunnel berjalan** sebagai Windows service:
  ```powershell
  Get-Service cloudflared
  # Status harus: Running
  ```
- [ ] **Next.js berjalan** di port 3000:
  ```powershell
  # Dari folder web-dashboard:
  npm run build
  npm start
  # Atau untuk dev: npm run dev
  ```
- [ ] **`BEHIND_PROXY=cloudflare` ada di `web-dashboard/.env.local`:**
  ```ini
  BEHIND_PROXY=cloudflare
  NEXT_PUBLIC_YOLO_WS_URL=wss://ws.safeguard.<domain>
  NEXTAUTH_URL=https://safeguard.<domain>
  NODE_ENV=production
  APD_SERVICE_TOKEN=<sama-dengan-root-.env>
  ```
- [ ] **Domain sudah di-route** ke tunnel (`cloudflared tunnel route dns ...` sudah dijalankan).
- [ ] **DNS sudah propagasi** — verifikasi:
  ```powershell
  nslookup safeguard.<domain>
  # Harus resolve ke Cloudflare CNAME (xxx.cfargotunnel.com)
  ```

---

## Test 1 — Health Check dari Device Lain

**Requirement: 7.6**

**Tujuan:** Memastikan tunnel aktif dan Next.js dapat diakses dari internet.

### Langkah

1. Dari device lain (HP atau laptop berbeda, gunakan jaringan yang berbeda / hotspot):
   ```
   Buka browser → https://safeguard.<domain>/api/health
   ```
2. Atau gunakan `curl`:
   ```bash
   curl https://safeguard.<domain>/api/health
   ```

### Expected Result

```json
{"status":"ok"}
```

**PASS:** Response body adalah `{"status":"ok"}` dengan HTTP 200.

**FAIL:** Timeout, error 521/522/523 (Cloudflare origin error), atau response berbeda.

> **Catatan:** Jika FAIL, cek log tunnel:
> ```powershell
> cloudflared tunnel info safeguard-apd
> Get-EventLog -LogName Application -Source cloudflared -Newest 20
> ```

---

## Test 2 — Audit Log IP Verification (Real User IP)

**Requirement: 7.7**

**Tujuan:** Memastikan middleware membaca `CF-Connecting-IP` header dengan benar, sehingga audit log mencatat IP user nyata — bukan IP Cloudflare edge.

### Bagaimana ini bekerja

Ketika `BEHIND_PROXY=cloudflare` diset di `.env.local`:

1. Cloudflare edge menerima request dari user, lalu menambahkan header `CF-Connecting-IP` berisi **IP asli user** (mis. `180.244.x.x`).
2. Request diteruskan ke Next.js via tunnel dari **IP edge Cloudflare** (mis. `162.158.x.x`).
3. Middleware di `src/middleware.ts` memanggil `resolveClientIp()` dari `src/lib/proxy/cloudflare-ips.ts`.
4. `resolveClientIp()` memvalidasi bahwa `remoteAddress` adalah IP Cloudflare yang sah (cek terhadap range di `CLOUDFLARE_IPV4_RANGES` / `CLOUDFLARE_IPV6_RANGES`).
5. Jika valid → `clientIp = CF-Connecting-IP` (IP user nyata).
6. Jika `remoteAddress` bukan IP Cloudflare dan bukan loopback → request **ditolak dengan HTTP 400** `untrusted_proxy_origin`.
7. `clientIp` disuntikkan ke header `x-apd-context-client-ip`, dibaca oleh API handler, dan disimpan ke tabel `AuditLog.ipAddress`.

### Langkah

1. Pastikan kamu mengakses dashboard **via Cloudflare hostname** (`https://safeguard.<domain>`), bukan via localhost.
2. Cari tahu IP publik device kamu:
   ```
   Buka browser → https://ifconfig.me
   # Catat IP (contoh: 180.244.12.34)
   ```
3. Login ke dashboard melalui `https://safeguard.<domain>/login`.
4. Buka halaman Audit Log di dashboard (biasanya `/audit-log` atau menu "Aktivitas").
5. Cari entry login yang baru saja kamu lakukan.

### Expected Result

**PASS:** Field `ipAddress` di entri audit log = IP publik device kamu (bukan IP range Cloudflare seperti `104.x.x.x`, `162.x.x.x`, `172.64.x.x`, dll).

**FAIL:** Field `ipAddress` adalah IP Cloudflare edge (berarti `CF-Connecting-IP` tidak terbaca), atau entry tidak ada.

> **Cloudflare IPv4 ranges** (untuk referensi — bukan IP yang seharusnya muncul di audit log):
> `173.245.48.0/20`, `103.21.244.0/22`, `103.22.200.0/22`, `103.31.4.0/22`,
> `141.101.64.0/18`, `108.162.192.0/18`, `190.93.240.0/20`, `188.114.96.0/20`,
> `197.234.240.0/22`, `198.41.128.0/17`, `162.158.0.0/15`, `104.16.0.0/13`,
> `104.24.0.0/14`, `172.64.0.0/13`, `131.0.72.0/22`

> **Jika FAIL:** Pastikan `.env.local` memiliki `BEHIND_PROXY=cloudflare` dan Next.js sudah di-restart setelah perubahan env.

---

## Test 3 — Cookie `apd_session` Punya Flag `Secure`

**Requirement: 7.4**

**Tujuan:** Memastikan cookie session hanya dikirim melalui koneksi HTTPS (tidak bocor via HTTP).

### Bagaimana ini bekerja

Middleware membaca env `BEHIND_PROXY=cloudflare` dan memaksa flag `Secure` pada cookie `apd_session`. Tanpa flag ini, cookie bisa dikirim via HTTP biasa yang rawan penyadapan.

### Langkah (Chrome / Edge DevTools)

1. Buka `https://safeguard.<domain>/login` di Chrome atau Edge.
2. Login dengan akun valid.
3. Tekan **F12** untuk buka DevTools.
4. Pilih tab **Application**.
5. Di panel kiri, expand **Storage → Cookies**.
6. Klik entry `https://safeguard.<domain>`.
7. Cari cookie dengan nama **`apd_session`** di tabel kanan.
8. Cek kolom **Secure** — harus ada centang (✓).

### Expected Result

**PASS:** Cookie `apd_session` memiliki:
- `Secure`: ✓ (tercentang)
- `HttpOnly`: ✓ (tercentang)
- `SameSite`: `Strict` atau `Lax`

**FAIL:** Kolom `Secure` kosong/tidak tercentang.

> **Jika FAIL:** Cek `web-dashboard/src/lib/auth/cookie-attrs.ts` untuk memastikan `secure: true` diset saat `BEHIND_PROXY=cloudflare`. Restart Next.js setelah mengubah `.env.local`.

### Langkah (Firefox DevTools)

1. Tekan **F12** → tab **Storage** → **Cookies** → pilih domain.
2. Kolom `secure` harus bernilai `true`.

---

## Test 4 — Local Fallback (Stop Tunnel, Test Localhost)

**Requirement: 7.6**

**Tujuan:** Memastikan aplikasi tetap berfungsi saat tunnel down (akses lokal via `http://127.0.0.1:3000`).

### Langkah

1. **Stop tunnel** (PowerShell Admin):
   ```powershell
   Stop-Service cloudflared
   # Verifikasi:
   Get-Service cloudflared
   # Status harus: Stopped
   ```
2. Buka browser dan akses:
   ```
   http://127.0.0.1:3000
   ```
3. Coba login dengan akun valid.
4. Navigasi ke beberapa halaman (mis. `/nodes`, `/audit-log`).

### Expected Result

**PASS:** Dashboard tetap bisa diakses dan login berhasil via `http://127.0.0.1:3000`. Fungsi inti tetap berjalan normal.

**FAIL:** Halaman error, tidak bisa login, atau crash.

> **Catatan penting:** Saat akses via localhost tanpa `BEHIND_PROXY=cloudflare` berlaku, cookie `Secure` mungkin tidak ter-set (karena HTTP). Ini normal dan expected — Secure flag hanya relevan saat deploy via HTTPS. Fungsi login dan navigasi harus tetap berjalan.
>
> Jika kamu ingin test lokal dengan `.env.local` tetap memiliki `BEHIND_PROXY=cloudflare`, akses via `http://127.0.0.1:3000` tetap akan berfungsi karena middleware memperlakukan loopback (`127.0.0.1`) secara khusus: request loopback **tidak** divalidasi sebagai Cloudflare IP — mereka langsung diteruskan (`clientIp = remoteAddress = 127.0.0.1`). Ini sesuai implementasi di `cloudflare-ips.ts: isLoopback()`.

5. **Restart tunnel** setelah selesai test:
   ```powershell
   Start-Service cloudflared
   ```

---

## Ringkasan Status Test

Isi tabel ini setelah menjalankan setiap test:

| Test | Deskripsi | Expected | Status |
|------|-----------|----------|--------|
| **Test 1** | Health check via `https://safeguard.<domain>/api/health` dari device lain | `{"status":"ok"}` | ⬜ BELUM |
| **Test 2** | Audit log `ipAddress` = IP user nyata, bukan IP Cloudflare edge | IP user nyata | ⬜ BELUM |
| **Test 3** | Cookie `apd_session` punya flag `Secure` di DevTools | Secure ✓ | ⬜ BELUM |
| **Test 4** | Stop tunnel → akses `http://127.0.0.1:3000` → masih jalan | Dashboard berfungsi | ⬜ BELUM |

Ganti `⬜ BELUM` dengan `✅ PASS` atau `❌ FAIL (catatan)` setelah verifikasi.

---

## Konfirmasi Middleware Integration

`cloudflare-ips.ts` middleware integration **sudah ada dan aktif** di codebase:

| File | Status | Keterangan |
|------|--------|------------|
| `src/lib/proxy/cloudflare-ips.ts` | ✅ Exists | Export `resolveClientIp()`, `isCloudflareIp()`, `isLoopback()`, range IPv4/IPv6 |
| `src/middleware.ts` | ✅ Integrated | Import `resolveClientIp` dan digunakan di step 3 middleware decision flow |

Middleware menolak request yang `remoteAddress`-nya bukan Cloudflare IP maupun loopback saat `BEHIND_PROXY=cloudflare` — sesuai Requirement 7.7.

---

## Referensi

- `src/lib/proxy/cloudflare-ips.ts` — implementasi validasi IP Cloudflare
- `src/middleware.ts` — penggunaan `resolveClientIp()` di middleware
- `web-dashboard/cloudflared/SETUP.md` — panduan setup tunnel lengkap
- `web-dashboard/cloudflared/config.yml` — konfigurasi tunnel
- `requirements.md §7` — Cloudflare Tunnel Operational requirements
- `design.md §8` — Cloudflare Tunnel Setup design
- `design.md §9.4` — Alasan `BEHIND_PROXY=cloudflare`
