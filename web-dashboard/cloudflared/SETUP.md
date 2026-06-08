# Cloudflare Tunnel Setup — SafeGuard APD

Panduan ini menjelaskan cara setup Cloudflare Tunnel agar dashboard SafeGuard APD bisa diakses dari internet tanpa membuka port di router, sesuai **Requirement 7.1 & 7.2**.

---

## Prasyarat

- Akun Cloudflare (free tier cukup) dengan domain yang sudah terdaftar dan nameserver-nya sudah dipindah ke Cloudflare.
- Windows (panduan ini untuk Windows; Linux/macOS mirip tapi perintah service berbeda).
- PowerShell dengan akses **Administrator** untuk langkah instalasi service.

---

## Langkah 1 — Download & Install cloudflared

1. Buka [github.com/cloudflare/cloudflared/releases](https://github.com/cloudflare/cloudflared/releases).
2. Download file `cloudflared-windows-amd64.exe` dari release terbaru.
3. Pilih salah satu opsi penempatan:
   - **Opsi A (global PATH):** Rename ke `cloudflared.exe` dan letakkan di `C:\Windows\System32\` atau folder lain yang ada di `PATH`.
   - **Opsi B (lokal):** Rename ke `cloudflared.exe` dan letakkan di folder ini (`web-dashboard/cloudflared/`). Jalankan semua perintah di bawah dari folder ini.
4. Verifikasi instalasi:
   ```powershell
   cloudflared --version
   ```

---

## Langkah 2 — Login ke Akun Cloudflare

```powershell
cloudflared tunnel login
```

- Browser akan terbuka ke halaman Cloudflare.
- Pilih domain yang ingin dipakai untuk tunnel ini (mis. `example.com`).
- Setelah authorize, file credentials tersimpan otomatis di `C:\Users\<USER>\.cloudflared\cert.pem`.

---

## Langkah 3 — Buat Named Tunnel

```powershell
cloudflared tunnel create safeguard-apd
```

Output akan seperti ini:
```
Tunnel credentials written to C:\Users\<USER>\.cloudflared\<UUID>.json
Created tunnel safeguard-apd with id <UUID>
```

**Catat UUID tersebut** — UUID ini diperlukan di langkah selanjutnya.

---

## Langkah 4 — Update config.yml

Edit file `web-dashboard/cloudflared/config.yml`:

1. Ganti `<tunnel-uuid>` dengan UUID dari langkah 3.
2. Ganti `<USER>` dengan username Windows kamu (mis. `C:\Users\budi\.cloudflared\...`).
3. Ganti `safeguard.example.com` dan `ws.safeguard.example.com` dengan domain yang sebenarnya.

Contoh setelah diisi:
```yaml
tunnel: a1b2c3d4-e5f6-7890-abcd-ef1234567890
credentials-file: C:\Users\budi\.cloudflared\a1b2c3d4-e5f6-7890-abcd-ef1234567890.json
```

---

## Langkah 5 — Route DNS untuk Dua Hostname

```powershell
cloudflared tunnel route dns safeguard-apd safeguard.<domain>
cloudflared tunnel route dns safeguard-apd ws.safeguard.<domain>
```

Ganti `<domain>` dengan domain kamu (mis. `safeguard.kampus.id` dan `ws.safeguard.kampus.id`).

Perintah ini membuat CNAME record di Cloudflare DNS yang mengarahkan hostname ke tunnel.

---

## Langkah 6 — Install & Start sebagai Windows Service

Jalankan PowerShell sebagai **Administrator**:

```powershell
cloudflared service install

Start-Service cloudflared

# Verifikasi service berjalan
Get-Service cloudflared
```

Service ini akan otomatis start saat Windows boot.

---

## Langkah 7 — Update .env.local Dashboard

Edit `web-dashboard/.env.local` dan tambahkan/update baris berikut:

```ini
BEHIND_PROXY=cloudflare
NEXT_PUBLIC_YOLO_WS_URL=wss://ws.safeguard.<domain>
NEXTAUTH_URL=https://safeguard.<domain>
NODE_ENV=production
```

Restart Next.js setelah mengubah env:
```powershell
# Stop proses next.js yang berjalan, lalu:
cd web-dashboard
npm run build
npm start
```

---

## Langkah 8 — Verifikasi End-to-End

| Test | Cara | Expected |
|------|------|----------|
| Akses via Cloudflare | Buka `https://safeguard.<domain>/api/health` dari HP/laptop lain | `{"status":"ok"}` |
| Audit log IP | Login lalu cek tabel Audit Log di dashboard | `ipAddress` = IP device kamu, **bukan** IP Cloudflare edge |
| Cookie Secure | DevTools → Application → Cookies → `apd_session` | Flag `Secure` tercentang |
| WebSocket | Buka halaman `/monitor` | Frame video tampil, WebSocket connect ke `wss://ws.safeguard.<domain>` |
| Fallback lokal | Stop service: `Stop-Service cloudflared`, akses `http://127.0.0.1:3000` | Tetap bisa login |

---

## Verifikasi Tunnel Info

```powershell
cloudflared tunnel info safeguard-apd
```

Menampilkan status koneksi tunnel, connector ID, dan waktu aktif.

---

## Alternatif: Quick Tunnel (untuk Testing Cepat)

Untuk testing tanpa domain, gunakan quick tunnel:

```powershell
cloudflared tunnel --url http://127.0.0.1:3000
```

Output akan berupa URL acak seperti `https://random-name.trycloudflare.com`. URL ini **berubah setiap restart** dan **tidak cocok untuk demo formal**, tapi berguna untuk testing cepat.

---

## Troubleshooting

**Service tidak mau start:**
```powershell
# Cek log
cloudflared service log
# atau
Get-EventLog -LogName Application -Source cloudflared -Newest 20
```

**Error: "credentials file not found":**
- Pastikan path di `config.yml` menggunakan username Windows yang benar.
- Cek file ada di `C:\Users\<USER>\.cloudflared\<UUID>.json`.

**DNS belum propagasi:**
- Tunggu 1–5 menit setelah `route dns`.
- Cek di [dash.cloudflare.com](https://dash.cloudflare.com) → domain → DNS → pastikan CNAME sudah ada.

**WebSocket putus-putus:**
- Pastikan `keepAliveTimeout: 600s` ada di ingress rule untuk `ws.safeguard.<domain>` di `config.yml`.

---

## DNS Routing

Setelah tunnel dibuat (Langkah 3), daftarkan kedua hostname ke DNS Cloudflare menggunakan perintah berikut. Ganti `<domain>` dengan domain yang sudah terdaftar di akun Cloudflare kamu (mis. `kampus.id`).

```
cloudflared tunnel route dns safeguard-apd safeguard.<domain>
cloudflared tunnel route dns safeguard-apd ws.safeguard.<domain>
```

Perintah ini membuat dua CNAME record di Cloudflare DNS:
- `safeguard.<domain>` → mengarah ke tunnel `safeguard-apd` (Next.js dashboard)
- `ws.safeguard.<domain>` → mengarah ke tunnel `safeguard-apd` (Python YOLO WebSocket)

**Catatan:** Kedua perintah harus menggunakan nama tunnel `safeguard-apd` (bukan UUID). Jika route sudah ada, perintah akan gagal dengan pesan "already exists" — ini aman, tidak perlu diulang.

Verifikasi CNAME sudah terbuat:
```
cloudflared tunnel info safeguard-apd
```
Atau cek langsung di [dash.cloudflare.com](https://dash.cloudflare.com) → domain → DNS → cari CNAME dengan nama `safeguard` dan `ws.safeguard`.

---

## Referensi

- [Cloudflare Tunnel Docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [cloudflared releases](https://github.com/cloudflare/cloudflared/releases)
- Design doc: `design.md §8 — Cloudflare Tunnel Setup`
- Requirements: `requirements.md §7 — Cloudflare Tunnel Operational`
