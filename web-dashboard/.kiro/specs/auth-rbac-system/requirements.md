# Requirements Document

## Introduction

Penambahan sistem **Database Persisten**, **Autentikasi**, **Role-Based Access Control (RBAC)**, dan **Security Hardening** pada SafeGuard APD Web Dashboard. Saat ini dashboard menggunakan tiga file JSON (`data/db.json`, `data/violations.json`, `data/settings.json`) sebagai sumber data dan tidak memiliki kontrol akses sama sekali; siapa pun yang dapat membuka URL dashboard memiliki akses penuh ke semua fitur (CRUD node, hapus pelanggaran, ubah konfigurasi notifikasi).

Fitur ini akan: (1) memindahkan persistensi ke SQLite via Prisma ORM dengan migrasi data JSON yang ada, (2) menambahkan halaman login + manajemen sesi + sistem peran/izin granular yang disesuaikan dengan konteks K3 industri (Super Admin, Admin K3/HSE, Supervisor, PIC Sektor, Auditor), dan (3) menerapkan kontrol keamanan standar industri (hashing Argon2id, rate limit login, CSRF, audit log, 2FA opsional, kebijakan password). Backend Python (`ServiceAPDBackend.py`) tetap dapat membaca data lewat HTTP API yang ada melalui mekanisme service token sehingga single source of truth tetap di lapisan Next.js. Deployment ditargetkan pada satu laptop ber-NVIDIA yang menjalankan seluruh stack (Next.js + SQLite + YOLO Python + ESP32 bridge), dengan akses jarak jauh disediakan melalui Cloudflare Tunnel sehingga sistem dapat didemonstrasikan baik di lab maupun online dari rumah dosen penguji menggunakan basis kode yang sama.

Backwards compatibility adalah persyaratan eksplisit: seluruh node, pelanggaran, dan setting yang sudah tersimpan saat ini WAJIB tetap dapat diakses tanpa kehilangan data setelah migrasi.

## Glossary

- **Database_Layer**: Lapisan persistensi berbasis SQLite yang diakses melalui Prisma ORM; menggantikan ketiga file JSON sebagai sumber data utama
- **Prisma_Schema**: Berkas `prisma/schema.prisma` yang mendefinisikan seluruh model data (User, Role, Permission, Session, Node, Violation, Setting, AuditLog, dll.) beserta relasi antar tabel
- **Migration_Script**: Skrip satu kali yang membaca data dari `data/db.json`, `data/violations.json`, dan `data/settings.json` lalu memasukkannya ke Database_Layer
- **JSON_Backup**: Salinan file JSON asli yang disimpan di `data/backup/{timestamp}/` sebelum migrasi dijalankan
- **User**: Akun pengguna dashboard, memiliki field minimal: id (UUID), username (unique, 3–32 karakter), email (unique, format RFC 5322), fullName (1–100 karakter), passwordHash (Argon2id), roleId, status (active/disabled/locked), createdAt, lastLoginAt, mustChangePassword (boolean), passwordChangedAt
- **Role**: Definisi peran yang menjabarkan kumpulan Permission; lima role default disediakan (Super_Admin, Admin_K3, Supervisor, PIC_Sektor, Auditor) dengan opsi membuat role kustom
- **Super_Admin**: Role tertinggi untuk pemilik sistem/IT, memiliki seluruh izin termasuk manajemen User dan Role
- **Admin_K3**: Role untuk Manajer K3, Kepala Lab, atau Kepala Bengkel; mengelola Node, Sektor, Setting notifikasi, dan laporan
- **Supervisor**: Role untuk Foreman, Asisten Lab, atau Mekanik Senior; melakukan live monitor, acknowledge pelanggaran, dan baca laporan pada Sektor yang ditugaskan saja
- **PIC_Sektor**: Role untuk PIC Area atau Shift Lead; akses read-only data Sektor yang ditugaskan dan menerima notifikasi WhatsApp
- **Auditor**: Role untuk inspektur K3 eksternal atau QA/QC; akses read-only seluruh data dan ekspor laporan, tanpa hak mutasi
- **Permission**: Otorisasi granular dengan format `resource:action` (contoh: `node:create`, `violation:acknowledge`, `setting:update:notification`); satu Role memiliki banyak Permission via tabel relasi RolePermission
- **Permission_Matrix**: Pemetaan default Permission per Role yang dibuat saat seed Database_Layer pertama kali
- **Session**: Token sesi pengguna yang aktif; disimpan di Database_Layer dengan field id, userId, expiresAt, createdAt, ipAddress, userAgent
- **Session_Cookie**: Cookie HTTP bernama `apd_session` dengan atribut httpOnly, Secure (di lingkungan HTTPS), SameSite=Lax, Path=/, berisi referensi ke Session
- **CSRF_Token**: Token anti-CSRF berukuran 32 byte (256 bit) acak, di-issue per Session, divalidasi pada setiap request mutasi (POST/PUT/PATCH/DELETE) di luar endpoint login
- **Argon2id_Hasher**: Implementasi hashing password Argon2id dengan parameter memoryCost ≥ 19 MiB, timeCost ≥ 2, parallelism ≥ 1 sesuai rekomendasi OWASP 2023
- **Password_Policy**: Aturan validasi password baru: panjang minimum 10 karakter, mengandung minimal satu huruf besar, satu huruf kecil, satu digit, dan satu simbol non-alfanumerik, serta tidak ada dalam HIBP_List
- **HIBP_List**: Daftar offline berisi 10.000 password paling sering bocor (dari Have I Been Pwned top-10k), disertakan sebagai aset statis dalam repository
- **Rate_Limiter**: Komponen yang membatasi 5 percobaan login gagal per 15 menit per kombinasi (IP + username) dan memicu Account_Lockout setelah ambang batas terlampaui
- **Account_Lockout**: Status User yang dikunci sementara selama 30 menit setelah Rate_Limiter terpicu; selama lockout login ditolak meskipun password benar
- **TOTP_Authenticator**: Implementasi Time-Based One-Time Password sesuai RFC 6238 (periode 30 detik, digit 6, algoritma SHA-1) untuk 2FA opsional
- **Audit_Log**: Catatan immutable seluruh aksi penting (login berhasil/gagal, perubahan node, hapus pelanggaran, perubahan role, perubahan setting, ekspor data) berisi field: id, userId, action, resourceType, resourceId, timestamp, ipAddress, userAgent, metadata (JSON)
- **API_Middleware**: Middleware Next.js yang dijalankan pada setiap request ke route `/api/*` dan halaman terproteksi; bertanggung jawab memvalidasi Session, CSRF_Token, dan Permission yang diperlukan
- **Service_Token**: Token statis yang disimpan di environment variable `APD_SERVICE_TOKEN`; digunakan oleh `ServiceAPDBackend.py` untuk mengakses HTTP API tanpa Session pengguna, dibatasi pada endpoint read tertentu (`/api/nodes`, `/api/violations` POST untuk insert pelanggaran baru, `/api/settings` GET)
- **Sector_Assignment**: Relasi many-to-many antara User dan Sektor yang menentukan Sektor mana yang dapat diakses oleh User berperan Supervisor atau PIC_Sektor
- **Login_Page**: Halaman `/login` yang menampilkan form username + password + (opsional) kode TOTP, serta menjadi target redirect untuk request tidak terautentikasi
- **Dashboard_System**: Aplikasi web Next.js yang menjadi host fitur ini (sudah ada sebelumnya)
- **Cloudflare_Tunnel**: Layanan tunneling Cloudflare yang dijalankan via daemon `cloudflared` di laptop deployment; mengekspos service lokal ke internet melalui edge Cloudflare dengan TLS otomatis tanpa membuka port pada router. Mode operasi yang dipakai adalah named tunnel, BUKAN WARP client dan BUKAN Cloudflare Access (auth tetap dilakukan oleh Auth_System aplikasi).
- **Trusted_Proxy_IPs**: Daftar IP range Cloudflare resmi (https://www.cloudflare.com/ips/) yang dipakai API_Middleware untuk memvalidasi bahwa header `CF-Connecting-IP` benar berasal dari Cloudflare edge; daftar disimpan di `src/lib/cloudflare-ips.ts` dan diperbarui manual saat deploy
- **CF_Connecting_IP**: Header HTTP yang ditambahkan Cloudflare edge berisi IP klien asli; dipakai Rate_Limiter dan Audit_Log sebagai source IP saat aplikasi berjalan di belakang Cloudflare_Tunnel. Header lain (`X-Forwarded-For`, `X-Real-IP`) SHALL diabaikan
- **Loopback_Origin**: Origin `http://127.0.0.1:3000` yang dipakai oleh `ServiceAPDBackend.py` (Python) saat memanggil API Next.js di mesin yang sama, sehingga request Service_Token tidak melewati Cloudflare_Tunnel

## Requirements

### Requirement 1: Database Persisten Berbasis SQLite + Prisma

**User Story:** Sebagai operator sistem, saya ingin seluruh data SafeGuard APD disimpan di database relasional, sehingga data tetap konsisten saat banyak request bersamaan dan dapat diupgrade ke Postgres di kemudian hari.

#### Acceptance Criteria

1. THE Database_Layer SHALL menggunakan SQLite dengan file database terletak di `data/safeguard.db`, diakses secara eksklusif melalui Prisma Client versi minimal 5.0 yang diinisialisasi sebagai instance singleton di seluruh proses aplikasi, dan SHALL menangani minimal 50 operasi baca-tulis bersamaan tanpa mengembalikan error "database is locked" untuk request yang selesai dalam waktu 5000 milidetik
2. THE Prisma_Schema SHALL mendefinisikan minimal sepuluh model: User, Role, Permission, RolePermission, Session, Sector, Node, Violation, Setting, dan AuditLog dengan relasi yang dideklarasikan eksplisit: User many-to-one Role, Role many-to-many Permission via RolePermission, User one-to-many Session, User one-to-many AuditLog, Node many-to-one Sector, dan User many-to-many Sector via Sector_Assignment
3. THE Database_Layer SHALL mendukung migrasi schema melalui perintah `npx prisma migrate dev` dan `npx prisma migrate deploy`, dengan setiap migrasi menghasilkan berkas SQL di direktori `prisma/migrations/{timestamp}_{nama-migrasi}/migration.sql`
4. WHEN aplikasi startup DAN tabel Role berisi nol record, THE Database_Layer SHALL menjalankan seed otomatis di dalam satu transaksi Prisma yang membuat lima Role default (Super_Admin, Admin_K3, Supervisor, PIC_Sektor, Auditor) beserta Permission_Matrix sesuai daftar Permission pada Requirement 6, dengan seed WAJIB idempotent sehingga eksekusi ulang saat tabel Role sudah terisi SHALL tidak menghasilkan record duplikat dan tidak mengubah data yang ada
5. WHEN Database_Layer mengeksekusi operasi yang menulis ke dua tabel atau lebih yang berelasi (contoh: membuat User + Sector_Assignment, menghapus User + Session terkait, membuat Role + RolePermission), THE Database_Layer SHALL membungkus seluruh operasi dalam satu Prisma transaction dengan timeout maksimum 5000 milidetik, sehingga jika salah satu operasi gagal seluruh perubahan dibatalkan dan state Database_Layer kembali ke kondisi sebelum transaksi dimulai
6. IF berkas `data/safeguard.db` tidak dapat ditulis karena permission denied, disk penuh, atau lock pada level OS yang tidak dapat dilepas dalam 5000 milidetik, THEN THE Database_Layer SHALL mengembalikan response HTTP 503 dengan body berisi kode error `DB_UNAVAILABLE` tanpa menyertakan path absolut file database, mencatat detail error lengkap ke stderr aplikasi, dan tidak melakukan retry otomatis dalam request yang sama
7. IF aplikasi startup mendeteksi terdapat berkas migrasi di `prisma/migrations/` yang belum diterapkan ke `data/safeguard.db`, THEN THE Database_Layer SHALL menolak setiap request HTTP masuk dengan response HTTP 503 dan kode error `DB_MIGRATION_PENDING` sampai operator menjalankan `npx prisma migrate deploy`, serta mencatat ke stderr daftar nama migrasi yang belum diterapkan

### Requirement 2: Migrasi Data JSON ke Database

**User Story:** Sebagai pemilik sistem, saya ingin seluruh data yang sudah ada di file JSON dipindahkan ke database tanpa kehilangan satu pun record, sehingga riwayat operasional sebelum upgrade tetap utuh.

#### Acceptance Criteria

1. THE Migration_Script SHALL dijalankan melalui perintah `npm run migrate:json-to-db` dan WAJIB idempotent: dijalankan dua kali atau lebih SHALL menghasilkan state Database_Layer yang sama dengan setelah eksekusi pertama (tidak ada data duplikat)
2. WHEN Migration_Script dijalankan, THE Migration_Script SHALL membuat JSON_Backup di direktori `data/backup/{timestamp}/` (format timestamp: `YYYYMMDD-HHmmss`) yang berisi salinan persis dari `data/db.json`, `data/violations.json`, dan `data/settings.json` SEBELUM record pertama dimasukkan ke Database_Layer
3. THE Migration_Script SHALL memetakan setiap node dari `data/db.json` field-by-field ke tabel Node di Database_Layer dengan mempertahankan nilai id, sektorId, sektorName, picName, picPhone, cameraSource, enabled, dan struktur nested camera/esp32/detection (jika ada) sesuai Requirement 9 spec node-detail-tree-view
4. THE Migration_Script SHALL memetakan setiap pelanggaran dari `data/violations.json` ke tabel Violation di Database_Layer dengan mempertahankan field timestamp, nodeId, ppeMissing, imageRef, dan field lain yang ada
5. THE Migration_Script SHALL memetakan setiap key di `data/settings.json` ke tabel Setting di Database_Layer dengan struktur key-value (key string, value JSON-serialized string)
6. IF Migration_Script gagal di tengah eksekusi (contoh: koneksi database putus, validasi data gagal), THEN THE Migration_Script SHALL membatalkan seluruh transaksi sehingga tidak ada record parsial yang tersisa di Database_Layer, dan menampilkan pesan error ke stdout berisi nomor record terakhir yang berhasil divalidasi
7. WHEN Migration_Script selesai dengan status sukses, THE Migration_Script SHALL menulis berkas marker `data/.migrated` berisi timestamp ISO-8601 dan jumlah record per tabel, dan kehadiran berkas marker ini WAJIB diperiksa saat startup aplikasi sebagai indikator bahwa migrasi telah selesai

### Requirement 3: Kompatibilitas Backend Python via Service Token

**User Story:** Sebagai pengembang Python, saya ingin `ServiceAPDBackend.py` tetap dapat membaca konfigurasi node dan menulis pelanggaran baru ke dashboard tanpa perlu mengubah kode autentikasi pengguna, sehingga proses deteksi APD di Python tidak terganggu.

#### Acceptance Criteria

1. THE Dashboard_System SHALL menerima header HTTP `Authorization: Bearer <Service_Token>` pada request masuk dan, jika token cocok dengan environment variable `APD_SERVICE_TOKEN` yang berisi minimal 32 karakter, melewati pengecekan Session dan CSRF_Token
2. WHERE request membawa Service_Token yang valid, THE API_Middleware SHALL mengizinkan akses hanya pada whitelist endpoint berikut: `GET /api/nodes`, `GET /api/nodes/{id}`, `GET /api/nodes/{id}/status`, `GET /api/settings`, `POST /api/violations`, dan `POST /api/nodes/{id}/heartbeat`
3. IF request membawa Service_Token DAN menargetkan endpoint di luar whitelist Acceptance Criteria 2, THEN THE API_Middleware SHALL mengembalikan response HTTP 403 dengan body `{ "error": "service_token_scope_denied" }`
4. IF Service_Token kosong atau lebih pendek dari 32 karakter saat startup aplikasi, THEN THE Dashboard_System SHALL menolak permintaan ber-Service_Token dengan response HTTP 503 dan mencatat warning ke stderr "APD_SERVICE_TOKEN tidak terkonfigurasi"
5. WHEN request menggunakan Service_Token, THE Audit_Log SHALL mencatat entri dengan userId bernilai `system:python-backend` dan metadata berisi endpoint dan IP asal sehingga aktivitas backend Python tetap terlacak
6. THE Dashboard_System SHALL menyediakan halaman setting di `/settings/integrations` (akses Super_Admin saja) yang menampilkan placeholder Service_Token (tidak menampilkan nilai asli) beserta tombol "Generate Token Baru" yang menulis ulang nilai `APD_SERVICE_TOKEN` di file `.env.local` dan menampilkan token baru sekali saja kepada Super_Admin

### Requirement 4: Login dan Manajemen Sesi

**User Story:** Sebagai pengguna dashboard, saya ingin login dengan kredensial saya untuk mengakses fitur sesuai peran, sehingga akses ke data SafeGuard APD terkontrol.

#### Acceptance Criteria

1. THE Login_Page SHALL menampilkan form berisi field username (1–32 karakter), field password (input type password, 1–256 karakter), dan tombol submit; field kode TOTP (6 digit numerik) ditampilkan hanya jika User memiliki 2FA aktif sesuai Requirement 12
2. WHEN User mengirim form login dengan username dan password yang cocok terhadap record User berstatus `active` dan tidak ter-Account_Lockout, THE Auth_System SHALL membuat record Session baru dengan expiresAt = sekarang + 8 jam, mengeset Session_Cookie di response, mencatat entri Audit_Log dengan action `auth:login:success`, dan me-redirect ke halaman default sesuai role User (Super_Admin/Admin_K3 → `/`, Supervisor → `/monitor`, PIC_Sektor → `/`, Auditor → `/reports`)
3. IF kombinasi username dan password tidak cocok dengan record User mana pun ATAU User pemilik kredensial berstatus `disabled` ATAU `locked`, THEN THE Auth_System SHALL mengembalikan response HTTP 401 dengan pesan generik "Username atau password salah" (tanpa membedakan apakah username, password, atau status akun yang menyebabkan kegagalan), mencatat entri Audit_Log dengan action `auth:login:failure` beserta metadata alasan internal (`invalid_credentials` / `user_disabled` / `user_locked`), dan menambah counter Rate_Limiter
4. WHEN User mengakses endpoint `POST /api/auth/logout` dengan Session valid, THE Auth_System SHALL menghapus record Session dari Database_Layer, menghapus Session_Cookie di response (Set-Cookie dengan Max-Age=0), dan mencatat entri Audit_Log dengan action `auth:logout`
5. IF endpoint `POST /api/auth/logout` dipanggil tanpa Session_Cookie ATAU dengan Session yang sudah expired atau tidak ditemukan di Database_Layer, THEN THE Auth_System SHALL tetap mengembalikan response HTTP 200 dan mengeset Set-Cookie dengan Max-Age=0 untuk membersihkan cookie sisa di browser, sehingga operasi logout bersifat idempotent
6. WHILE Session masih valid (expiresAt > sekarang) DAN request dilakukan minimal 30 menit setelah waktu update expiresAt terakhir (atau createdAt jika Session belum pernah diperpanjang), THE Auth_System SHALL memperbarui expiresAt menjadi sekarang + 8 jam (sliding expiration) sehingga User aktif tidak ter-logout di tengah penggunaan
7. IF User mencoba mengakses route terproteksi tanpa Session_Cookie atau dengan Session yang sudah expired, THEN THE API_Middleware SHALL me-redirect dengan HTTP 302 ke `/login?redirect={path-asal}` (path URL-encoded) untuk request yang header `Accept`-nya mengandung `text/html`, DAN mengembalikan response HTTP 401 dengan body `{ "error": "session_invalid" }` untuk seluruh request lain termasuk path `/api/*`
8. THE Auth_System SHALL menjalankan job pembersihan terjadwal yang dimulai paling lambat 5 menit setelah aplikasi start dan berulang setiap 60 menit dengan toleransi ±30 detik, menghapus seluruh record Session dengan expiresAt < (sekarang − 24 jam) dalam satu transaksi Prisma, sehingga tabel Session tidak tumbuh tanpa batas

### Requirement 5: Manajemen User

**User Story:** Sebagai Super_Admin, saya ingin menambah, mengubah, menonaktifkan, dan menghapus akun pengguna, sehingga saya dapat mengelola siapa yang boleh mengakses dashboard.

#### Acceptance Criteria

1. THE Dashboard_System SHALL menyediakan halaman `/users` yang dapat diakses hanya oleh User dengan Permission `user:read`, menampilkan daftar User dalam tabel berisi kolom: username, fullName, email, roleName, status, lastLoginAt, dan kolom aksi (Edit/Reset Password/Disable/Delete)
2. WHEN User dengan Permission `user:create` membuat User baru, THE Dashboard_System SHALL memvalidasi: username unik dan 3–32 karakter alfanumerik plus titik/underscore/dash, email valid dan unik, fullName 1–100 karakter, roleId merujuk ke Role yang ada, password mematuhi Password_Policy, dan menyimpan record dengan mustChangePassword=true sehingga User wajib mengganti password saat login pertama
3. IF User yang dibuat berperan Supervisor atau PIC_Sektor, THEN THE Dashboard_System SHALL mewajibkan minimal satu Sector_Assignment dipilih saat pembuatan, dan mencegah penyimpanan jika daftar Sector_Assignment kosong
4. WHEN User dengan Permission `user:reset-password` melakukan reset password User lain, THE Dashboard_System SHALL membangkitkan password sementara berkekuatan minimal 12 karakter acak yang memenuhi Password_Policy, mengeset mustChangePassword=true, menampilkan password sementara sekali saja kepada admin yang melakukan reset, dan mencatat entri Audit_Log dengan action `user:password-reset`
5. WHEN User dengan Permission `user:update` mengubah status User dari active ke disabled, THE Dashboard_System SHALL menghapus seluruh Session aktif milik User tersebut sehingga User segera ter-logout dari semua perangkat
6. IF User mencoba menghapus dirinya sendiri ATAU menghapus User Super_Admin terakhir yang masih aktif, THEN THE Dashboard_System SHALL menolak operasi dengan response HTTP 400 dan pesan error "Tidak dapat menghapus akun Super_Admin terakhir" atau "Tidak dapat menghapus akun sendiri"
7. WHEN User pertama kali dibuat saat seed (boot pertama Database_Layer kosong), THE Database_Layer SHALL membuat satu User Super_Admin default dengan username `admin`, password acak 16 karakter yang memenuhi Password_Policy, dan mustChangePassword=true; password default ini WAJIB ditampilkan satu kali di stdout aplikasi dan tidak boleh disimpan di file mana pun

### Requirement 6: Role dan Permission Matrix

**User Story:** Sebagai Super_Admin, saya ingin mengonfigurasi peran dan izin secara granular, sehingga setiap pengguna hanya dapat mengakses fitur yang sesuai dengan tanggung jawabnya.

#### Acceptance Criteria

1. THE Database_Layer SHALL menyimpan daftar Permission tetap berikut sebagai master data (id, resource, action) yang di-seed saat boot pertama: `node:create`, `node:read`, `node:update`, `node:delete`, `node:toggle`, `node:test-connection`, `violation:read`, `violation:acknowledge`, `violation:export`, `violation:delete`, `report:read`, `report:generate`, `report:export`, `live:view`, `sector:create`, `sector:read`, `sector:update`, `sector:delete`, `sector:assign-pic`, `setting:read`, `setting:update:branding`, `setting:update:notification`, `setting:update:system`, `user:create`, `user:read`, `user:update`, `user:delete`, `user:reset-password`, `role:create`, `role:read`, `role:update`, `role:delete`, `role:assign-permission`, `audit-log:read`
2. THE Permission_Matrix default SHALL memetakan Role ke Permission sebagai berikut: Super_Admin memiliki seluruh Permission tanpa kecuali; Admin_K3 memiliki seluruh Permission kecuali kategori `user:*`, `role:*`, dan `setting:update:system`; Supervisor memiliki `node:read`, `node:toggle`, `violation:read`, `violation:acknowledge`, `report:read`, `report:generate`, `live:view`, `sector:read`; PIC_Sektor memiliki `node:read`, `violation:read`, `report:read`, `sector:read`; Auditor memiliki `node:read`, `violation:read`, `violation:export`, `report:read`, `report:export`, `sector:read`, `audit-log:read`
3. WHEN Super_Admin membuat Role baru di halaman `/roles`, THE Dashboard_System SHALL menyimpan record Role beserta daftar RolePermission yang dipilih dalam satu transaksi Prisma, dan menolak penyimpanan jika nama Role sudah ada (case-insensitive)
4. THE Dashboard_System SHALL mencegah penghapusan lima Role default (Super_Admin, Admin_K3, Supervisor, PIC_Sektor, Auditor) dan mengembalikan response HTTP 400 dengan pesan "Role default tidak dapat dihapus" jika percobaan dilakukan
5. IF Super_Admin mengubah daftar Permission pada Role yang sudah memiliki User aktif, THEN THE Dashboard_System SHALL menerapkan perubahan secara langsung tanpa logout User terkait, dan perubahan WAJIB efektif pada request berikutnya yang dilakukan User tersebut (tidak di-cache lebih dari 60 detik)
6. THE Dashboard_System SHALL mencegah penghapusan Role yang masih memiliki minimal satu User assignment, dan mengembalikan pesan error yang menyertakan jumlah User yang masih ter-assign ke Role tersebut

### Requirement 7: Penegakan Permission pada Setiap API Route

**User Story:** Sebagai pemilik sistem, saya ingin setiap endpoint API memeriksa izin pemanggil sebelum mengeksekusi aksi, sehingga klien front-end yang dimodifikasi atau request langsung dengan curl tetap tidak dapat melewati kontrol akses.

#### Acceptance Criteria

1. THE API_Middleware SHALL menjalankan urutan pemeriksaan berikut pada setiap request ke `/api/*` (kecuali `/api/auth/login`, `/api/auth/csrf`, dan `/api/health`): (1) validasi Session_Cookie atau Service_Token, (2) validasi CSRF_Token untuk metode POST/PUT/PATCH/DELETE, (3) pemeriksaan Permission yang diperlukan endpoint, (4) pemeriksaan Sector_Assignment jika endpoint terkait Sektor tertentu
2. THE Dashboard_System SHALL mendefinisikan mapping eksplisit antara endpoint dan Permission yang diperlukan dalam satu file pusat (contoh `src/lib/permission-map.ts`), dengan setiap endpoint dimapping ke minimal satu Permission, dan unit test memastikan tidak ada endpoint `/api/*` di luar whitelist auth yang tertinggal tanpa mapping
3. IF request lolos validasi Session tetapi User pemanggil tidak memiliki Permission yang diperlukan, THEN THE API_Middleware SHALL mengembalikan response HTTP 403 dengan body `{ "error": "permission_denied", "required": "<permission-string>" }` dan mencatat entri Audit_Log dengan action `auth:permission-denied`
4. WHEN endpoint memodifikasi resource tertentu (PUT/DELETE pada `/api/nodes/{id}`), THE API_Middleware SHALL memuat resource dari Database_Layer terlebih dahulu, memeriksa kepemilikan Sector_Assignment jika role User adalah Supervisor atau PIC_Sektor, dan menolak request dengan HTTP 403 jika resource berada di Sektor yang tidak ter-assign
5. THE Dashboard_System SHALL menerapkan deny-by-default sehingga endpoint baru yang ditambahkan WAJIB diregistrasikan di mapping Permission; jika tidak diregistrasikan, request ke endpoint tersebut SHALL ditolak dengan HTTP 403 dan pesan error `"endpoint_not_registered"`
6. THE API_Middleware SHALL menjalankan pemeriksaan Permission dengan latensi tambahan tidak lebih dari 50 milidetik di luar waktu eksekusi business logic, agar kontrol akses tidak menjadi bottleneck pada request volume tinggi

### Requirement 8: Isolasi Data per Sektor untuk Supervisor dan PIC

**User Story:** Sebagai Supervisor di area tertentu, saya ingin hanya melihat node, pelanggaran, dan laporan dari sektor yang ditugaskan kepada saya, sehingga data area lain tidak terlihat dan saya tidak dibanjiri informasi yang tidak relevan.

#### Acceptance Criteria

1. WHEN User berperan Supervisor atau PIC_Sektor mengakses `/api/nodes`, `/api/violations`, atau `/api/reports`, THE API_Middleware SHALL menambahkan filter `sektorId IN (Sector_Assignment User)` ke query Prisma sehingga hanya record dari sektor yang ditugaskan yang dikembalikan
2. WHEN User berperan Super_Admin, Admin_K3, atau Auditor mengakses endpoint yang sama, THE API_Middleware SHALL TIDAK menambahkan filter Sector_Assignment dan mengembalikan seluruh data
3. IF User berperan Supervisor atau PIC_Sektor mengakses `GET /api/nodes/{id}` untuk node yang berada di Sektor di luar Sector_Assignment, THEN THE API_Middleware SHALL mengembalikan response HTTP 404 (bukan 403) untuk mencegah enumerasi keberadaan node oleh User yang tidak berwenang
4. THE Dashboard_System SHALL menyembunyikan menu navigasi atau opsi UI yang merujuk ke fitur tidak ter-assign Permission pada User aktif, sehingga User berperan PIC_Sektor tidak melihat menu "Kelola Node" walaupun endpoint tetap dilindungi backend
5. WHEN Sector_Assignment User berubah, THE Dashboard_System SHALL membuat efek perubahan pada request berikutnya tanpa membutuhkan logout-login ulang, dengan kemungkinan keterlambatan cache maksimum 60 detik
6. IF User berperan Supervisor atau PIC_Sektor tidak memiliki Sector_Assignment apa pun, THEN THE Dashboard_System SHALL menampilkan halaman placeholder "Belum ada sektor yang ditugaskan kepada Anda. Hubungi Admin K3." pada halaman utama dan mengembalikan array kosong untuk seluruh endpoint data

### Requirement 9: Hashing Password dan Password Policy

**User Story:** Sebagai pemilik sistem, saya ingin password disimpan dengan hashing modern dan kebijakan kuat, sehingga pencurian database tidak otomatis berarti pencurian kredensial.

#### Acceptance Criteria

1. THE Argon2id_Hasher SHALL meng-hash setiap password baru dengan parameter memoryCost minimal 19 MiB (19456), timeCost minimal 2 iterasi, dan parallelism minimal 1, dengan salt acak unik 16 byte per password
2. THE Database_Layer SHALL menyimpan hanya field passwordHash hasil Argon2id_Hasher pada tabel User dan TIDAK PERNAH menyimpan password plaintext, password yang di-hash dengan algoritma berbeda, atau hint password
3. WHEN User mengirim password baru (saat pembuatan akun, ganti password, atau reset password), THE Password_Policy SHALL memvalidasi: panjang minimum 10 karakter, panjang maksimum 256 karakter, mengandung minimal satu huruf besar (A–Z), satu huruf kecil (a–z), satu digit (0–9), dan satu simbol non-alfanumerik (`!@#$%^&*()_+-=[]{}|;:'",.<>/?` atau karakter Unicode lain di luar kategori L dan N), serta TIDAK ADA dalam HIBP_List
4. IF password yang dikirim gagal salah satu aturan Password_Policy, THEN THE Dashboard_System SHALL mengembalikan response HTTP 400 dengan daftar aturan yang dilanggar (contoh: `["panjang_kurang_dari_10", "tidak_ada_simbol", "ada_di_hibp_list"]`)
5. WHEN User berhasil login, THE Auth_System SHALL memeriksa apakah algoritma atau parameter Argon2id_Hasher pada passwordHash sudah ketinggalan zaman dibandingkan parameter saat ini; IF ya, THEN passwordHash SHALL di-rehash dengan parameter terbaru menggunakan password yang baru saja dikirim, secara transparan tanpa interaksi User
6. WHILE User memiliki flag mustChangePassword=true, THE Dashboard_System SHALL me-redirect setiap request HTML ke `/change-password` (kecuali request ke `/change-password` itu sendiri dan `/api/auth/logout`) sampai User berhasil mengganti password
7. WHERE User berperan Super_Admin atau Admin_K3 dan password telah berusia lebih dari 90 hari sejak passwordChangedAt, THE Dashboard_System SHALL mengeset mustChangePassword=true secara otomatis pada login berikutnya sehingga ganti password dipaksa untuk admin
8. THE Dashboard_System SHALL TIDAK PERNAH menulis password plaintext atau passwordHash ke log aplikasi, response API, error stack trace, atau berkas lain selain kolom passwordHash di Database_Layer

### Requirement 10: Rate Limiting Login dan Account Lockout

**User Story:** Sebagai pemilik sistem, saya ingin melindungi akun dari brute force, sehingga password User tidak dapat ditebak dengan percobaan otomatis.

#### Acceptance Criteria

1. THE Rate_Limiter SHALL menghitung jumlah login gagal per kombinasi (IP_remote, username) dalam jendela 15 menit terakhir berdasarkan entri Audit_Log dengan action `auth:login:failure`
2. IF jumlah login gagal pada Acceptance Criteria 1 mencapai 5 untuk kombinasi tertentu, THEN THE Auth_System SHALL menolak login berikutnya pada kombinasi tersebut dengan response HTTP 429 dan pesan "Terlalu banyak percobaan, coba lagi setelah {sisa-menit} menit", terlepas dari benar atau salahnya password
3. WHEN jumlah login gagal terhadap username (terlepas dari IP) mencapai 10 dalam jendela 15 menit, THE Auth_System SHALL menerapkan Account_Lockout pada User tersebut dengan durasi 30 menit, mengeset status User menjadi `locked`, dan mencatat entri Audit_Log dengan action `auth:account-lockout`
4. WHILE User berstatus `locked` dan durasi Account_Lockout belum habis, THE Auth_System SHALL menolak login meskipun password benar dengan pesan generik "Username atau password salah" agar attacker tidak mendapat sinyal validitas username
5. WHEN durasi Account_Lockout habis, THE Auth_System SHALL secara otomatis mengembalikan status User dari `locked` ke `active` pada percobaan login berikutnya yang lolos validasi password
6. WHEN Super_Admin atau Admin_K3 dengan Permission `user:update` membuka kunci akun secara manual via UI, THE Auth_System SHALL mereset status User ke `active`, menghapus counter Rate_Limiter terkait, dan mencatat entri Audit_Log dengan action `user:unlock`
7. THE Rate_Limiter SHALL TIDAK menggunakan IP X-Forwarded-For sebagai sumber tunggal kecuali ada konfigurasi `TRUST_PROXY=true`, sehingga attacker tidak dapat mem-bypass rate limit dengan memalsukan header

### Requirement 11: CSRF dan Keamanan Cookie Sesi

**User Story:** Sebagai pemilik sistem, saya ingin sesi pengguna kebal terhadap pencurian dan permintaan lintas-situs, sehingga akun pengguna aktif tidak dapat dibajak.

#### Acceptance Criteria

1. THE Session_Cookie SHALL diset dengan atribut HttpOnly=true, Secure=true (kecuali di lingkungan development localhost di mana Secure=false diizinkan), SameSite=Lax, Path=/, dan Max-Age sesuai expiresAt Session
2. WHEN User berhasil login, THE Auth_System SHALL membangkitkan CSRF_Token unik 32 byte acak dan menyimpannya di tabel Session, lalu mengembalikan token tersebut pada response body endpoint `/api/auth/login` dan endpoint `GET /api/auth/csrf` (untuk refresh dari front-end)
3. WHEN front-end mengirim request mutasi (POST/PUT/PATCH/DELETE) ke `/api/*` di luar `/api/auth/login`, THE front-end SHALL menyertakan CSRF_Token pada header `X-CSRF-Token`
4. IF request mutasi ke `/api/*` tidak menyertakan header `X-CSRF-Token` ATAU nilainya tidak cocok dengan CSRF_Token Session pemanggil, THEN THE API_Middleware SHALL menolak request dengan response HTTP 403 dan body `{ "error": "csrf_token_invalid" }`
5. THE Dashboard_System SHALL menyediakan endpoint `GET /api/auth/csrf` yang mengembalikan CSRF_Token Session aktif untuk dipakai front-end pada AJAX call, dengan endpoint ini WAJIB melalui validasi Session terlebih dahulu
6. WHERE response HTTP berisi data sensitif (data User, Session, AuditLog), THE Dashboard_System SHALL menambahkan header `Cache-Control: no-store, no-cache, must-revalidate` dan `Pragma: no-cache` agar tidak di-cache oleh proxy atau browser
7. THE Dashboard_System SHALL menambahkan header keamanan default pada setiap response HTML: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, dan `Content-Security-Policy` minimal yang membatasi `default-src 'self'` dengan pengecualian eksplisit untuk inline style yang dipakai Tailwind dan WebSocket origin lokal

### Requirement 12: Two-Factor Authentication (TOTP) Opsional

**User Story:** Sebagai Super_Admin atau Admin_K3, saya ingin dapat mengaktifkan otentikasi dua faktor pada akun saya, sehingga akun tetap aman walau password bocor.

#### Acceptance Criteria

1. THE Dashboard_System SHALL menyediakan halaman `/account/security` yang dapat diakses oleh User yang sudah login, menampilkan toggle "Aktifkan 2FA" yang ketika diaktifkan menampilkan QR code berisi otpauth URI sesuai RFC 6238 dan secret base32 yang dapat disalin manual
2. WHEN User memindai QR code dan memasukkan kode TOTP 6 digit yang valid (dalam jendela ±30 detik dari waktu server), THE Auth_System SHALL menyimpan TOTP secret pada record User (terenkripsi dengan AES-256-GCM menggunakan kunci dari env `APD_ENCRYPTION_KEY`), mengeset flag totpEnabled=true, dan membangkitkan delapan kode recovery sekali pakai berukuran 10 karakter alfanumerik yang ditampilkan satu kali
3. WHILE User memiliki totpEnabled=true, THE Login_Page SHALL menampilkan field "Kode 2FA" pada login screen kedua setelah username+password tervalidasi, dan Auth_System SHALL menolak login jika kode TOTP atau salah satu kode recovery tidak valid
4. WHEN User menggunakan kode recovery saat login, THE Auth_System SHALL menandai kode tersebut sebagai terpakai sehingga tidak dapat digunakan kembali, dan mencatat entri Audit_Log dengan action `auth:2fa:recovery-used`
5. THE Dashboard_System SHALL mewajibkan 2FA aktif untuk seluruh User berperan Super_Admin maksimal 7 hari setelah perubahan setting `require2faForSuperAdmin=true` oleh Super_Admin lain; setelah deadline, Super_Admin yang belum mengaktifkan 2FA SHALL diarahkan ke `/account/security` saat login dan tidak dapat menggunakan fitur lain sampai 2FA aktif
6. WHEN User menonaktifkan 2FA, THE Auth_System SHALL meminta konfirmasi password dan kode TOTP terakhir, menghapus secret dari record User, mengeset totpEnabled=false, menginvalidasi seluruh kode recovery, dan mencatat entri Audit_Log dengan action `auth:2fa:disabled`
7. IF env `APD_ENCRYPTION_KEY` tidak terkonfigurasi atau lebih pendek dari 32 byte saat startup, THEN THE Dashboard_System SHALL menonaktifkan fitur 2FA dengan pesan banner di `/account/security` "Fitur 2FA tidak tersedia: kunci enkripsi belum dikonfigurasi" tanpa menyebabkan crash aplikasi

### Requirement 13: Audit Log

**User Story:** Sebagai Auditor atau Super_Admin, saya ingin dapat melihat catatan lengkap aksi penting di sistem, sehingga insiden dapat diinvestigasi dan kepatuhan dapat dibuktikan.

#### Acceptance Criteria

1. THE Audit_Log SHALL menyimpan entri untuk minimal kategori action berikut: `auth:login:success`, `auth:login:failure`, `auth:logout`, `auth:permission-denied`, `auth:account-lockout`, `auth:2fa:enabled`, `auth:2fa:disabled`, `auth:2fa:recovery-used`, `node:create`, `node:update`, `node:delete`, `node:toggle`, `violation:acknowledge`, `violation:delete`, `violation:export`, `setting:update:branding`, `setting:update:notification`, `setting:update:system`, `user:create`, `user:update`, `user:delete`, `user:password-reset`, `user:unlock`, `role:create`, `role:update`, `role:delete`, `report:export`
2. THE Audit_Log SHALL mencatat per entri: id (UUID), userId (atau `system:python-backend` untuk Service_Token), action, resourceType, resourceId, timestamp (ISO-8601, milidetik), ipAddress, userAgent (max 256 karakter), dan metadata (JSON serialized, max 4 KB)
3. THE Audit_Log SHALL bersifat append-only dari sisi aplikasi: tidak ada endpoint yang melakukan UPDATE atau DELETE pada record AuditLog; jika kebutuhan kepatuhan menuntut purging lama, eksekusi WAJIB dilakukan via skrip CLI manual yang mencatat sendiri operasi delete ke entri AuditLog baru
4. THE Dashboard_System SHALL menyediakan halaman `/audit-log` yang dapat diakses oleh User dengan Permission `audit-log:read`, menampilkan tabel ber-pagination (50 entri per halaman) dengan filter berdasarkan rentang waktu, action, userId, dan resourceType
5. WHEN User dengan Permission `audit-log:read` mengekspor Audit_Log, THE Dashboard_System SHALL membangkitkan berkas CSV berisi seluruh entri pada filter aktif (maksimum 100.000 baris per ekspor) dan mencatat entri Audit_Log baru dengan action `audit-log:export`
6. THE Database_Layer SHALL mempertahankan record AuditLog selama minimum 365 hari sebelum eligible untuk purge manual, dengan kebijakan retensi default disimpan di tabel Setting key `auditLogRetentionDays` dengan nilai awal 365
7. IF penulisan ke AuditLog gagal karena Database_Layer tidak tersedia, THEN THE Dashboard_System SHALL tetap mengizinkan operasi business logic berlanjut TETAPI mencatat warning ke stderr "AuditLog write failure" disertai action yang gagal, sehingga tidak terjadi denial-of-service akibat masalah audit

### Requirement 14: Proteksi Route, Halaman Login, dan Backwards Compatibility UI

**User Story:** Sebagai pengguna baru yang belum login, saya ingin diarahkan ke halaman login dengan UI yang konsisten dengan dashboard, sehingga proses masuk terasa terintegrasi dan saya tidak melihat data sebelum diautentikasi.

#### Acceptance Criteria

1. THE API_Middleware SHALL menjalankan pemeriksaan Session pada setiap navigasi ke halaman selain `/login`, `/forgot-password` (jika diimplementasikan), `/api/auth/*`, `/api/health`, dan aset statis di `/_next/*` dan `/public/*`; request tanpa Session SHALL di-redirect ke `/login?redirect={pathname}`
2. THE Login_Page SHALL menggunakan tema Tailwind dan komponen UI yang konsisten dengan halaman dashboard lainnya (warna, font, logo SafeGuard APD, ikon), tidak menampilkan menu navigasi sidebar, dan menampilkan tombol "Lupa password? Hubungi Admin K3" sebagai catatan statis
3. WHEN User berhasil login, THE Dashboard_System SHALL me-redirect ke nilai parameter `redirect` jika ada DAN aman (path absolut yang dimulai dengan `/` tetapi bukan `//` atau `http`), atau ke halaman default sesuai role sebagaimana didefinisikan pada Requirement 4
4. THE Dashboard_System SHALL menyembunyikan elemen menu navigasi berdasarkan Permission User aktif: tombol "Tambah Node" hanya tampil bagi User dengan `node:create`, menu "Kelola User" hanya tampil bagi User dengan `user:read`, menu "Audit Log" hanya tampil bagi User dengan `audit-log:read`, dan seterusnya untuk seluruh aksi mutasi pada UI
5. WHEN User mengakses halaman tanpa Permission yang diperlukan secara langsung melalui URL bookmark, THE Dashboard_System SHALL menampilkan halaman `/403` (Forbidden) dengan pesan "Anda tidak memiliki izin untuk mengakses halaman ini" dan tombol "Kembali ke Dashboard"
6. THE Dashboard_System SHALL mempertahankan kompatibilitas antarmuka data untuk seluruh halaman yang sudah ada (`/`, `/monitor`, `/violations`, `/nodes`, `/reports`, `/settings`, `/map`) sehingga setelah migrasi, halaman-halaman tersebut WAJIB tetap menampilkan data yang sama persis dengan sebelum migrasi (asumsikan User memiliki Permission yang memadai), dengan pengecualian: halaman yang sebelumnya bisa diakses tanpa login sekarang membutuhkan Session valid
7. THE Dashboard_System SHALL menampilkan widget pojok kanan atas pada setiap halaman terproteksi yang berisi avatar User, nama lengkap, nama Role, dan menu dropdown dengan tautan: "Akun saya" (`/account/security`), "Audit Log" (jika berhak), dan "Logout"

### Requirement 15: Deployment Lokal dengan Akses Jarak Jauh via Cloudflare Tunnel

**User Story:** Sebagai mahasiswa PBL, saya ingin men-deploy seluruh stack SafeGuard APD (Next.js + SQLite + Python YOLO + ESP32 alarm bridge) di satu laptop ber-NVIDIA dan mengeksposnya ke internet melalui Cloudflare_Tunnel agar dosen penguji dapat login dari jarak jauh tanpa perlu berada di lab, sehingga sistem dapat didemonstrasikan baik secara lokal maupun online dengan basis kode yang sama.

#### Acceptance Criteria

1. THE Dashboard_System SHALL dijalankan oleh proses Next.js yang bind hanya ke alamat `127.0.0.1:3000` di laptop deployment (bukan `0.0.0.0`), sehingga port 3000 TIDAK dapat diakses langsung dari LAN maupun internet kecuali melalui Cloudflare_Tunnel atau loopback localhost
2. THE Dashboard_System SHALL menyediakan berkas konfigurasi `cloudflared/config.yml` di repository yang memetakan satu hostname (contoh `safeguard.<domain>.<tld>`) ke `http://127.0.0.1:3000` dengan `noTLSVerify: true` untuk loopback dan flag pass-through WebSocket aktif, sehingga frame live monitor dapat melewati tunnel tanpa konfigurasi tambahan
3. WHEN aplikasi mendeteksi environment variable `BEHIND_PROXY=cloudflare` saat startup, THE API_Middleware SHALL membaca header `CF-Connecting-IP` sebagai source IP untuk Rate_Limiter (Requirement 10) dan Audit_Log (Requirement 13), DAN SHALL menolak request dengan response HTTP 400 dan kode `untrusted_proxy_origin` jika IP koneksi remote (`req.socket.remoteAddress`) tidak termasuk dalam Trusted_Proxy_IPs DAN bukan loopback (`127.0.0.1` atau `::1`)
4. WHEN environment variable `BEHIND_PROXY=cloudflare` aktif, THE Session_Cookie SHALL diset dengan atribut `Secure=true` dan `SameSite=Lax` tanpa pengecualian, sehingga cookie hanya dapat dikirim melalui koneksi TLS yang diterminasi di edge Cloudflare
5. WHEN `ServiceAPDBackend.py` melakukan request ke API Next.js dari proses yang berjalan di laptop yang sama, THE Python backend SHALL menggunakan Loopback_Origin `http://127.0.0.1:3000` dengan header `Authorization: Bearer <Service_Token>`, DAN API_Middleware SHALL melewati validasi Trusted_Proxy_IPs untuk request yang berasal dari `127.0.0.1` atau `::1`
6. IF Cloudflare_Tunnel terputus selama lebih dari 10 detik saat client browser remote sedang membuka halaman live monitor, THEN klien WebSocket SHALL melakukan reconnect otomatis dengan exponential backoff 1 detik, 2 detik, 4 detik, 8 detik, dan maksimum 30 detik antar percobaan, sambil menampilkan banner "Koneksi tunnel terputus, mencoba menyambung kembali" sampai koneksi pulih
7. WHILE Cloudflare_Tunnel offline (daemon `cloudflared` mati atau tidak dapat menjangkau edge Cloudflare), THE Dashboard_System SHALL TETAP berfungsi normal untuk akses lokal melalui `http://127.0.0.1:3000` atau `http://localhost:3000` di laptop deployment, sehingga deteksi YOLO, ESP32 alarm via MQTT, dan WhatsApp notification via GoWA tetap jalan tanpa terganggu hilangnya akses internet
8. THE README.md repository SHALL menyertakan bagian "Deployment Cloudflare Tunnel" yang berisi: prasyarat (akun Cloudflare gratis, domain ter-register di Cloudflare DNS atau alternatif quick tunnel `*.trycloudflare.com`), perintah `cloudflared tunnel create safeguard-apd`, contoh isi `cloudflared/config.yml`, perintah routing DNS `cloudflared tunnel route dns safeguard-apd <hostname>`, perintah service install untuk Windows (`cloudflared service install`), dan langkah verifikasi WebSocket bekerja melalui tunnel (membuka `/monitor` dari jaringan eksternal dan memastikan frame live preview muncul dalam waktu 5 detik setelah node aktif)
