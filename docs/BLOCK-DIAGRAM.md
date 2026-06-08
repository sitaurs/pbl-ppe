# Block Diagram — SafeGuard APD

Diagram berformat Mermaid: kode di bawah dapat di-render langsung di GitHub, di VS Code (extension *Markdown Preview Mermaid Support*), atau di [mermaid.live](https://mermaid.live).

> **Catatan teknis:** Mermaid tidak punya panah "1 garis 2 pucuk" secara native. Kami pakai dua pendekatan:
> 1. Untuk **flowchart**: pakai sintaks `<-->` (Mermaid render dengan kepala panah di kedua ujung) atau pakai **2 panah arah berlawanan** dengan label `req` dan `resp`.
> 2. Untuk **sequence diagram**: panah dua arah otomatis tergambar karena tiap baris sudah eksplisit arahnya.

---

## 1. Diagram Generik (Input → Processing → Output)

Tampilan high-level untuk presentasi awal. SQLite tidak masuk OUTPUT — itu **storage internal** (fase processing). Cloudflare Tunnel masuk OUTPUT karena posisinya di antara user internet dan dashboard.

```mermaid
%%{init: {
  'theme': 'base',
  'themeVariables': {
    'background': '#ffffff',
    'primaryColor': '#ffffff',
    'primaryTextColor': '#000000',
    'primaryBorderColor': '#000000',
    'lineColor': '#000000',
    'secondaryColor': '#ffffff',
    'tertiaryColor': '#ffffff',
    'clusterBkg': '#ffffff',
    'clusterBorder': '#000000',
    'fontFamily': 'Inter, Arial, sans-serif',
    'fontSize': '14px'
  },
  'flowchart': { 'curve': 'linear', 'htmlLabels': true, 'padding': 12 }
}}%%
flowchart LR

    subgraph INPUT["INPUT"]
        IN1["IP Camera<br/>(stream RTSP)"]
        IN2["Sensor Gas MQ-135<br/>(ADC ESP32)"]
        IN3["User Browser<br/>(login + monitoring)"]
        IN4["Tombol BOOT ESP32<br/>(test alarm lokal)"]
    end

    subgraph PROCESSING["PROCESSING"]
        P1["Backend Python<br/>YOLOv8 + MQTT Publisher"]
        P2["Web Dashboard Next.js<br/>RBAC + 2FA + Audit Log"]
        P3["ESP32 Firmware<br/>AES-Decrypt + Audio I2S"]
        P4[("SQLite Database<br/>(internal storage)")]
    end

    subgraph OUTPUT["OUTPUT"]
        O1["Alarm Speaker<br/>(MAX98357A)"]
        O2["LED Indikator<br/>(merah / status)"]
        O3["WhatsApp PIC<br/>(via GoWA)"]
        O4["Live Dashboard<br/>(real-time pelanggaran)"]
        O5["Cloudflare Tunnel<br/>(HTTPS public access)"]
    end

    %% Input -> Processing
    IN1 --> P1
    IN2 --> P3
    IN3 --> O5
    IN4 --> P3

    %% Processing internal: Python <-> Dashboard (bidirectional)
    P1 -->|fetch nodes / lapor pelanggaran| P2
    P2 -->|daftar node + 200 OK| P1

    %% Dashboard <-> Database (bidirectional read/write)
    P2 <--> P4

    %% Python <-> ESP32 (publish alarm + telemetri gas via MQTT)
    P1 -->|publish alarm AES| P3
    P3 -->|publish telemetri gas| P1

    %% Processing -> Output
    P1 --> O3
    P3 --> O1
    P3 --> O2
    P2 --> O4
    P2 --> O5
    O5 --> P2

    classDef whiteBox fill:#ffffff,stroke:#000000,stroke-width:2px,color:#000000;
    class IN1,IN2,IN3,IN4,P1,P2,P3,P4,O1,O2,O3,O4,O5 whiteBox;

    style INPUT fill:#000000,stroke:#000000,color:#ffffff
    style PROCESSING fill:#000000,stroke:#000000,color:#ffffff
    style OUTPUT fill:#000000,stroke:#000000,color:#ffffff

    linkStyle default stroke:#000000,stroke-width:1.5px;
```

**Cara baca:**
- 3 cluster hitam = 3 fase aliran data (kiri ke kanan).
- Kotak putih = komponen sistem.
- Cylinder `[(...)]` = penyimpanan data (database) — di **PROCESSING**, bukan OUTPUT.
- Panah satu arah = data path satu arah.
- Panah dua arah (`<-->`) atau **dua panah berlawanan dengan label `req`/`resp`** = komunikasi bolak-balik.

---

## 2. Diagram Detail (Per Komponen + 4 Layer)

Tampilan untuk presentasi mendalam. Tunjukkan teknologi yang dipakai, protokol komunikasi, dan koneksi antar komponen.

```mermaid
%%{init: {
  'theme': 'base',
  'themeVariables': {
    'background': '#ffffff',
    'primaryColor': '#ffffff',
    'primaryTextColor': '#000000',
    'primaryBorderColor': '#000000',
    'lineColor': '#000000',
    'secondaryColor': '#ffffff',
    'tertiaryColor': '#ffffff',
    'clusterBkg': '#ffffff',
    'clusterBorder': '#000000',
    'fontFamily': 'Inter, Arial, sans-serif',
    'fontSize': '13px'
  },
  'flowchart': { 'curve': 'linear', 'htmlLabels': true, 'padding': 14 }
}}%%
flowchart TB

    subgraph LAYER1["LAYER 1 — INPUT FISIK"]
        direction LR
        CAM["IP Camera<br/>RTSP Stream"]
        ESP["ESP32 + MQ-135<br/>(Sensor Gas)"]
        BTN["Tombol BOOT<br/>(test alarm lokal)"]
        USR["Pengguna Browser<br/>(HP / Laptop)"]
    end

    subgraph LAYER2["LAYER 2 — APLIKASI SERVER"]
        direction TB
        PY["Backend Python<br/>ServiceAPDBackend.py<br/>YOLOv8 Person + PPE<br/>WebSocket :8765"]
        NX["Next.js Dashboard :3000<br/>RBAC + Argon2id<br/>2FA TOTP + CSRF<br/>Service Token Auth"]
        DB[("SQLite Database<br/>via Prisma ORM<br/>Audit Log Append-Only")]
    end

    subgraph LAYER3["LAYER 3 — KOMUNIKASI TERENKRIPSI"]
        direction LR
        MQTT["HiveMQ Cloud Broker<br/>MQTT TLS :8883<br/>+ payload AES-128-CBC"]
        WA["GoWA Gateway<br/>WhatsApp HTTP POST"]
        CF["Cloudflare Tunnel<br/>HTTPS edge (no port forward)<br/>Anti-DDoS + WAF"]
    end

    subgraph LAYER4["LAYER 4 — OUTPUT FISIK"]
        direction LR
        ALARM["Speaker MAX98357A<br/>via I2S audio"]
        LED["LED Merah<br/>(indikator alert)"]
        WAUSER["PIC Sektor<br/>(WhatsApp)"]
    end

    %% Input -> Server (LAYER1 -> LAYER2/LAYER3)
    CAM -->|RTSP H.264| PY
    BTN -.->|GPIO interrupt lokal| ESP
    USR -->|HTTPS request| CF

    %% Cloudflare <-> Dashboard (bidirectional)
    CF -->|forward HTTPS| NX
    NX -->|response| CF

    %% Python <-> Dashboard (bidirectional, loopback HTTP + Service Token)
    PY -->|GET nodes / POST violations| NX
    NX -->|JSON response| PY

    %% Dashboard <-> Database (bidirectional read/write)
    NX <-->|Prisma query| DB

    %% Python -> MQTT -> ESP32 (alarm publish)
    PY -->|publish AES alarm<br/>apd/alarm/nodeId| MQTT
    MQTT -->|deliver to subscriber| ESP

    %% ESP32 -> MQTT -> Python (telemetri gas)
    ESP -->|publish AES telemetri<br/>apd/telemetry/gas/nodeId| MQTT
    MQTT -->|deliver to subscriber| PY

    %% Python -> WhatsApp
    PY -->|HTTP POST + foto| WA
    WA -->|kirim pesan| WAUSER

    %% ESP32 -> Output fisik
    ESP -->|I2S audio| ALARM
    ESP -->|GPIO 13| LED

    %% Style
    classDef whiteBox fill:#ffffff,stroke:#000000,stroke-width:2px,color:#000000;
    class CAM,ESP,BTN,USR,PY,NX,MQTT,WA,CF,ALARM,LED,WAUSER whiteBox;
    class DB whiteBox;

    style LAYER1 fill:#000000,stroke:#000000,color:#ffffff
    style LAYER2 fill:#000000,stroke:#000000,color:#ffffff
    style LAYER3 fill:#000000,stroke:#000000,color:#ffffff
    style LAYER4 fill:#000000,stroke:#000000,color:#ffffff

    linkStyle default stroke:#000000,stroke-width:1.5px;
```

**Cara baca:**
- 4 layer hitam = arsitektur 4 lapis dari atas (input fisik) ke bawah (output fisik).
- Komunikasi **bolak-balik** (req/resp) digambarkan dengan **dua panah berlawanan** atau notasi `<-->` (yang Mermaid render dengan kepala panah di kedua ujung).
- Panah putus-putus (`-.->`) = trigger event lokal, bukan data path utama (misal tombol fisik BOOT).
- Cylinder `[(SQLite Database)]` = database internal, hanya diakses oleh Next.js melalui Prisma (read + write bolak-balik).

### Catatan Posisi Komponen

| Komponen | Layer | Alasan |
|---|---|---|
| **SQLite** | Layer 2 (Aplikasi Server) | Storage internal Next.js. Read + write. Tidak pernah diakses langsung dari user / device IoT. |
| **Cloudflare Tunnel** | Layer 3 (Komunikasi) | Bridge antara user internet ↔ dashboard di laptop. Bidirectional. |
| **MQTT Broker** | Layer 3 (Komunikasi) | Bridge antara Python ↔ ESP32. Bidirectional (publish + subscribe oleh kedua sisi). |
| **WhatsApp Gateway** | Layer 3 (Komunikasi) | Satu arah: Python → GoWA → user. Tidak ada response data balik ke Python. |
| **Speaker, LED** | Layer 4 (Output Fisik) | Hanya output, tidak punya feedback loop ke ESP32. |

---

## 3. Diagram Aliran Pelanggaran APD (Sequence)

Skenario: deteksi pelanggaran helm/rompi → alarm + WA + audit log.

```mermaid
%%{init: {
  'theme': 'base',
  'themeVariables': {
    'background': '#ffffff',
    'primaryColor': '#ffffff',
    'primaryTextColor': '#000000',
    'primaryBorderColor': '#000000',
    'lineColor': '#000000',
    'actorBkg': '#ffffff',
    'actorBorder': '#000000',
    'actorTextColor': '#000000',
    'signalColor': '#000000',
    'signalTextColor': '#000000',
    'labelBoxBkgColor': '#ffffff',
    'labelBoxBorderColor': '#000000',
    'labelTextColor': '#000000',
    'noteBkgColor': '#ffffff',
    'noteBorderColor': '#000000',
    'noteTextColor': '#000000',
    'fontFamily': 'Inter, Arial, sans-serif'
  }
}}%%
sequenceDiagram
    autonumber
    participant CAM as IP Camera
    participant PY as Backend Python
    participant NX as Next.js Dashboard
    participant DB as SQLite
    participant MQTT as HiveMQ Cloud
    participant ESP as ESP32 + Speaker
    participant WA as GoWA
    participant PIC as PIC Sektor (HP)

    CAM->>PY: RTSP frame video
    PY->>PY: YOLOv8 inference<br/>(person + PPE detection)
    Note over PY: violation = orang tanpa<br/>helm atau rompi
    PY->>PY: encrypt JSON payload<br/>AES-128-CBC + random IV
    PY->>MQTT: publish apd/alarm/{nodeId}<br/>(TLS 8883)
    PY->>NX: POST /api/violations<br/>(Bearer Service Token)
    NX->>DB: insert Violation row<br/>+ append AuditLog
    DB-->>NX: row id
    NX-->>PY: 201 Created
    MQTT->>ESP: deliver encrypted message
    ESP->>ESP: AES-decrypt + validate<br/>nodeId + timestamp
    ESP->>ESP: play audio "gunakan APD lengkap"<br/>via I2S MAX98357A
    PY->>WA: HTTP POST + foto pelanggaran
    WA->>PIC: kirim pesan WhatsApp
```

**Cara baca:**
- Setiap kolom = satu komponen.
- Panah solid `->>` = pesan request.
- Panah dashed `-->>` = response.
- Note kotak = catatan logika internal yang penting.
- Nomor di kiri = urutan kejadian (autonumber).

---

## 4. Diagram Alur Gas Alert (Sequence)

Skenario terpisah karena flow gas berbeda dengan APD violation: **trigger dari sensor fisik di ESP32**, bukan dari kamera.

```mermaid
%%{init: {
  'theme': 'base',
  'themeVariables': {
    'background': '#ffffff',
    'primaryColor': '#ffffff',
    'primaryTextColor': '#000000',
    'primaryBorderColor': '#000000',
    'lineColor': '#000000',
    'actorBkg': '#ffffff',
    'actorBorder': '#000000',
    'actorTextColor': '#000000',
    'signalColor': '#000000',
    'signalTextColor': '#000000',
    'labelBoxBkgColor': '#ffffff',
    'labelBoxBorderColor': '#000000',
    'labelTextColor': '#000000',
    'noteBkgColor': '#ffffff',
    'noteBorderColor': '#000000',
    'noteTextColor': '#000000',
    'fontFamily': 'Inter, Arial, sans-serif'
  }
}}%%
sequenceDiagram
    autonumber
    participant MQ as Sensor MQ-135
    participant ESP as ESP32
    participant MQTT as HiveMQ Cloud
    participant PY as Backend Python
    participant NX as Next.js Dashboard
    participant DB as SQLite
    participant WA as GoWA
    participant PIC as PIC Sektor (HP)

    loop Setiap 2 detik
        MQ->>ESP: ADC read (raw 0..4095)
        ESP->>ESP: moving average 5 sample
    end
    Note over ESP: alert = avg > GAS_THRESHOLD<br/>(default 2200)
    ESP->>ESP: nyalakan LED merah +<br/>play alarm gas (sekali)
    ESP->>ESP: encrypt telemetri<br/>AES-128-CBC + random IV
    ESP->>MQTT: publish apd/telemetry/gas/{nodeId}
    MQTT->>PY: deliver telemetri
    PY->>PY: decrypt + parse JSON
    PY->>NX: POST /api/telemetry/gas
    NX->>DB: insert GasTelemetry row
    DB-->>NX: row id
    NX-->>PY: 201 Created
    Note over PY: kalau alert sustained > 30 detik<br/>+ cooldown WA selesai (10 menit)
    PY->>WA: HTTP POST pesan gas alert
    WA->>PIC: kirim WhatsApp peringatan gas
```

---

## 5. Cara Render

| Cara | Detail |
|---|---|
| GitHub native | Buka file `.md` di [github.com/sitaurs/pbl-ppe](https://github.com/sitaurs/pbl-ppe), Mermaid otomatis render |
| VS Code preview | Pasang ekstensi *Markdown Preview Mermaid Support*, lalu `Ctrl+Shift+V` |
| Online editor | Copy code mermaid ke [mermaid.live](https://mermaid.live), bisa export PNG/SVG untuk slide presentasi |

## Convention Warna & Bentuk

| Element | Tampilan | Arti |
|---|---|---|
| Cluster `subgraph` | Hitam dengan teks putih | Layer/fase arsitektur |
| `[Box]` | Putih dengan border hitam | Komponen sistem |
| `[(Cylinder)]` | Putih, simbol database | Penyimpanan data |
| `-->`  panah solid | Hitam tegas | Aliran data satu arah |
| `<-->` atau pasangan `-->` `<--` | Hitam, dua arah | Komunikasi request/response |
| `-.->`  panah putus-putus | Hitam | Event/trigger lokal (bukan data path utama) |

Simpel, hitam-putih, formal, mudah dibaca saat dicetak hitam-putih maupun di proyektor.
