# PBL — Workshop Keamanan Jaringan (Cyber)

Bagian project SafeGuard APD yang relevan untuk mata kuliah Workshop Keamanan Jaringan.

> **Singkatnya:** kami menerapkan keamanan berlapis di 4 titik kritis sistem: login, komunikasi alarm, integrasi backend, dan akses internet.

---

## 4 Klaim Keamanan

Berikut yang kami janjikan ke pengguna sistem (dan dosen):

1. **Login dashboard aman** — password di-hash dengan Argon2id, ada 2FA, dan akses dibatasi RBAC.
2. **Alarm ke ESP32 terenkripsi** — pesan MQTT pakai AES-128-CBC + verifikasi TLS server.
3. **Komunikasi backend aman** — Python ke dashboard pakai Service Token + endpoint whitelist.
4. **Akses internet aman** — pakai Cloudflare Tunnel, tidak buka port di router (anti port-scan).

---

## Klaim 1: Argon2id + 2FA + RBAC

### Argon2id (Password Hashing)

Password user **tidak pernah** disimpan dalam bentuk asli. Disimpan sebagai hash Argon2id dengan parameter sesuai standar OWASP 2023:

| Parameter | Nilai | Arti |
|---|---|---|
| Memory cost | 19 MiB | Setiap attempt brute-force butuh 19 MiB RAM |
| Time cost | 2 iterations | Hash dihitung 2 kali (lambat sengaja) |
| Parallelism | 1 | Sulit di-paralel di GPU |

Format hash di database:
```
$argon2id$v=19$m=19456,t=2,p=1$<random_salt>$<hash>
```

**Analoginya:** menebak password 8 karakter standar pakai brute-force tanpa Argon2 = ~beberapa menit dengan GPU. Pakai Argon2id parameter di atas = **berhari-hari** (karena GPU tidak punya 19 MiB RAM per worker).

**Bonus: auto-rehash invariant.** Kalau di masa depan kami naikin parameter Argon2 (misal m=64 MiB), saat user login berikutnya, hash lama otomatis di-upgrade ke parameter baru. Tidak perlu force-reset semua user.

**File:** [`web-dashboard/src/lib/auth/argon2.ts`](../web-dashboard/src/lib/auth/argon2.ts)

### 2FA TOTP (Two-Factor Authentication)

User bisa enable 2FA dengan scan QR code via Google Authenticator atau Authy.

- Standard: RFC 6238 (TOTP)
- Algorithm: SHA-1, 6 digit, 30 detik window
- Secret 160-bit, di-encrypt **AES-256-GCM** sebelum disimpan ke database
- Recovery codes: 8 codes one-time, di-hash SHA-256 di DB (tidak plaintext)

Kalau database bocor, attacker tetap **tidak bisa pakai 2FA secret** karena masih terenkripsi dengan kunci terpisah (`APD_ENCRYPTION_KEY` di `.env.local`).

**File:** [`web-dashboard/src/lib/auth/totp.ts`](../web-dashboard/src/lib/auth/totp.ts), [`web-dashboard/src/lib/auth/encrypt.ts`](../web-dashboard/src/lib/auth/encrypt.ts)

### RBAC (Role-Based Access Control)

5 role default dengan total 34 permission granular berformat `resource:action`:

| Role | Akses |
|---|---|
| Super_Admin | Semua |
| Admin_K3 | Semua kecuali user/role/setting |
| Supervisor | Live monitor + acknowledge (sektor sendiri) |
| PIC_Sektor | Hanya baca (sektor sendiri) |
| Auditor | Read-only + audit log + ekspor |

**Deny-by-default:** setiap endpoint API harus didaftarkan di `permission-map.ts`. Kalau lupa daftar → otomatis ditolak `403 endpoint_not_registered`. Property test `permission-map.property.test` scan semua route untuk memastikan tidak ada yang lolos.

**Sector-scoped:** untuk Supervisor dan PIC_Sektor, query database otomatis ditambahi filter `WHERE sektorId IN (user.sectorIds)`. User tidak bisa lihat data sektor orang lain walau ubah URL.

**File:** [`web-dashboard/src/lib/rbac/permission-map.ts`](../web-dashboard/src/lib/rbac/permission-map.ts), [`web-dashboard/src/middleware.ts`](../web-dashboard/src/middleware.ts)

### Pelengkap: Rate Limiter + Account Lockout

Brute-force protection di endpoint login:

- Per (IP, username): max 5 failure dalam 15 menit → reject 429
- Per username total: max 10 failure dalam 15 menit → akun di-lockout 30 menit

Setelah lockout selesai, user bisa coba lagi (auto-unlock saat password benar).

**File:** [`web-dashboard/src/lib/rate-limit/rate-limiter.ts`](../web-dashboard/src/lib/rate-limit/rate-limiter.ts), [`web-dashboard/src/lib/rate-limit/lockout.ts`](../web-dashboard/src/lib/rate-limit/lockout.ts)

### Pelengkap: CSRF Protection

Setiap request POST/PUT/PATCH/DELETE wajib bawa header `X-CSRF-Token` yang cocok dengan session. Tanpa token → 403. Cookie session di-set:

- `HttpOnly` — selalu (mencegah akses dari JavaScript browser)
- `SameSite=Lax` — selalu
- `Secure` — **conditional**: aktif kalau `NODE_ENV=production` ATAU `BEHIND_PROXY=cloudflare`. Di dev local (HTTP localhost), `Secure=false` agar cookie tetap di-set browser.

Ini reasonable — production wajib HTTPS, dev local pakai HTTP.

**File:** [`web-dashboard/src/lib/auth/cookie-attrs.ts`](../web-dashboard/src/lib/auth/cookie-attrs.ts), middleware line 254-259

### Pelengkap: Audit Log Append-Only

Setiap aksi sensitif (login, ganti password, buat user, dll) tercatat di tabel `AuditLog`. Yang menarik: **tidak ada satu pun handler API yang melakukan UPDATE/DELETE pada tabel ini**.

Kami punya property test [`audit-append-only.property.test.ts`](../web-dashboard/src/lib/audit/__tests__/audit-append-only.property.test.ts) yang scan **SEMUA** file route API dan mendeteksi kalau ada `prisma.auditLog.update`, `delete`, atau raw SQL `UPDATE/DELETE` ke tabel `AuditLog`. Test fail kalau ada — di-enforce di CI.

Audit log juga mencatat IP user asli (bukan IP Cloudflare proxy) lewat header `CF-Connecting-IP`.

---

## Klaim 2: AES-128-CBC + MQTT TLS

### Kenapa Dua Lapis Sekaligus?

Ini **defense-in-depth**. TLS melindungi data dalam perjalanan, AES melindungi data **walau perjalanan-nya bocor**.

Skenario:
- TLS bocor (misal cert MITM, broker di-compromise) → attacker dapat ciphertext acak (karena AES). Tetap tidak bisa baca isi pesan.
- AES key bocor → attacker bisa decrypt, tapi pesan dalam perjalanan tetap terenkripsi TLS (sniffer Wi-Fi tidak bisa intercept ciphertext mentah).

### AES-128-CBC dengan Random IV

Setiap pesan MQTT yang dikirim Python ke ESP32:

```python
plaintext = json.dumps({"event": "apd_violation", "nodeId": 1, ...})
iv = os.urandom(16)                          # ← Initialization Vector ACAK setiap pesan
cipher = AES.new(AES_KEY, AES.MODE_CBC, iv)
ciphertext = cipher.encrypt(pad(plaintext, 16))  # PKCS7 padding
encrypted = base64.b64encode(iv + ciphertext)    # IV ditempel di depan
```

**Kenapa random IV?** Kalau IV-nya tetap (statik), payload yang sama akan menghasilkan ciphertext yang sama. Attacker yang sniff jaringan bisa pattern matching: "oh, pesan ini sama dengan yang tadi". Dengan IV acak, payload yang sama tetap menghasilkan ciphertext berbeda total setiap kali.

**Demo bukti:** jalankan `python scripts/aes_demo_compare.py` — encrypt payload yang sama 3x, output base64 berbeda total semua.

### Sisi ESP32 — Decrypt + Validation

Firmware ESP32 (`alarm_apd/alarm_apd.ino`) menerima base64, decrypt pakai mbedtls (built-in ESP32):

```cpp
// 1. Decode base64
mbedtls_base64_decode(buf, ...);

// 2. Pisah IV (16 byte pertama) dengan ciphertext
memcpy(iv, buf, 16);

// 3. Decrypt CBC
mbedtls_aes_setkey_dec(&ctx, AES_KEY, 128);
mbedtls_aes_crypt_cbc(&ctx, MBEDTLS_AES_DECRYPT, len, iv, ciphertext, plaintext);

// 4. Strip PKCS7 padding
// 5. Parse JSON
// 6. Validasi: nodeId == MY_NODE_ID, timestamp dalam ±5 menit
```

Validasi penting:
- **NodeID check** — pesan untuk node lain langsung ditolak (defense-in-depth)
- **Timestamp replay protection** — selisih waktu pesan vs NTP > 5 menit → tolak (mencegah replay attack)

Random IV di ESP32 pakai `esp_fill_random()` (hardware RNG bawaan ESP32, lebih kuat dari software PRNG).

### MQTT TLS (Port 8883)

Komunikasi MQTT pakai TLS 1.2+:
- ESP32 verify cert server pakai `setCACert(HIVEMQ_ROOT_CA)`
- Root CA: Let's Encrypt R13 (intermediate) — RSA 2048-bit (yang didukung mbedtls ESP32)
- Kalau ada MITM yang pasang cert palsu, handshake langsung gagal

**Catatan teknis:** awalnya kami pakai ISRG Root X1 (RSA 4096-bit), tapi mbedtls di ESP32 belum support parsing public key 4096-bit dengan baik (error `-15202`). Switch ke intermediate R13 menyelesaikan masalah, tetap rooted ke ISRG Root X1.

### Property Tests

14 property test memvalidasi pipeline AES:
- Encrypt-decrypt roundtrip
- Random IV uniqueness (1000+ run, semua berbeda)
- Tampered ciphertext rejection
- Tampered IV rejection
- Wrong key rejection

**Run:** `python -m pytest tests/test_aes_roundtrip.py -v`

**File:**
- Encrypt Python: [`ServiceAPDBackend.py`](../ServiceAPDBackend.py) `encrypt_aes128()`
- Decrypt ESP32: [`alarm_apd/alarm_apd.ino`](../alarm_apd/alarm_apd.ino) `aesDecrypt()` (line 550)
- TLS verify: [`alarm_apd/alarm_apd.ino`](../alarm_apd/alarm_apd.ino) `setCACert(HIVEMQ_ROOT_CA)` (line 338)

---

## Klaim 3: Service Token + Endpoint Whitelist

### Masalah yang Dipecahkan

Backend Python perlu komunikasi ke dashboard Next.js untuk:
- Ambil daftar node aktif
- Lapor pelanggaran terdeteksi
- Lapor heartbeat
- Lapor telemetri gas

Middleware Next.js menolak request anonymous. Backend Python perlu autentikasi. Tapi:
- Tidak boleh pakai password user (Python bukan manusia)
- Token harus susah ditebak
- Token jangan punya akses penuh (kalau bocor, tidak game over)

### Implementasi: Bearer Token + Whitelist

**Header request:**
```http
GET /api/nodes
Authorization: Bearer <APD_SERVICE_TOKEN>
```

**Validasi di middleware:**
```typescript
// 1. Cek token persis sama dengan APD_SERVICE_TOKEN di env
if (token !== expected) return 401;

// 2. Cek endpoint di-whitelist untuk service token
const entry = lookupPermission(method, pathname);
if (!entry?.serviceTokenAllowed) return 403;
```

**Endpoint yang di-whitelist** (cuma 5):
- `GET /api/nodes`
- `POST /api/nodes/:id/heartbeat`
- `POST /api/violations`
- `POST /api/telemetry/gas`
- `GET /api/settings`

Endpoint lain (delete user, ganti password, dll) **tetap ditolak 403** walau token valid.

### Demo (4 Skenario Curl)

```powershell
# 1. Anonymous → 401
curl http://localhost:3000/api/nodes

# 2. Token salah → 401
curl -H "Authorization: Bearer wrong_token" http://localhost:3000/api/nodes

# 3. Token benar tapi endpoint salah → 403
curl -H "Authorization: Bearer <REAL_TOKEN>" -X DELETE http://localhost:3000/api/nodes/1

# 4. Token benar + endpoint whitelist → 200
curl -H "Authorization: Bearer <REAL_TOKEN>" http://localhost:3000/api/nodes
```

Script otomatis: `powershell -File scripts/test_service_token.ps1`.

**File:**
- Validator: [`web-dashboard/src/middleware.ts`](../web-dashboard/src/middleware.ts) line 159-185
- Whitelist registry: [`web-dashboard/src/lib/rbac/permission-map.ts`](../web-dashboard/src/lib/rbac/permission-map.ts)
- Python sender: [`ServiceAPDBackend.py`](../ServiceAPDBackend.py) `DASHBOARD_HEADERS`

---

## Klaim 4: Cloudflare Tunnel

### Masalah yang Dipecahkan

Untuk dosen bisa akses dashboard dari rumah, biasanya pilihan-nya:
1. **Port forward di router** — buka port 80/443 di MikroTik ke laptop. Hacker bisa scan port. Butuh static IP atau DDNS.
2. **VPN** — dosen harus install VPN client. Repot.
3. **Cloud hosting** — bayar VPS, deploy ulang, pindah database. Mahal dan ribet.

Ketiga opsi di atas tidak ideal untuk PBL.

### Solusi: Cloudflare Tunnel

```
[Browser dosen]
       │ HTTPS ke apd.ecosystech.me
       ▼
[Cloudflare Edge Network]   (CDN, anti-DDoS, WAF)
       │ Tunnel terenkripsi (outbound dari laptop)
       ▼
[Laptop demo running:3000]
```

**Cara kerja:**
1. `cloudflared` di laptop bikin koneksi **outbound** ke Cloudflare (tidak ada port yang dibuka inbound)
2. User akses `apd.ecosystech.me`. DNS resolve ke Cloudflare
3. Cloudflare forward request ke laptop melalui tunnel terenkripsi
4. Laptop respon, lewat jalur yang sama

### Manfaat Keamanan

| Aspek | Tanpa Tunnel | Dengan Tunnel |
|---|---|---|
| Port di router | 80, 443 dibuka | Tidak ada yang dibuka |
| Port scan | Bisa di-scan, ada signature | Tidak ada apa-apa untuk di-scan |
| HTTPS cert | Harus beli/Let's Encrypt manual | Otomatis dari Cloudflare |
| DDoS protection | Tidak ada | Bawaan Cloudflare |
| WAF | Tidak ada | Bawaan Cloudflare |
| IP user asli | Tidak terlihat (NAT) | Diteruskan via header `CF-Connecting-IP` |

### IP User Asli di Audit Log

Karena traffic lewat Cloudflare, IP yang terlihat di server biasanya IP Cloudflare edge (172.67.x.x). Untuk audit log, kami pakai:

```typescript
// .env.local
BEHIND_PROXY=cloudflare
```

Middleware baca header `CF-Connecting-IP` (yang Cloudflare tulis dengan IP user asli) dan hanya mempercayainya kalau request datang dari IP range Cloudflare (whitelist).

Hasil: audit log mencatat **IP HP/laptop dosen yang asli**, bukan IP Cloudflare.

**File:**
- Tunnel config: [`web-dashboard/cloudflared/config.yml`](../web-dashboard/cloudflared/config.yml)
- Setup script: [`web-dashboard/cloudflared/setup-tunnel.ps1`](../web-dashboard/cloudflared/setup-tunnel.ps1)
- IP resolver: [`web-dashboard/src/lib/proxy/cloudflare-ips.ts`](../web-dashboard/src/lib/proxy/cloudflare-ips.ts) (`resolveClientIp()` + whitelist Cloudflare IPv4/IPv6 ranges)
- Middleware integration: [`web-dashboard/src/middleware.ts`](../web-dashboard/src/middleware.ts) line 142-148

---

## Pertanyaan Yang Mungkin Ditanya Dosen

### "Kenapa MQTT pakai AES sendiri padahal sudah TLS?"

Defense-in-depth. TLS protect transport antara ESP32 dan broker. Tapi pesan tersimpan di broker (HiveMQ Cloud) dalam bentuk plaintext. Kalau broker di-compromise atau provider-nya leak data, pesan kami tetap aman karena terenkripsi end-to-end. Dua lapis berbeda level — kalau salah satu jebol, yang lain masih melindungi.

### "Apa itu IV dan kenapa harus random?"

IV (Initialization Vector) adalah angka acak yang di-XOR dengan blok plaintext pertama sebelum enkripsi CBC. Kalau IV statik, payload sama menghasilkan ciphertext sama. Random IV bikin ciphertext setiap pesan berbeda total. Demo: `python scripts/aes_demo_compare.py`.

### "Bagaimana kalau AES key bocor?"

Masih ada layer lain:
1. TLS encrypts in-transit (sniffer Wi-Fi tidak bisa intercept ciphertext)
2. Username/password MQTT broker (attacker tidak bisa publish/subscribe arbitrary)
3. Audit log mencatat semua aktivitas

Mitigasi: rotate AES key (regenerate, update `.env`, flash ulang ESP32). ~10 menit kerja.

### "Argon2id 19 MiB memory itu masuk akal di server lokal?"

Iya. Login user 1x ambil ~50ms di laptop modern. Server kami cuma handle ~10 login bersamaan (PBL = bukan high-traffic). Total RAM untuk login = 10 × 19 MiB = 190 MB sesaat. Tidak signifikan.

### "Service Token bisa di-revoke kalau bocor?"

Ya. Generate token baru via TUI (Setup tab → step C generate fresh `.env.local` → step F sync ke `.env`). Restart Python backend. Token lama langsung tidak valid lagi.

### "CSRF, kenapa kebal padahal token di cookie?"

CSRF token disimpan di **server-side session** (database), tidak di cookie. Browser request mutation kirim token via header `X-CSRF-Token` yang di-set oleh JavaScript dari endpoint `/api/auth/csrf`. Attacker yang punya cookie session-nya saja tidak bisa palsu CSRF token (mereka tidak bisa baca dari endpoint karena CORS).

### "Audit log bisa di-edit attacker?"

Tidak. Property test scan SEMUA route, kalau ada `update`/`delete`/raw `UPDATE`/`DELETE` ke tabel AuditLog, test fail. Tidak ada cara legit untuk edit audit log via API. Untuk lebih ketat lagi, bisa pakai append-only filesystem atau hash chain (future improvement).

### "Cloudflare Tunnel — apa kalau Cloudflare di-hack?"

Trade-off yang kami terima. Cloudflare adalah penyedia security paling besar di dunia, akun mereka di-encrypt + 2FA wajib. Risiko mereka di-hack < risiko kami salah konfigurasi router atau cert SSL kami expired. Untuk PBL, ini pilihan paling rasional.

### "Bisa demo serangan langsung?"

Bisa. 4 skenario yang kami siapkan di `scripts/demo_security.ps1`:
1. Encrypt 3x payload sama → ciphertext beda (random IV)
2. curl tanpa token → 401
3. curl token salah → 401  
4. curl token benar tapi endpoint salah → 403

Dosen bisa minta demo live, kami jalan lewat 1 command.

### "Property test, beda dari unit test biasa?"

Unit test: tester nulis 1-2 contoh input + expected output.
Property test: tester nulis **invariant** (sifat yang harus selalu benar), library auto-generate ratusan input acak untuk verify. Misal: "untuk semua password X, hash(X) lalu verify(hash, X) = true". Library `fast-check` generate 100 password acak setiap test run.

Lebih kuat menemukan edge case yang dilewat manusia.

### "Apakah sistem ini production-ready?"

Untuk PBL: ya, semua klaim implementasi nyata, ada test, ada property invariant. Untuk production beneran: butuh tambahan:
- Pen-test profesional
- Logging eksternal (Sentry, ELK)
- Backup database otomatis ke offsite
- HSM atau KMS untuk encryption key (bukan env var)
- Compliance audit (ISO 27001, SOC 2 kalau perlu)

PBL sudah memenuhi konsep, production butuh polish operasional.
