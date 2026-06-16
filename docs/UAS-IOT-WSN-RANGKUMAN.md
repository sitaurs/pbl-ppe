# Rangkuman UAS — IoT & WSN

Catatan belajar terstruktur untuk UAS Workshop IoT dan WSN. Empat soal: 2 WSN, 2 IoT. Materi disusun supaya bisa langsung dijawab dengan dukungan contoh nyata dari project SafeGuard APD.

> **Tips ujian:** untuk setiap konsep teori, selalu siapkan satu contoh konkret dari project. Dosen suka jawaban yang mengaitkan teori ke implementasi.

---

## Bagian 1 — Pondasi Cepat (Definisi Operasional)

### IoT (Internet of Things)
Jaringan perangkat fisik berkemampuan komputasi yang **terhubung ke internet**, mampu **mengumpulkan, mengirim, dan menerima data**, serta sering kali **bisa dikendalikan dari jarak jauh**.

Ciri kunci:
- Terhubung ke internet (langsung maupun lewat gateway)
- Punya identitas unik (alamat MAC, ID node, token)
- Bisa berinteraksi dengan dunia fisik (sensor untuk input, aktuator untuk output)
- Biasanya bagian dari sistem yang lebih besar (cloud, dashboard, aplikasi)

### WSN (Wireless Sensor Network)
Sekumpulan **node sensor** yang tersebar secara geografis dan saling terhubung **secara nirkabel** untuk **memantau kondisi fisik atau lingkungan** (suhu, gas, getaran, dll), kemudian mengirim data ke satu titik pengumpul (sink/gateway).

Ciri kunci:
- Node terdiri dari sensor + mikrokontroler + radio + sumber daya
- Komunikasi wireless (WiFi, ZigBee, LoRa, BLE, dll)
- Distribusi spasial: banyak node tersebar
- Berorientasi data (data-centric), bukan host-centric
- Sering kali resource-constrained: hemat energi, hemat memori, hemat bandwidth

### Hubungan IoT ↔ WSN
WSN adalah **subset** atau **fondasi** dari IoT. Banyak sistem IoT modern dibangun di atas WSN: sensor mengumpulkan data, gateway meneruskan ke cloud, lalu aplikasi mengonsumsinya. Tidak semua WSN harus terhubung internet (misal WSN industri tertutup), tapi setiap kali WSN diberi konektivitas internet, ia menjadi sistem IoT.

| Aspek | WSN | IoT |
|---|---|---|
| Fokus utama | Sensing & monitoring | Konektivitas & kontrol jarak jauh |
| Skala | Local cluster | Local + cloud + global |
| Data flow | Sensor → sink | Sensor → cloud → user / aktuator |
| Konektivitas | Wireless antar node | Internet end-to-end |
| Contoh klasik | Monitoring suhu hutan | Smart home, smart city |

---

## Bagian 2 — Arsitektur IoT (Materi Utama Soal IoT)

### 2.1 Tiga Lapisan Arsitektur IoT (Versi Klasik)

Model paling umum yang sering ditanyakan:

```
┌──────────────────────────────────────────────┐
│  APPLICATION LAYER                           │
│  Dashboard, analitik, notifikasi, kontrol    │
├──────────────────────────────────────────────┤
│  NETWORK LAYER                               │
│  Internet, gateway, broker, protokol         │
├──────────────────────────────────────────────┤
│  PERCEPTION / DEVICE LAYER                   │
│  Sensor, aktuator, mikrokontroler            │
└──────────────────────────────────────────────┘
```

**Perception Layer (Lapisan Persepsi)**
- Tugas: menangkap data dari dunia fisik dan mengeksekusi aksi fisik.
- Komponen: sensor (input), aktuator (output), MCU (mikrokontroler).
- Contoh di project: ESP32 + MQ-135 (sensor gas), speaker MAX98357A (aktuator audio), IP Camera (sensor visual).

**Network Layer (Lapisan Jaringan)**
- Tugas: mentransmisikan data antara device dan server, melakukan routing, dan menjamin keandalan.
- Komponen: WiFi/4G/5G/LoRa, gateway, broker, protokol komunikasi (MQTT, HTTP, CoAP).
- Contoh di project: WiFi 802.11n, broker MQTT HiveMQ Cloud (TLS port 8883), Cloudflare Tunnel untuk akses internet ke dashboard.

**Application Layer (Lapisan Aplikasi)**
- Tugas: menyajikan data ke pengguna, melakukan analitik, mengeluarkan keputusan, dan mengirim perintah ke device.
- Komponen: dashboard web, mobile app, sistem notifikasi, mesin AI/ML, basis data.
- Contoh di project: Next.js Dashboard, deteksi YOLOv8, notifikasi WhatsApp via GoWA, SQLite sebagai storage.

### 2.2 Lima Lapisan Arsitektur IoT (Versi Diperluas)

Versi yang lebih detail, sering dipakai di literatur akademik modern:

```
┌──────────────────────────────────────────────┐
│  5. BUSINESS LAYER                           │
│     Model bisnis, regulasi, ROI              │
├──────────────────────────────────────────────┤
│  4. APPLICATION LAYER                        │
│     Dashboard, end-user app                  │
├──────────────────────────────────────────────┤
│  3. PROCESSING / MIDDLEWARE LAYER            │
│     Cloud computing, AI/ML, database         │
├──────────────────────────────────────────────┤
│  2. NETWORK / TRANSPORT LAYER                │
│     Gateway, protokol, broker                │
├──────────────────────────────────────────────┤
│  1. PERCEPTION LAYER                         │
│     Sensor, aktuator                         │
└──────────────────────────────────────────────┘
```

Tambahan dua lapisan dibanding versi 3-layer:
- **Processing Layer**: tempat data di-aggregate, dianalisis (AI/ML), dan disimpan. Di project: backend Python YOLOv8 + SQLite.
- **Business Layer**: aspek non-teknis (regulasi K3, kebijakan APD, audit). Di project: kebijakan bahwa pelanggaran APD wajib dicatat dan ada PIC yang menerima notifikasi.

### 2.3 Block Diagram Arsitektur IoT — Generik

Block diagram standar untuk pertanyaan "buat block diagram arsitektur IoT":

```
   ┌─────────┐    ┌──────────┐    ┌─────────┐    ┌──────────┐
   │ SENSOR  │ -> │ GATEWAY  │ -> │  CLOUD  │ -> │   USER   │
   │ NODE    │    │ (LOCAL)  │    │ SERVER  │    │ (APP/WEB)│
   └─────────┘    └──────────┘    └─────────┘    └──────────┘
        │              │              │               │
        │              │              │               │
   Akuisisi      Forwarding    Storage +         Visualisasi
   data fisik    data sensor   analytics +       + interaksi
                               decision          user
```

Empat blok utama:
1. **Sensor Node**: ESP32 + MQ-135 (di project)
2. **Gateway**: laptop/PC yang menjalankan backend Python (juga merangkap sebagai bridge ke broker MQTT)
3. **Cloud Server**: HiveMQ Cloud (broker), VPS audio, GoWA gateway
4. **User Interface**: dashboard Next.js, WhatsApp di HP PIC

### 2.4 Block Diagram Arsitektur IoT — SafeGuard APD

Block diagram spesifik project (versi sederhana yang bisa digambar di kertas ujian):

```
┌──────────────┐      ┌──────────────────┐      ┌──────────────┐
│   SENSOR     │      │   PROCESSING     │      │   ACTUATOR   │
│   LAYER      │      │   LAYER          │      │   LAYER      │
│              │      │                  │      │              │
│ IP Camera ───┼─────>│ Backend Python   │      │              │
│ (RTSP)       │      │ + YOLOv8         │      │              │
│              │      │                  │      │              │
│ MQ-135 ──────┼─┐    │ Next.js Dashboard│<─────┤ User Browser │
│ (gas)        │ │    │ + SQLite + RBAC  │      │              │
│              │ │    │                  │      │              │
└──────────────┘ │    └──────┬───────────┘      │ Speaker      │
                 │           │                  │ (MAX98357A)  │
                 │           │ MQTT             │              │
                 │           │ (HiveMQ TLS)     │ LED merah    │
                 │           │                  │              │
                 │           ▼                  │ WhatsApp PIC │
                 └──────> ESP32 ────────────────┤ (via GoWA)   │
                          (MCU)                 │              │
                                                └──────────────┘
```

Tiga layer perception – processing – actuator yang dihubungkan oleh dua channel utama: **HTTP/RTSP** (kamera ke server) dan **MQTT** (server ke ESP32 dan sebaliknya).

---

## Bagian 3 — Arsitektur WSN (Materi Utama Soal WSN)

### 3.1 Komponen Sebuah Sensor Node

Setiap node WSN minimal terdiri dari empat subsistem:

```
┌─────────────────────────────────────────────────┐
│             SENSOR NODE                         │
│                                                 │
│   ┌────────┐   ┌──────────┐   ┌─────────┐       │
│   │ SENSING│   │PROCESSING│   │ COMMUNI │       │
│   │  UNIT  │──>│   UNIT   │<─>│ -CATION │       │
│   │        │   │  (MCU)   │   │  UNIT   │       │
│   └────────┘   └──────────┘   └─────────┘       │
│        ▲             ▲             ▲            │
│        │             │             │            │
│   ┌────┴─────────────┴─────────────┴────┐       │
│   │         POWER UNIT (Baterai)         │       │
│   └──────────────────────────────────────┘      │
└─────────────────────────────────────────────────┘
```

| Subsistem | Fungsi | Contoh di project |
|---|---|---|
| Sensing Unit | Akuisisi sinyal fisik, ADC | MQ-135 + ADC ESP32 (GPIO34) |
| Processing Unit | Komputasi, kontrol, agregasi | ESP32 dual-core 240MHz |
| Communication Unit | Transmisi nirkabel | WiFi 802.11n bawaan ESP32 |
| Power Unit | Catu daya, manajemen energi | Adaptor 5V (idealnya baterai untuk WSN murni) |

### 3.2 Topologi WSN

Tiga topologi paling umum dalam soal:

**Star Topology**
```
        Node
         │
    Node─┼─Node
         │
        SINK
         │
    Node─┼─Node
         │
        Node
```
- Semua node komunikasi langsung dengan sink/gateway pusat.
- Sederhana, mudah debug.
- Kelemahan: jangkauan terbatas, sink jadi single point of failure.
- **Project SafeGuard APD memakai topologi ini**: setiap ESP32 langsung ke broker MQTT (sink).

**Mesh Topology**
```
   Node ─── Node ─── Node
    │  ╲    │   ╲    │
    │   ╲   │    ╲   │
   Node ─── Node ─── Node
```
- Setiap node bisa jadi router untuk node lain (multi-hop).
- Jangkauan luas, redundan.
- Kompleks routing, lebih boros energi.
- Contoh: ZigBee mesh, Thread.

**Tree / Cluster Tree Topology**
```
              SINK
             ╱   ╲
        Node      Node (cluster head)
        ╱  ╲      ╱  ╲
     Node Node Node Node
```
- Hierarki cluster, ada cluster head per kelompok.
- Cluster head agregasi data sebelum kirim ke sink (hemat bandwidth).
- Cocok untuk WSN besar (ratusan node).

### 3.3 Block Diagram Arsitektur WSN

Block diagram standar yang sering ditanyakan untuk soal "gambarkan arsitektur WSN":

```
[Sensor Node 1]  [Sensor Node 2]  [Sensor Node 3]  ... [Sensor Node N]
      │                │                │                    │
      └────────────────┴────────────────┴────────────────────┘
                              │
                              │ (wireless: WiFi/ZigBee/LoRa/BLE)
                              ▼
                      ┌───────────────┐
                      │  SINK NODE /  │
                      │   GATEWAY     │
                      └───────┬───────┘
                              │
                              │ (internet: TCP/IP, MQTT, HTTP)
                              ▼
                      ┌───────────────┐
                      │   SERVER /    │
                      │   CLOUD       │
                      └───────┬───────┘
                              │
                              ▼
                      ┌───────────────┐
                      │  USER /       │
                      │  APPLICATION  │
                      └───────────────┘
```

Empat tahap aliran data: **acquisition → aggregation → transmission → application**.

### 3.4 Pemetaan WSN ke SafeGuard APD

Project ini bisa dibilang **WSN multi-sensor** karena setiap sektor punya sensor sendiri:

```
[Sektor A]                [Sektor B]                [Sektor C]
ESP32+MQ-135              ESP32+MQ-135              ESP32+MQ-135
     │                         │                         │
     │ WiFi 802.11n             │ WiFi 802.11n             │ WiFi 802.11n
     │                         │                         │
     └─────────────┬───────────┴─────────────┬───────────┘
                   │                         │
                   │      MQTT TLS 8883       │
                   ▼                         ▼
            ┌─────────────────────────────────────┐
            │  HiveMQ Cloud Broker (sebagai sink) │
            └──────────────────┬──────────────────┘
                               │
                               │ Subscribe
                               ▼
                  ┌─────────────────────────┐
                  │  Backend Python         │
                  │  (sink+gateway+server)  │
                  └──────────┬──────────────┘
                             │
                             ▼
                  ┌─────────────────────────┐
                  │  Next.js Dashboard +    │
                  │  PIC via WhatsApp       │
                  └─────────────────────────┘
```

Kalau dosen tanya: "ini WSN murni atau IoT?" jawab: **hibrida**. Lapisan node-ke-broker adalah WSN (sensor terdistribusi, wireless, sink terpusat). Begitu data masuk ke backend dan dikirim ke dashboard/WhatsApp, sistem berubah jadi IoT lengkap (cloud, mobile, end-user app).

---

## Bagian 4 — Konsep Penting WSN (Sering Keluar di Soal)

### 4.1 Karakteristik WSN

Lima karakteristik yang biasa diminta disebutkan:

1. **Resource-constrained**: node punya CPU lemah, RAM kecil, baterai terbatas.
2. **Self-organizing**: node bisa membentuk jaringan otomatis, tanpa konfigurasi manual.
3. **Data-centric**: query berbasis data ("temperatur berapa?"), bukan alamat node.
4. **Application-specific**: arsitektur disesuaikan dengan use case (monitoring industri, lingkungan, dll).
5. **Dynamic topology**: node bisa mati/hidup, posisi bisa berubah, jaringan harus adaptif.

### 4.2 Protokol Komunikasi WSN/IoT

| Protokol | Layer | Kegunaan | Contoh use case |
|---|---|---|---|
| WiFi (802.11) | Link | Bandwidth tinggi, jangkauan menengah | Indoor IoT (project ini) |
| ZigBee | Link/Network | Low power mesh, IEEE 802.15.4 | Smart home, WSN industri |
| LoRa / LoRaWAN | Link | Long range, ultra low power | WSN outdoor, smart agriculture |
| BLE (Bluetooth Low Energy) | Link | Personal area, low power | Wearables, beacon |
| MQTT | Application | Pub/sub, ringan, broker-based | IoT messaging (project ini) |
| CoAP | Application | RESTful UDP-based, ringan | Constrained device |
| HTTP/HTTPS | Application | Standar web, request-response | Dashboard, API (project ini) |

### 4.3 MQTT — Detail Penting

Pasti ditanya karena kunci di project. Yang harus diingat:

- **Pub/Sub pattern**: publisher kirim ke topic, subscriber terima dari topic, broker jadi perantara.
- **Quality of Service (QoS)**: tiga level — 0 (fire and forget), 1 (at least once, ada ACK), 2 (exactly once, handshake 4-way).
- **Retained message**: pesan terakhir di topic disimpan broker, subscriber baru langsung dapat.
- **Last Will and Testament (LWT)**: pesan otomatis dipublish saat client disconnect tidak normal — bagus untuk deteksi node mati.
- **Topik wildcard**: `+` (single level) dan `#` (multi level).

Topik di project:
- `apd/alarm/{nodeId}` — server publish ke node spesifik (alarm APD)
- `apd/control` — broadcast control (stop semua alarm)
- `apd/telemetry/gas/{nodeId}` — node publish ke server (data sensor gas)
- `apd/heartbeat/{nodeId}` — heartbeat node

### 4.4 Energy Efficiency — Konsep Wajib Tahu

Energi adalah constraint utama WSN. Strategi penghematan:

- **Duty cycling**: node tidur kebanyakan waktu, bangun sebentar untuk sensing/transmit.
- **Data aggregation**: cluster head gabungkan data dari child sebelum forward.
- **Adaptive sampling rate**: turunkan frekuensi sampling kalau data stabil.
- **Compression / encoding**: kurangi byte yang dikirim.
- **Routing protocol energy-aware**: pilih jalur yang hemat energi (LEACH, PEGASIS).

Kelemahan project SafeGuard APD untuk WSN murni: ESP32 di-power dari adaptor 5V, jadi tidak perlu hemat energi. Kalau pakai baterai, perlu deep sleep antar sampling.

---

## Bagian 5 — Tantangan WSN (Sering Jadi Soal Esai)

Hafalkan minimal lima tantangan utama. Ini tipikal pertanyaan soal: **"Sebutkan dan jelaskan tantangan dalam pengembangan WSN, kaitkan dengan project Anda."**

### 5.1 Energi Terbatas

- Node sering pakai baterai, sulit di-charge ulang (apalagi outdoor).
- Komunikasi wireless paling boros: transmisi 1 byte ≈ eksekusi ribuan instruksi CPU.
- Solusi: duty cycling, energy harvesting (solar, vibrasi), low-power radio.
- **Project**: dimitigasi dengan adaptor 5V, tetapi trade-off: tidak portabel, butuh stop kontak per sektor.

### 5.2 Bandwidth dan Latensi

- Bandwidth wireless terbatas (WiFi paling tinggi, ZigBee/LoRa rendah).
- Banyak node simultan kirim data → kongesti.
- Solusi: kompresi data, agregasi di cluster head, kontrol QoS.
- **Project**: payload telemetri MQTT sangat ringkas (~200 byte JSON terenkripsi), HiveMQ free tier handle 100 koneksi.

### 5.3 Reliability dan Fault Tolerance

- Node bisa rusak (overheat, baterai habis, vandalisme).
- Sinyal wireless bisa terganggu (interferensi, redaman, hujan untuk LoRa).
- Solusi: redundansi node, mekanisme recovery, mesh networking, retry policy.
- **Project**: ESP32 punya auto-reconnect WiFi/MQTT dengan exponential backoff. Heartbeat 60 detik mendeteksi node offline. MQTT broker punya QoS 1 untuk delivery garansi.

### 5.4 Keamanan

- Node fisik mudah diakses penyerang (re-flash firmware, baca memori).
- Jaringan wireless gampang disadap (man-in-the-middle, replay attack).
- Resource-constrained → algoritma kripto berat sulit dijalankan.
- Solusi: enkripsi ringan (AES-128), TLS, secure boot, key rotation, replay protection (timestamp/nonce).
- **Project**: payload MQTT diaes-128-cbc enkripsi dengan IV random per pesan, broker pakai TLS 8883, ESP32 verify root CA Let's Encrypt R13, timestamp validation ±5 menit anti-replay.

### 5.5 Skalabilitas

- WSN bisa puluhan sampai ribuan node.
- Routing harus scale, broker harus scale, address space harus cukup.
- Solusi: arsitektur hierarkis (cluster), broker terdistribusi, naming scheme.
- **Project**: topik MQTT pakai `{nodeId}` di path supaya tiap node punya kanal sendiri. Tinggal tambah node baru → ID baru → topik baru, tidak perlu ubah arsitektur.

### 5.6 Heterogenitas Hardware dan Protokol

- Node bisa beda merek, beda OS, beda protokol.
- Integrasi data dari banyak vendor sulit.
- Solusi: standar terbuka (MQTT, CoAP), middleware abstraction.
- **Project**: ESP32 + IP Camera (vendor berbeda) bisa diintegrasi karena server pakai protokol standar (RTSP untuk kamera, MQTT untuk ESP32).

### 5.7 Privasi Data

- WSN sering memantau aktivitas manusia (kamera APD = data biometrik wajah).
- Tantangan: anonymization, retention policy, akses kontrol.
- Solusi: hashing data sensitif, RBAC, audit log, regulasi (GDPR, UU PDP Indonesia).
- **Project**: dashboard pakai RBAC 5 peran + 34 izin, audit log append-only, isolasi data per sektor (PIC sektor A tidak bisa lihat data sektor B).

### 5.8 Sinkronisasi Waktu

- Banyak aplikasi butuh timestamp akurat antar node (event correlation).
- Clock drift di MCU murah cukup besar.
- Solusi: NTP (kalau ada internet), PTP, beacon-based sync (TPSN, FTSP).
- **Project**: ESP32 sync NTP dari `pool.ntp.org` saat boot, dipakai untuk validasi timestamp pesan (anti-replay) dan timestamp telemetri.

### 5.9 Biaya Deployment dan Maintenance

- Pemasangan node di lokasi sulit (atap, area bahaya).
- Maintenance baterai, kalibrasi sensor.
- Solusi: OTA (Over-the-Air) firmware update, remote diagnostics.
- **Project**: audio alarm di-stream dari VPS via HTTP, jadi audio bisa diganti tanpa re-flash ESP32. Ke depan tinggal tambah OTA firmware update.

### 5.10 Lingkungan Fisik

- Suhu ekstrim, kelembapan, debu, getaran mempengaruhi sensor.
- MQ-135 misalnya sensitif kelembapan: nilai berubah saat hujan/lembap.
- Solusi: housing IP-rated, kalibrasi periodik, kompensasi suhu/RH.
- **Project**: MQ-135 butuh warm-up 2-5 menit, threshold kalibrasi empiris (2200 ADC). Production butuh kalibrasi per environment.

---

## Bagian 6 — Konsep Penting IoT (untuk 2 Soal IoT)

### 6.1 Karakteristik IoT

- **Konektivitas**: terhubung internet, addressable.
- **Identifikasi unik**: setiap device punya ID (UID, MAC, token).
- **Sensing & actuation**: bisa baca dunia fisik dan mengeluarkan aksi.
- **Embedded computing**: punya kemampuan komputasi onboard.
- **Interoperabilitas**: bisa berbicara dengan device/sistem lain via standar.
- **Skalabilitas**: dari 1 device sampai jutaan.
- **Security**: identity, authn, encryption, integrity.

### 6.2 Protokol IoT — Tabel Cepat

| Layer | Protokol | Catatan |
|---|---|---|
| Application | MQTT, CoAP, HTTP, AMQP | MQTT dan CoAP paling populer untuk IoT |
| Transport | TCP, UDP, DTLS | DTLS = TLS untuk UDP |
| Network | IPv4, IPv6, 6LoWPAN | 6LoWPAN = IPv6 di jaringan low-power |
| Link | WiFi, BLE, ZigBee, LoRa, NB-IoT | Pilih sesuai range/power |

### 6.3 Edge / Fog / Cloud Computing

Konsep modern yang sering ditanya:

```
┌──────────────────────────────────────────┐
│   CLOUD                                   │
│   Storage + analytics global              │
│   Latency: 100-500ms                      │
├──────────────────────────────────────────┤
│   FOG                                     │
│   Server lokal, gateway pintar            │
│   Latency: 10-100ms                       │
├──────────────────────────────────────────┤
│   EDGE                                    │
│   Komputasi di device (MCU/SBC)           │
│   Latency: <10ms                          │
└──────────────────────────────────────────┘
```

- **Edge**: komputasi langsung di node. Contoh project: ESP32 menjalankan AES decrypt + sensor sampling.
- **Fog**: server lokal yang melayani beberapa device. Contoh project: laptop menjalankan backend Python YOLOv8 (ini fog computing karena AI inference dilakukan secara lokal, bukan di cloud).
- **Cloud**: server jauh, scalable. Contoh project: HiveMQ Cloud (broker), VPS audio.

Trend modern: **edge computing** dipakai supaya latency rendah dan privacy lebih baik (data tidak harus keluar ke cloud).

### 6.4 Tantangan IoT

Mirip WSN tapi skala lebih luas:

1. **Keamanan dan privasi**: device IoT sering jadi target botnet (Mirai botnet 2016).
2. **Interoperabilitas**: standar masih terfragmentasi.
3. **Skalabilitas**: miliaran device, IPv4 tidak cukup → IPv6.
4. **Manajemen device**: provisioning, OTA update, monitoring.
5. **Big data**: analytics dari volume sensor sangat besar.
6. **Regulasi**: GDPR, UU PDP, sektor (kesehatan, finansial).
7. **Biaya**: hardware murah tapi infrastruktur cloud bisa mahal.
8. **Energy efficiency** (untuk device IoT pakai baterai).

---

## Bagian 7 — Studi Kasus: Project SafeGuard APD

Pakai ini sebagai contoh konkret di setiap jawaban. Format jawab: **konsep teori + bagaimana project mengimplementasikannya**.

### Ringkasan Singkat Project

SafeGuard APD adalah sistem IoT/WSN yang:
1. Mendeteksi pelanggaran APD (helm, rompi) lewat kamera + YOLOv8
2. Memantau gas berbahaya lewat sensor MQ-135 di setiap sektor
3. Membunyikan alarm via speaker ESP32 + LED
4. Mengirim notifikasi WhatsApp ke PIC sektor
5. Mencatat semua kejadian ke dashboard web dengan RBAC dan audit log

### Pemetaan ke Konsep Mata Kuliah

| Konsep | Implementasi di Project |
|---|---|
| Perception layer | IP Camera (RTSP), MQ-135 (ADC ESP32) |
| Network layer | WiFi 802.11n, MQTT TLS 8883, HTTPS via Cloudflare Tunnel |
| Application layer | Next.js Dashboard, WhatsApp via GoWA, deteksi YOLOv8 |
| Sensor node WSN | ESP32 DevKit + MQ-135 + I2S amplifier |
| Topologi | Star (semua ESP32 ke broker MQTT) |
| Protokol IoT | MQTT (pub/sub), HTTP, RTSP, WebSocket |
| QoS MQTT | QoS 1 (at-least-once) untuk alarm |
| Edge computing | ESP32 menjalankan AES decrypt + averaging gas |
| Fog computing | Laptop menjalankan YOLOv8 inference (lokal, tidak cloud) |
| Cloud | HiveMQ Cloud broker, VPS audio file |
| Energi | Adaptor 5V (bukan baterai, jadi tidak duty-cycle) |
| Reliability | Auto-reconnect WiFi/MQTT, heartbeat 60s, deteksi offline 90s |
| Keamanan | AES-128-CBC payload, TLS broker, root CA verify, NTP timestamp anti-replay |
| Sinkronisasi waktu | NTP `pool.ntp.org` saat boot ESP32 |
| Skalabilitas | Topik MQTT pakai `{nodeId}` di path, tinggal tambah ID |
| Heterogenitas | Kamera vendor berbeda + ESP32 + browser, semua via standar terbuka |

### Pertanyaan Latihan untuk Project

1. Gambarkan block diagram arsitektur SafeGuard APD dan jelaskan setiap komponennya.
2. Project Anda termasuk WSN atau IoT? Jelaskan dengan argumen.
3. Sebutkan tantangan WSN yang muncul di project ini dan solusinya.
4. Kenapa MQTT dipilih sebagai protokol komunikasi ESP32 ke server, bukan HTTP?
5. Bagaimana project menjamin keamanan komunikasi antara ESP32 dan server?
6. Topologi WSN apa yang dipakai di project? Apa kekurangannya?
7. Bagaimana sistem mendeteksi node ESP32 yang offline?

---

## Bagian 8 — Template Jawaban Soal Esai

### Template Soal "Sebutkan dan jelaskan arsitektur IoT"

**Pembukaan:** Arsitektur IoT umumnya dibagi menjadi tiga atau lima lapisan. Versi tiga lapisan paling sering dipakai untuk pemahaman dasar.

**Isi:** Sebutkan tiga lapisan (perception, network, application) + fungsi singkat + contoh komponen.

**Penutup:** Pada project SafeGuard APD, ketiga lapisan ini terimplementasi sebagai: (a) IP Camera + ESP32+MQ-135 di perception, (b) WiFi + MQTT TLS HiveMQ di network, (c) Next.js Dashboard + WhatsApp + YOLOv8 di application.

### Template Soal "Buatlah block diagram WSN"

**Pembukaan:** Sistem WSN minimal terdiri dari node sensor, sink/gateway, dan server aplikasi yang dihubungkan oleh medium nirkabel.

**Gambar block diagram (lihat bagian 3.3).**

**Penjelasan komponen per blok:**
- Sensor node: sensing + processing + comm + power
- Sink: aggregator data, gateway ke jaringan luar
- Server: storage, analytics, decision
- User: visualisasi atau aksi

**Contoh konkret:** Pemetaan ke project (lihat bagian 3.4).

### Template Soal "Jelaskan tantangan WSN"

**Pembukaan:** WSN memiliki sejumlah tantangan yang berbeda dari sistem komputasi konvensional karena karakteristik resource-constrained, distribusi spasial, dan komunikasi nirkabel.

**Isi:** Pilih 4-5 tantangan dari bagian 5 dan jelaskan masing-masing dengan format: **deskripsi tantangan → dampak → solusi umum → contoh dari project**.

**Penutup:** Tantangan-tantangan ini saling berkaitan. Misalnya, solusi untuk hemat energi (data aggregation) bisa mengorbankan reliability jika cluster head gagal. Trade-off ini yang harus dibalance per use case.

### Template Soal "Bandingkan IoT dan WSN"

**Pembukaan:** WSN dan IoT sering dianggap sama tetapi sebenarnya berbeda dalam fokus dan cakupan.

**Tabel perbandingan** (lihat bagian 1).

**Penutup:** WSN adalah subset dari IoT. Project SafeGuard APD termasuk hibrida: lapisan ESP32 ke broker MQTT adalah WSN murni, sedangkan integrasi dengan dashboard web dan WhatsApp menjadikannya sistem IoT lengkap.

---

## Bagian 9 — Cheat Sheet Akhir (Hafalkan Sebelum Ujian)

### Layer IoT 3-tier: PNA
- **P**erception → sensor, aktuator, MCU
- **N**etwork → WiFi, MQTT, gateway, broker
- **A**pplication → dashboard, app, AI, database

### Komponen Sensor Node WSN: SPCP
- **S**ensing
- **P**rocessing (MCU)
- **C**ommunication (radio)
- **P**ower (baterai)

### Tantangan WSN: 5E + 2S + R
- **E**nergi
- **E**fisiensi bandwidth
- **E**nkripsi/keamanan
- **E**nvironment (fisik)
- **E**ksplorasi privasi
- **S**inkronisasi waktu
- **S**kalabilitas
- **R**eliability/fault tolerance

### Karakteristik WSN: 5 kata
- Resource-constrained, self-organizing, data-centric, application-specific, dynamic-topology

### Topologi WSN: 3 tipe
- **Star** (project pakai ini), **Mesh**, **Tree/cluster tree**

### MQTT QoS: 3 level
- 0 = fire and forget, 1 = at least once (project pakai ini), 2 = exactly once

### Edge / Fog / Cloud
- **Edge** = di device (ESP32), **Fog** = di server lokal (laptop YOLOv8), **Cloud** = remote (HiveMQ, VPS audio)

---

## Referensi Cepat di Repo

| Dokumen | Isi |
|---|---|
| `docs/PBL-IOT-WSN.md` | Detail teknis ESP32, MQTT, MQ-135 (untuk pertanyaan implementasi) |
| `docs/BLOCK-DIAGRAM.md` | Block diagram Mermaid untuk presentasi |
| `ARSITEKTUR.md` | Pembagian tugas Next.js vs Python vs SQLite |
| `alarm_apd/alarm_apd.ino` | Source firmware ESP32 |
| `ServiceAPDBackend.py` | Source backend Python |

Selamat ujian. Kalau bingung di tengah, kembali ke Cheat Sheet di bagian 9.
