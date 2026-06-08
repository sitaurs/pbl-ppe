# Security Demo — Talking Points

Panduan apa yang diucapkan dan file mana yang dibuka saat menjalankan
`scripts\demo_security.ps1` di hadapan dosen.

## Cara Menjalankan

```powershell
# Mode interaktif (default — pause antar section, tekan Enter)
powershell -File .\scripts\demo_security.ps1

# Mode auto (lari semua tanpa pause — buat dry-run)
powershell -File .\scripts\demo_security.ps1 -Auto

# Skip live MQTT trigger (buat demo tanpa ESP32 nyala)
powershell -File .\scripts\demo_security.ps1 -SkipMqtt
```

**Prereq sebelum demo:**
1. Next.js running di `:3000` (`npm run dev` di `web-dashboard/`)
2. (Opsional) Python backend running untuk integrasi penuh
3. (Opsional) ESP32 terhubung jika ingin demo alarm bunyi
4. (Opsional) cloudflared service running untuk klaim 4

Script akan tetap jalan walau prereq di atas tidak lengkap — section yang
gagal akan ditandai `[SKIP]` atau `[FAIL]`, sisanya tetap diuji.

---

## Section 0: Pre-flight Checks

**Yang ditampilkan:** status Next.js, env vars wajib (APD_SERVICE_TOKEN,
AES_KEY, MQTT_HOSTNAME).

**Yang diucapkan:**
> "Pak, sebelum demo saya cek dulu prerequisite. Dashboard harus running,
> dan environment variables kunci harus terisi."

**Pertanyaan kemungkinan:**
- *"Kenapa AES_KEY 32 chars?"* → "32 hex character = 16 byte = 128 bit. Sesuai standar AES-128 NIST FIPS 197."
- *"Service token panjangnya 64?"* → "64 hex = 256 bit entropy. Lebih dari cukup untuk Service Token, susah brute-force."

---

## Section 1: Argon2id + 2FA + RBAC

**Yang ditampilkan:** parsing PHC string `$argon2id$v=19$m=19456,t=2,p=1$...`
dari user di SQLite, plus daftar parameter dibandingkan ke OWASP 2023.

**Yang diucapkan:**
> "Pak, password user disimpan dalam bentuk hash Argon2id, bukan plaintext.
> Parameternya: 19 MiB memory, 2 iterasi. Ini sesuai rekomendasi OWASP 2023.
> Brute-force attack jadi mahal — butuh 19 MiB RAM dan 2 iterasi per attempt.
> Kalau database bocor, attacker tetap susah dapat password aslinya."

**Kalau ditanya 2FA:**
> "2FA pakai TOTP standar RFC 6238 — sama dengan Google Authenticator. Secret
> 160 bit di-generate saat enrollment, lalu di-encrypt AES-256-GCM sebelum
> disimpan ke DB. Jadi walau DB bocor, attacker tetap tidak punya secret 2FA-nya."

**Kalau ditanya RBAC:**
> "RBAC pakai pendekatan deny-by-default. Setiap endpoint harus didaftarkan
> di permission-map. Endpoint yang tidak terdaftar otomatis 403. Plus untuk
> role tingkat sektor (Supervisor, PIC), filter sektor di-inject otomatis ke
> query DB lewat sectorScoped flag."

**File yang dibuka kalau dosen minta:**
- `web-dashboard/src/lib/auth/argon2.ts` (line 17 — `ARGON2_PARAMS` constants)
- `web-dashboard/src/lib/auth/totp.ts`
- `web-dashboard/src/lib/auth/encrypt.ts` (AES-256-GCM untuk TOTP secret)
- `web-dashboard/src/lib/rbac/permission-map.ts`

---

## Section 2: MQTT AES-128-CBC + TLS

**Yang ditampilkan:**
1. Run `pytest tests/test_aes_roundtrip.py` — 14 property test pass
2. Encrypt payload sama 3x → 3 ciphertext berbeda total (bukti random IV)
3. (Opsional) Live trigger APD alarm → speaker ESP32 bunyi suara "gunakan APD lengkap"
4. (Opsional) Live trigger GAS alarm → LED merah nyala + speaker bunyi alarm gas

**Yang diucapkan saat random IV demo:**
> "Pak, ini demo random IV. Saya encrypt payload yang sama persis 3 kali,
> lihat outputnya — semua berbeda total. Karena setiap pesan pakai IV acak,
> attacker yang sniff jaringan tidak bisa pattern matching dari ciphertext.
> Bahkan kalau dia kirim pesan yang sama dua kali ke orang yang sama, hasilnya
> berbeda."

**Yang diucapkan saat live trigger APD:**
> "Lihat output ESP32-nya, Pak. Pesan masuk 216 bytes base64, di-decrypt jadi
> 129 bytes plaintext, validasi timestamp lulus, lalu speaker bunyi 'gunakan
> APD lengkap'. Itu trigger pelanggaran APD — helm/rompi tidak dipakai."

**Yang diucapkan saat live trigger GAS:**
> "Sekarang gas alarm. Saya kirim event 'gas_test' via MQTT yang sama —
> ESP32 simulasi sensor MQ-135 melebihi threshold. LED merah nyala, speaker
> bunyi peringatan gas. Aslinya ini auto-trigger dari sensor fisik, tapi
> untuk demo bisa di-trigger manual via MQTT."

**Kalau ditanya TLS:**
> "MQTT-nya pakai port 8883 dengan TLS. ESP32 verify cert server lewat
> setCACert. Root CA-nya Let's Encrypt R13. Kalau ada MITM yang pasang cert
> palsu, handshake langsung gagal — saya bisa tunjukkan log error -15202
> kalau cert-nya saya rusak."

**Kalau ditanya kenapa AES-128 bukan AES-256:**
> "AES-128 sudah secure, NSA suite-B compliant. AES-256 cuma marginally lebih
> kuat tapi dua kali lebih lambat di ESP32. Untuk IoT dengan resource terbatas,
> AES-128 adalah pilihan yang reasonable."

**File yang dibuka:**
- `ServiceAPDBackend.py` (line 313 — `encrypt_aes128`)
- `alarm_apd/alarm_apd.ino` (line 534 — `aesDecrypt`, line 328 — `setCACert`)

---

## Section 3: Service Token

**Yang ditampilkan:** 4 skenario curl
1. Tanpa token → 401
2. Token salah → 401
3. Token benar tapi endpoint salah → 403
4. Token benar + endpoint whitelist → 200

**Yang diucapkan:**
> "Pak, walau Python backend punya Service Token, dia tidak bisa akses
> sembarang endpoint. Token cuma valid untuk endpoint yang di-whitelist:
> ambil daftar node, lapor pelanggaran, lapor heartbeat, lapor telemetri gas,
> baca settings. Kalau Python coba akses endpoint admin seperti delete user
> atau ganti password, langsung ditolak 403."

**Kalau ditanya kenapa tidak pakai JWT:**
> "JWT cocok untuk multi-service authentication dengan claims complex. Untuk
> kasus kami yang cuma 1 backend service ke 1 dashboard, Service Token sederhana
> sudah cukup. Lebih ringan, tidak perlu signing/parsing JWT setiap request."

**Kalau ditanya 'kalau token bocor gimana':**
> "Kalau token bocor, attacker tetap dibatasi 5 endpoint whitelist. Dia tidak
> bisa eskalasi privilege ke admin. Plus, log audit semua request Service
> Token, jadi anomali bisa terdeteksi. Untuk mitigasi rotasi: token bisa
> di-regenerate dari TUI Setup tab step F."

**File yang dibuka:**
- `web-dashboard/src/middleware.ts` (line 161-184 — Service Token flow)
- `web-dashboard/src/lib/rbac/permission-map.ts` (cari `serviceTokenAllowed`)
- `ServiceAPDBackend.py` (line 69 — `DASHBOARD_HEADERS`)

---

## Section 4: Cloudflare Tunnel

**Yang ditampilkan:**
- Status service cloudflared running
- HTTP GET ke `apd.ecosystech.me/api/health` → status 200 + header CF-RAY
- Daftar header Cloudflare yang menunjukkan request lewat CF edge

**Yang diucapkan:**
> "Pak, dashboard ini bisa diakses dari internet tanpa buka port di router.
> Cara kerjanya: laptop ini outbound connection ke Cloudflare edge, lalu
> Cloudflare yang publish dashboard ke domain apd.ecosystech.me. Karena
> outbound, hacker tidak bisa scan port — wong nggak ada port yang dibuka
> ke internet."

**Live demo terbaik:**
> "Coba dosen buka HP, ketik apd.ecosystech.me, login pakai akun demo. Saya
> tunjukkan login berhasil, dan di audit log akan tercatat IP HP dosen,
> bukan IP Cloudflare."

**Kalau ditanya 'kenapa bukan ngrok':**
> "Cloudflare Tunnel gratis, permanent (domain tetap), dan sudah dilengkapi
> anti-DDoS bawaan. Ngrok butuh paid plan untuk custom domain dan tidak ada
> DDoS protection."

**Kalau ditanya security CF Tunnel:**
> "Cloudflare punya WAF, anti-DDoS, anti-bot, geo-blocking, semua bisa
> diaktifkan dari dashboard mereka. Plus traffic ke laptop kami di-encrypt
> end-to-end karena pakai HTTPS dari user → Cloudflare → tunnel → laptop."

**File yang dibuka:**
- `web-dashboard/cloudflared/config.yml`
- `web-dashboard/.env.local` (cari `BEHIND_PROXY`)
- `web-dashboard/src/middleware.ts` (cari `clientIp`)

---

## Pertanyaan Jebakan dan Jawabannya

### "Kenapa MQTT pakai AES sendiri padahal sudah TLS?"

> "Defense-in-depth, Pak. TLS protect transport antara ESP32 dan broker.
> Tapi pesan tersimpan di broker (HiveMQ Cloud) dalam bentuk plaintext.
> Kalau broker di-compromise atau provider-nya leak data, pesan kami tetap
> aman karena terenkripsi end-to-end. Dua layer."

### "Kalau attacker tahu AES key gimana?"

> "Itu jelas kompromis. Kunci kami simpan di .env dengan permission terbatas,
> tidak commit ke git, tidak hardcode di kode source. Untuk ESP32, kunci
> di-flash sekali saat provisioning, tidak terbaca dari serial. Mitigasi
> rotasi: kalau diduga kompromis, tinggal generate kunci baru, update .env
> dan flash ulang ESP32 — proses ~10 menit."

### "Kenapa nggak pakai mTLS untuk MQTT?"

> "mTLS valid Pak, tapi setup-nya kompleks: harus generate cert per device,
> manage CRL, distribusi cert ke ESP32. Untuk PBL kami, kombinasi
> username/password MQTT + AES-128 di payload sudah memenuhi requirement
> CIA triad: Confidentiality (AES), Integrity (PKCS7 padding validation +
> timestamp replay protection), Authentication (broker credentials)."

### "Property test itu apa, ada bukti jalan?"

> "Property test = unit test berbasis property invariant, pakai library
> fast-check. Bedanya dari unit test biasa: dia generate ratusan kombinasi
> input random untuk verify property selalu terpenuhi. Misal: setiap
> password yang di-hash, kalau di-verify dengan plaintext yang sama, harus
> return true. Saya bisa run sekarang `npm test` di web-dashboard kalau
> Bapak mau lihat."

### "Audit log bisa di-edit nggak?"

> "Tidak Pak, audit log append-only by design. Kami punya property test
> yang scan SEMUA file API route — kalau ada developer push code yang
> nyentuh `prisma.auditLog.update` atau `delete`, test ini auto-fail di CI.
> Jadi lebih dari sekadar konvensi, ini di-enforce."

---

## Kalau Demo Gagal di Tengah Jalan

**ESP32 tidak respon:** Tunjukkan output `pytest test_aes_roundtrip.py`
dan `aes_demo_compare.py` saja. Bilang: "Pak, ini bukti AES-nya tetap jalan
di sisi software. ESP32 hardware tinggal flash, tidak ada perubahan logika."

**Next.js mati:** Restart via TUI atau `npm run dev`. Saat menunggu, bahas
arsitektur sambil buka file source.

**Cloudflare tunnel down:** Skip section 4, atau buka CF Dashboard secara
manual untuk tunjukkan tunnel status. Bilang: "Pak, ini live di production,
dan setup tunnel-nya ada di TUI step H — tinggal paste token dari CF Dashboard."

**Property test gagal:** Sangat tidak mungkin, tapi kalau iya: tunjukkan
file source-nya saja sebagai bukti implementasi. "Test-nya regress, tapi
implementasi konsep tetap valid — file source-nya bisa Bapak review."

---

## Backup Plan

Jangan lupa rekam **screen recording** demo yang berhasil sebagai backup,
kalau hari-H ada hardware error atau koneksi mati. Save sebagai:
`docs/security-demo-backup-<tanggal>.mp4`.
