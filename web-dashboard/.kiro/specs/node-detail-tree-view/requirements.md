# Requirements Document

## Introduction

Redesain halaman Kelola Node (/nodes) pada ProyekSafeGuard APD Web Dashboard. Halaman saat ini menampilkan tabel datar dengan CRUD biasa. Redesain ini menambahkan **Tree View Detail** yang menampilkan komponen-komponen node (kamera, ESP32, deteksi) dalam struktur hierarkis yang interaktif, mirip file explorer VS Code. Selain itu, form Tambah/Edit Node akan diubah menjadi **Step-by-Step Wizard** dengan validasi real-time dan fitur test koneksi langsung.

Fitur tambahan meliputi: indikator kesehatan node (health score), quick actions inline, animasi transisi yang halus, dan visualisasi status komponen yang informatif menggunakan color-coded indicators.

## Glossary

- **Node**: Unit monitoring yang terdiri dari kombinasi kamera, ESP32, dan konfigurasi deteksi yang ditempatkan di sektor tertentu
- **Tree_View**: Komponen UI yang menampilkan data hierarkis dalam bentuk indented list dengan expand/collapse, mirip file explorer
- **Tree_Item**: Satu baris dalam Tree View yang merepresentasikan komponen atau properti dari node
- **Health_Score**: Skor agregat (0-100) yang merepresentasikan kesehatan operasional keseluruhan dari sebuah node berdasarkan status komponen-komponennya
- **Node_Wizard**: Form multi-step untuk menambah atau mengedit node yang membagi proses input menjadi langkah-langkah logis
- **Quick_Action**: Tombol aksi cepat yang terintegrasi langsung di Tree View tanpa perlu membuka modal terpisah
- **Status_Indicator**: Elemen visual berupa dot berwarna dengan opsional animasi pulse yang menunjukkan status koneksi komponen
- **ESP32_Module**: Mikrokontroler yang berfungsi sebagai alarm buzzer, terhubung via MQTT ke HiveMQ Cloud
- **Camera_Component**: IP Camera V380 yang terhubung melalui RTSP stream atau webcam lokal (index 0)
- **Detection_Config**: Konfigurasi model YOLO untuk deteksi APD termasuk mode (GPU/CPU), confidence threshold, dan FPS estimasi
- **Sector_Info**: Informasi area penempatan node meliputi ID sektor, nama sektor, dan PIC penanggung jawab
- **Connection_Test**: Proses verifikasi konektivitas ke komponen node (ping kamera RTSP, cek MQTT broker)
- **Dashboard_System**: Aplikasi web Next.js untuk monitoring dan manajemen node-node deteksi APD

## Requirements

### Requirement 1: Expandable Tree View pada List Node

**User Story:** Sebagai operator, saya ingin melihat detail komponen node dalam format tree view ketika diklik, sehingga saya dapat memahami komposisi dan status setiap node tanpa membuka halaman terpisah.

#### Acceptance Criteria

1. WHEN operator mengklik sebuah baris node di tabel, THE Tree_View SHALL menampilkan struktur hierarkis komponen node tersebut dengan animasi expand (slide-down + fade-in) dalam durasi maksimal 300ms, dan mendukung multiple node ter-expand secara bersamaan (non-accordion) hingga maksimal 20 node
2. WHEN operator mengklik baris node yang sudah ter-expand, THE Tree_View SHALL menutup (collapse) detail tersebut dengan animasi slide-up + fade-out dalam durasi maksimal 200ms
3. THE Tree_View SHALL menampilkan komponen-komponen berikut sesuai komposisi node: Camera_Component (jika terkonfigurasi), ESP32_Module (jika terkonfigurasi), Detection_Config, dan Sector_Info, di mana setiap section komponen menampilkan minimal: label komponen dan indikator status operasional (online, offline, atau error)
4. IF sebuah node hanya memiliki kamera tanpa ESP32, THEN THE Tree_View SHALL menampilkan Camera_Component dan Detection_Config tanpa section ESP32_Module
5. IF sebuah node hanya memiliki ESP32 tanpa kamera, THEN THE Tree_View SHALL menampilkan ESP32_Module tanpa section Camera_Component dan Detection_Config
6. THE Tree_View SHALL menggunakan indentation visual berupa garis vertikal (tree lines) dengan karakter connector (├─, └─, │) menggunakan CSS pseudo-elements dengan indentasi 16px per level hierarki untuk menunjukkan hubungan parent-child antar komponen
7. WHILE node sedang dalam keadaan expand, THE Dashboard_System SHALL mempertahankan state expand tersebut meskipun tabel di-sort atau di-filter, selama node masih terlihat dalam hasil filter
8. IF data komponen node gagal dimuat dalam waktu 5 detik setelah expand, THEN THE Tree_View SHALL menampilkan pesan error pada section yang gagal beserta opsi retry, tanpa menutup tree view dan tanpa mempengaruhi section komponen lain yang berhasil dimuat

### Requirement 2: Status Indicators dengan Color-Coded Visual

**User Story:** Sebagai operator, saya ingin melihat status koneksi komponen node secara visual menggunakan warna dan animasi, sehingga saya dapat dengan cepat mengidentifikasi masalah tanpa membaca teks detail.

#### Acceptance Criteria

1. WHILE komponen berstatus online atau connected, THE Status_Indicator SHALL menampilkan dot berwarna hijau (#22c55e) dengan animasi pulse berfrekuensi 1 siklus per 1.5 detik
2. WHILE komponen berstatus offline atau disconnected, THE Status_Indicator SHALL menampilkan dot berwarna merah (#ef4444) tanpa animasi
3. WHILE komponen berstatus degraded atau reconnecting, THE Status_Indicator SHALL menampilkan dot berwarna kuning (#f59e0b) dengan animasi pulse berfrekuensi 1 siklus per 3 detik
4. WHILE komponen belum memiliki parameter koneksi (URL RTSP atau alamat MQTT), THE Status_Indicator SHALL menampilkan dot berwarna abu-abu (#9ca3af) tanpa animasi
5. WHEN status komponen berubah, THE Status_Indicator SHALL memperbarui warna dan animasi dengan CSS transition dalam durasi 400ms
6. WHEN operator mengarahkan kursor ke Status_Indicator, THE Dashboard_System SHALL menampilkan tooltip berisi timestamp terakhir update status dalam format waktu relatif (contoh: "3 detik lalu", "2 menit lalu")
7. IF data status komponen tidak dapat diperoleh selama lebih dari 10 detik, THEN THE Status_Indicator SHALL menampilkan dot berwarna abu-abu (#9ca3af) tanpa animasi disertai tooltip yang mengindikasikan bahwa koneksi ke sumber data status terputus

### Requirement 3: Node Health Score Overview

**User Story:** Sebagai supervisor, saya ingin melihat skor kesehatan agregat setiap node, sehingga saya dapat memprioritaskan node mana yang memerlukan perhatian.

#### Acceptance Criteria

1. THE Dashboard_System SHALL menghitung Health_Score (0-100) berdasarkan bobot: status kamera (40%), status ESP32 (30%), dan konfigurasi deteksi valid (30%), di mana setiap komponen berkontribusi secara biner (0% jika tidak aktif/tidak terkoneksi, atau 100% dari bobotnya jika aktif dan terkoneksi)
2. IF Health_Score bernilai 80 atau lebih, THEN THE Dashboard_System SHALL menampilkan badge berwarna hijau dengan label "Sehat"
3. IF Health_Score bernilai antara 50 (inklusif) dan 79 (inklusif), THEN THE Dashboard_System SHALL menampilkan badge berwarna kuning dengan label "Perlu Perhatian"
4. IF Health_Score bernilai 49 atau kurang, THEN THE Dashboard_System SHALL menampilkan badge berwarna merah dengan label "Kritis"
5. THE Dashboard_System SHALL menampilkan Health_Score dalam bentuk circular progress indicator berukuran 36x36px di kolom tabel, sebelum kolom nama sektor
6. IF node tidak memiliki kamera (hanya ESP32), THEN THE Dashboard_System SHALL menghitung Health_Score dengan bobot: status ESP32 (60%) dan konfigurasi deteksi valid (40%)
7. IF node tidak memiliki ESP32 (hanya kamera), THEN THE Dashboard_System SHALL menghitung Health_Score dengan bobot: status kamera (60%) dan konfigurasi deteksi valid (40%)
8. THE Dashboard_System SHALL menganggap konfigurasi deteksi sebagai valid apabila node memiliki minimal satu zona deteksi yang terdefinisi dan minimal satu jenis PPE yang dipilih untuk dideteksi
9. WHEN status koneksi komponen node berubah (kamera terkoneksi/terputus, ESP32 terkoneksi/terputus, atau konfigurasi deteksi diperbarui), THE Dashboard_System SHALL memperbarui Health_Score node tersebut dalam waktu maksimal 5 detik

### Requirement 4: Step-by-Step Wizard untuk Add/Edit Node

**User Story:** Sebagai operator, saya ingin mengisi form node secara bertahap dalam langkah-langkah yang jelas, sehingga saya tidak kewalahan dengan banyaknya field dan dapat memvalidasi setiap bagian secara terpisah.

#### Acceptance Criteria

1. THE Node_Wizard SHALL membagi proses input menjadi 4 langkah: (1) Informasi Sektor berisi field node name dan sector assignment, (2) Konfigurasi Kamera berisi field RTSP camera URL, resolution, confidence threshold, dan detection mode, (3) Konfigurasi ESP32 berisi field MQTT broker host dan MQTT topic, dan (4) Review dan Konfirmasi
2. THE Node_Wizard SHALL menampilkan progress stepper horizontal di bagian atas yang menunjukkan langkah aktif, langkah yang sudah selesai, dan langkah yang belum dikerjakan
3. WHEN operator berada di langkah 2 (Konfigurasi Kamera), THE Node_Wizard SHALL menyediakan opsi "Skip — node ini tidak menggunakan kamera" untuk melompat ke langkah 3
4. WHEN operator berada di langkah 3 (Konfigurasi ESP32), THE Node_Wizard SHALL menyediakan opsi "Skip — node ini tidak menggunakan ESP32" untuk melompat ke langkah 4
5. IF operator memilih skip pada langkah 2 DAN juga memilih skip pada langkah 3, THEN THE Node_Wizard SHALL menampilkan pesan error yang menyatakan minimal satu konfigurasi perangkat (kamera atau ESP32) harus diisi, dan mencegah navigasi ke langkah 4
6. THE Node_Wizard SHALL memvalidasi setiap langkah sebelum mengizinkan navigasi ke langkah berikutnya dengan aturan berikut: node name wajib diisi (1–100 karakter), sector wajib dipilih, RTSP URL wajib dan harus diawali "rtsp://" (jika langkah 2 tidak di-skip), resolution wajib dipilih (jika langkah 2 tidak di-skip), confidence threshold wajib berupa angka antara 0.01 hingga 1.00 (jika langkah 2 tidak di-skip), detection mode wajib dipilih antara CPU atau GPU (jika langkah 2 tidak di-skip), MQTT broker host wajib diisi (jika langkah 3 tidak di-skip), dan MQTT topic wajib diisi (jika langkah 3 tidak di-skip); pesan error ditampilkan inline di bawah field yang tidak memenuhi aturan
7. WHEN operator berada di langkah 4 (Review), THE Node_Wizard SHALL menampilkan ringkasan semua data yang telah diisi dalam format read-only card per section, menampilkan label "Tidak dikonfigurasi" untuk section yang di-skip, dan menyediakan tombol "Edit" di setiap section yang terisi untuk kembali ke langkah terkait
8. WHEN operator menavigasi maju atau mundur antar langkah, THE Node_Wizard SHALL mempertahankan semua data yang sudah diisi pada langkah sebelumnya
9. IF operator menutup wizard tanpa menyimpan DAN sudah ada minimal satu field yang diisi, THEN THE Node_Wizard SHALL menampilkan konfirmasi dialog dengan dua pilihan: "Tetap di sini" untuk kembali ke wizard, atau "Keluar" untuk menutup wizard dan menghapus data yang belum tersimpan
10. WHEN operator menekan tombol "Simpan" pada langkah 4 (Review) DAN semua validasi terpenuhi, THE Node_Wizard SHALL menyimpan konfigurasi node, menutup wizard, dan menampilkan node baru atau perubahan pada daftar node dalam waktu maksimal 2 detik

### Requirement 5: Quick Actions di Tree View

**User Story:** Sebagai operator, saya ingin melakukan aksi cepat seperti test koneksi dan lihat live feed langsung dari tree view, sehingga saya tidak perlu navigasi ke halaman lain.

#### Acceptance Criteria

1. THE Tree_View SHALL menampilkan tombol Quick_Action "Test Koneksi" pada setiap Camera_Component yang memiliki field URL RTSP terisi (non-empty string)
2. WHEN operator mengklik "Test Koneksi" pada Camera_Component, THE Dashboard_System SHALL menampilkan indikator loading pada tombol tersebut, melakukan request ke endpoint API untuk memverifikasi reachability URL RTSP, dan menampilkan hasil berupa indikator visual sukses atau gagal dalam waktu maksimal 10 detik, dengan hasil tetap terlihat selama minimal 5 detik sebelum kembali ke state awal
3. THE Tree_View SHALL menampilkan tombol Quick_Action "Lihat Live" pada setiap Camera_Component yang berstatus online
4. WHEN operator mengklik "Lihat Live", THE Dashboard_System SHALL membuka inline preview panel (bukan halaman baru) yang menampilkan frame terbaru dari WebSocket stream node tersebut, dengan maksimal 1 preview panel aktif pada satu waktu (panel sebelumnya ditutup otomatis jika ada)
5. THE Tree_View SHALL menampilkan tombol Quick_Action "Test MQTT" pada setiap ESP32_Module yang memiliki field MQTT broker address dan MQTT topic terisi (non-empty string)
6. WHEN operator mengklik "Test MQTT", THE Dashboard_System SHALL menampilkan indikator loading pada tombol tersebut, mengirim pesan test ke MQTT topic yang terkonfigurasi, dan menampilkan status respon berupa indikator visual connected atau timeout dalam waktu maksimal 5 detik, dengan hasil tetap terlihat selama minimal 5 detik sebelum kembali ke state awal
7. IF Connection_Test gagal, THEN THE Dashboard_System SHALL menampilkan pesan error deskriptif yang mencantumkan kemungkinan penyebab (timeout, URL salah, broker unreachable)
8. WHEN operator mengklik tombol close pada preview panel, THE Dashboard_System SHALL menutup preview panel dan menghentikan koneksi WebSocket stream terkait dalam waktu maksimal 2 detik

### Requirement 6: Animasi dan Transisi Halus

**User Story:** Sebagai operator, saya ingin interaksi dengan halaman node terasa responsif dan smooth, sehingga pengalaman pengguna menyenangkan dan profesional.

#### Acceptance Criteria

1. THE Dashboard_System SHALL menggunakan CSS transitions atau Framer Motion untuk semua perubahan state visual (expand, collapse, hover, focus) dengan easing function ease-out dan durasi 200ms untuk expand/collapse/focus
2. WHEN baris node di-hover, THE Dashboard_System SHALL menampilkan background highlight dengan opacity 5%-8% dari warna foreground menggunakan transisi 150ms
3. WHEN tree node di-expand, THE Tree_View SHALL menggunakan staggered animation dengan delay 50ms per item, dibatasi maksimal 10 item pertama (total maksimal 500ms), sementara item setelahnya ditampilkan langsung tanpa delay
4. WHILE animasi expand atau collapse sedang berlangsung, THE Dashboard_System SHALL mencegah input klik berulang pada node yang sama, dan IF animasi tidak selesai dalam 500ms, THEN THE Dashboard_System SHALL memaksa state akhir animasi dan mengaktifkan kembali input pada node tersebut
5. IF pengguna mengaktifkan prefers-reduced-motion pada sistem operasi, THEN THE Dashboard_System SHALL menonaktifkan semua animasi expand, collapse, hover highlight transition, dan staggered animation, sementara hanya mempertahankan perubahan state secara instan tanpa durasi transisi

### Requirement 7: Komposisi Node Fleksibel

**User Story:** Sebagai operator, saya ingin bisa membuat node dengan berbagai kombinasi komponen (kamera saja, ESP32 saja, atau keduanya), sehingga sistem mendukung beragam konfigurasi lapangan.

#### Acceptance Criteria

1. THE Dashboard_System SHALL menyimpan dan menampilkan tiga tipe komposisi node: "kamera saja", "ESP32 saja", dan "kamera + ESP32", di mana tipe ditentukan berdasarkan field mana yang bernilai null pada data node
2. IF node memiliki field ESP32 bernilai null dan field kamera terisi, THEN THE Dashboard_System SHALL mengidentifikasi node sebagai tipe "kamera saja" dan menampilkan Tree_View tanpa section ESP32_Module
3. IF node memiliki field kamera dan deteksi bernilai null dan field ESP32 terisi, THEN THE Dashboard_System SHALL mengidentifikasi node sebagai tipe "ESP32 saja" dan menampilkan Tree_View tanpa section Camera_Component dan Detection_Config
4. WHEN operator melakukan skip pada langkah 2 (Konfigurasi Kamera), THE Node_Wizard SHALL menetapkan tipe komposisi sebagai "ESP32 saja" dan mengisi field kamera serta deteksi dengan null; WHEN operator melakukan skip pada langkah 3 (Konfigurasi ESP32), THE Node_Wizard SHALL menetapkan tipe komposisi sebagai "kamera saja" dan mengisi field ESP32 dengan null; WHEN tidak ada langkah yang di-skip, THE Node_Wizard SHALL menetapkan tipe komposisi sebagai "kamera + ESP32"
5. THE Dashboard_System SHALL menampilkan ikon yang berbeda di kolom tipe pada tabel node untuk setiap tipe komposisi: ikon kamera untuk "kamera saja", ikon chip untuk "ESP32 saja", dan ikon gabungan (kamera + chip) untuk "kamera + ESP32"
6. IF operator melakukan skip pada langkah 2 (Konfigurasi Kamera) DAN langkah 3 (Konfigurasi ESP32), THEN THE Node_Wizard SHALL mencegah navigasi ke langkah 4 (Review) dan menampilkan pesan error yang mengindikasikan bahwa minimal satu komponen (kamera atau ESP32) harus dikonfigurasi
7. WHEN operator mengedit node yang sudah ada dan mengubah komposisinya (misalnya menambah atau menghapus komponen), THE Dashboard_System SHALL memperbarui field yang tidak lagi digunakan menjadi null dan menyesuaikan tampilan Tree_View serta ikon tipe di tabel sesuai komposisi baru

### Requirement 8: Responsivitas Mobile dan Aksesibilitas

**User Story:** Sebagai operator di lapangan, saya ingin mengakses detail node dari perangkat mobile, sehingga saya tetap bisa memantau dan mengoperasikan node tanpa perlu laptop.

#### Acceptance Criteria

1. WHILE viewport berukuran kurang dari 768px, WHEN pengguna mengetuk baris node pada tabel, THE Tree_View SHALL ditampilkan sebagai full-width expandable card (lebar 100% dari parent container) tepat di bawah baris node yang diketuk, dengan animasi expand dalam waktu maksimum 300ms
2. THE Dashboard_System SHALL memastikan semua tombol interaktif dan elemen tappable memiliki ukuran minimum touch target 44x44px sesuai WCAG 2.1 AA guidelines
3. THE Tree_View SHALL mendukung navigasi keyboard dengan pemetaan berikut: Arrow Up/Down untuk berpindah antar sibling tree items, Arrow Right untuk expand node yang collapsed atau pindah ke child pertama jika sudah expanded, Arrow Left untuk collapse node yang expanded atau pindah ke parent jika sudah collapsed, Enter atau Space untuk expand/collapse node aktif, dan focus indicator dengan outline minimal 2px yang terlihat jelas pada item yang sedang difokuskan
4. THE Dashboard_System SHALL menyediakan aria-expanded, aria-level, dan role="treeitem" pada elemen tree view, serta role="tree" pada container utama dan aria-selected pada item yang aktif, untuk kompatibilitas screen reader
5. WHILE viewport berukuran kurang dari 768px, THE Node_Wizard SHALL ditampilkan sebagai full-screen modal (100% viewport width dan height dengan safe area padding) dengan navigasi step menggunakan horizontal swipe gesture atau tombol Next/Back di bagian bawah layar, dan WHEN pengguna menekan tombol hardware back atau mengetuk tombol close, THE Node_Wizard SHALL menampilkan dialog konfirmasi sebelum menutup jika terdapat perubahan yang belum disimpan
6. THE Dashboard_System SHALL memastikan kontras warna minimum 4.5:1 pada semua teks dan 3:1 pada semua elemen grafis sesuai WCAG 2.1 AA
7. WHEN Tree_View card dibuka atau ditutup pada mobile, THE Dashboard_System SHALL memindahkan focus ke elemen pertama dalam card yang terbuka (saat dibuka) atau kembali ke baris node pemicu (saat ditutup) dalam waktu maksimum 100ms setelah animasi selesai

### Requirement 9: Persistence dan Data Model Update

**User Story:** Sebagai sistem, saya perlu menyimpan konfigurasi komponen node yang diperluas (kamera, ESP32, deteksi) secara persisten, sehingga tree view dapat menampilkan data aktual.

#### Acceptance Criteria

1. THE Dashboard_System SHALL memperluas schema node di db.json untuk menyertakan objek "camera" (url: string max 512 karakter, resolution: string format "WxH" contoh "1280x720", protocol: salah satu dari "rtsp" | "http" | "local"), "esp32" (mqttTopic: string max 128 karakter, mqttBroker: string max 256 karakter, enabled: boolean), dan "detection" (mode: salah satu dari "realtime" | "scheduled" | "disabled", confidenceThreshold: number antara 0.1 sampai 1.0)
2. WHEN node disimpan melalui Node_Wizard, THE Dashboard_System SHALL menyimpan seluruh objek node termasuk nested objects camera, esp32, dan detection ke db.json melalui API endpoint PUT /api/nodes/[id], dan tetap mempertahankan field-level flat fields (id, sektorId, sektorName, picName, picPhone, cameraSource, enabled) agar ServiceAPDBackend.py yang membaca db.json langsung tetap berfungsi tanpa modifikasi
3. WHEN node lama yang hanya memiliki field "cameraSource" tanpa objek nested pertama kali di-load oleh tree view, THE Dashboard_System SHALL melakukan migrasi otomatis dengan membuat objek "camera" (url diisi dari nilai cameraSource, resolution default "640x480", protocol default "rtsp" jika url mengandung "rtsp://" atau "local" jika berupa angka), objek "esp32" (mqttTopic default kosong, mqttBroker default kosong, enabled default false), dan objek "detection" (mode default "realtime", confidenceThreshold default 0.5)
4. IF penulisan ke db.json gagal, THEN THE Dashboard_System SHALL menampilkan toast notification error selama 5 detik dan mempertahankan data node sebelumnya di memori tanpa mengubah UI state tree view
5. THE Dashboard_System SHALL menyediakan endpoint GET /api/nodes/[id]/status yang mengembalikan status komponen node dalam waktu response maksimal 3 detik, dengan camera status "online" jika stream URL dapat dijangkau (TCP connection berhasil) atau "offline" jika tidak, dan ESP32 status "connected" jika MQTT client menerima message dari topic terkait dalam 30 detik terakhir atau "disconnected" jika tidak

### Requirement 10: Connection Test API

**User Story:** Sebagai operator, saya ingin memverifikasi bahwa kamera dan ESP32 benar-benar terkoneksi sebelum menyimpan konfigurasi, sehingga saya tidak menyimpan konfigurasi yang salah.

#### Acceptance Criteria

1. THE Dashboard_System SHALL menyediakan endpoint POST /api/nodes/test-connection yang menerima parameter type ("camera" atau "mqtt") beserta konfigurasi terkait: untuk type "camera" field wajib adalah url (string RTSP URL); untuk type "mqtt" field wajib adalah broker (string host), port (integer), username (string), dan password (string)
2. WHEN type adalah "camera", THE Dashboard_System SHALL mencoba membuka koneksi ke URL RTSP menggunakan probe dan mengembalikan status (reachable/unreachable) beserta metadata resolution jika probe berhasil mendapatkan informasi stream
3. WHEN type adalah "mqtt", THE Dashboard_System SHALL mencoba koneksi ke MQTT broker yang dikonfigurasi dan mengembalikan status (connected/failed) beserta latency koneksi dalam satuan milidetik
4. IF Connection_Test membutuhkan waktu lebih dari 10 detik, THEN THE Dashboard_System SHALL mengembalikan response timeout dengan status "timeout" dan pesan error yang mengindikasikan koneksi melebihi batas waktu
5. IF parameter type bukan "camera" atau "mqtt" ATAU field wajib untuk type yang dipilih tidak tersedia, THEN THE Dashboard_System SHALL mengembalikan response error dengan indikasi parameter mana yang tidak valid atau tidak lengkap
6. THE Node_Wizard SHALL menampilkan tombol "Test Koneksi" di langkah 2 (Kamera) dan langkah 3 (ESP32) sebagai aksi opsional yang tidak memblokir navigasi ke langkah berikutnya, sehingga operator dapat melanjutkan tanpa menjalankan test
7. WHEN operator mengklik tombol "Test Koneksi" di Node_Wizard, THE Dashboard_System SHALL menampilkan indikator loading selama request berlangsung dan menampilkan hasil test (berhasil atau gagal beserta pesan error) secara inline di bawah tombol dalam waktu maksimal 10 detik
