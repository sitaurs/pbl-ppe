# Block Diagram — SafeGuard APD

Dua diagram berformat Mermaid: satu generik (Input → Processing → Output) dan satu detail per komponen. Kode Mermaid di bawah ini bisa di-copy ke [mermaid.live](https://mermaid.live) atau di-render langsung di GitHub.

---

## 1. Diagram Generik (Input → Processing → Output)

Tampilan high-level untuk presentasi awal. Tunjukkan alur paling sederhana ke dosen sebelum masuk ke detail.

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
    end

    subgraph PROCESSING["PROCESSING"]
        P1["Backend Python<br/>YOLOv8 + MQTT Publisher"]
        P2["Web Dashboard Next.js<br/>RBAC + 2FA + Audit Log"]
        P3["ESP32 Firmware<br/>AES-Decrypt + Audio I2S"]
    end

    subgraph OUTPUT["OUTPUT"]
        O1["Alarm Speaker<br/>(MAX98357A)"]
        O2["LED Indikator<br/>(merah / status)"]
        O3["WhatsApp PIC<br/>(via GoWA)"]
        O4["Audit Log + Database<br/>(SQLite)"]
        O5["Live Dashboard<br/>(real-time pelanggaran)"]
    end

    IN1 --> P1
    IN2 --> P3
    IN3 --> P2

    P1 --> P2
    P1 --> P3
    P1 --> O3
    P3 --> O1
    P3 --> O2
    P2 --> O4
    P2 --> O5

    classDef inputBox fill:#ffffff,stroke:#000000,stroke-width:2px,color:#000000;
    classDef procBox  fill:#ffffff,stroke:#000000,stroke-width:2px,color:#000000;
    classDef outBox   fill:#ffffff,stroke:#000000,stroke-width:2px,color:#000000;
    class IN1,IN2,IN3 inputBox;
    class P1,P2,P3 procBox;
    class O1,O2,O3,O4,O5 outBox;

    style INPUT fill:#000000,stroke:#000000,color:#ffffff
    style PROCESSING fill:#000000,stroke:#000000,color:#ffffff
    style OUTPUT fill:#000000,stroke:#000000,color:#ffffff
```

**Cara baca:**
- 3 kotak hitam besar = 3 fase aliran data (kiri ke kanan).
- Kotak putih di dalam = komponen sistem.
- Panah hitam = arah data.

---

## 2. Diagram Detail (Per Komponen)

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
        ESP["ESP32 + MQ-135<br/>Sensor Gas"]
        BTN["Tombol BOOT<br/>(test alarm lokal)"]
        USR["Pengguna Browser<br/>(HP / Laptop)"]
    end

    subgraph LAYER2["LAYER 2 — APLIKASI SERVER"]
        direction TB
        PY["Backend Python<br/>ServiceAPDBackend.py<br/><br/>YOLOv8 Person Detection<br/>YOLOv8 Custom PPE Model<br/>WebSocket :8765"]
        NX["Next.js Dashboard<br/>:3000<br/><br/>RBAC + Argon2id<br/>2FA TOTP + CSRF<br/>Service Token Auth"]
        DB[("SQLite Database<br/>Prisma ORM<br/>+ Audit Log Append-Only")]
    end

    subgraph LAYER3["LAYER 3 — KOMUNIKASI TERENKRIPSI"]
        direction LR
        MQTT["HiveMQ Cloud<br/>MQTT TLS :8883<br/>+ AES-128-CBC payload"]
        WA["GoWA WhatsApp<br/>Gateway"]
    end

    subgraph LAYER4["LAYER 4 — OUTPUT & AKSES"]
        direction TB
        ALARM["Speaker MAX98357A<br/>+ LED + Buzzer"]
        CF["Cloudflare Tunnel<br/>HTTPS public access<br/>(no port forward)"]
        WAUSER["PIC Sektor<br/>(WhatsApp)"]
    end

    %% Input ke Processing
    CAM ==>|RTSP H.264| PY
    ESP ==>|MQTT publish<br/>apd/telemetry/gas/+| MQTT
    BTN -.->|GPIO interrupt| ESP
    USR ==>|HTTPS| CF

    %% Processing internal
    PY <==>|HTTP loopback<br/>+ Service Token| NX
    NX <==>|Prisma query| DB

    %% MQTT bidirectional
    PY ==>|publish AES-encrypted<br/>apd/alarm/nodeId| MQTT
    MQTT ==>|subscribe + decrypt| ESP

    %% WhatsApp
    PY ==>|HTTP POST + foto| WA
    WA ==>|kirim pesan| WAUSER

    %% Cloudflare ke dashboard
    CF <==>|reverse tunnel| NX

    %% Output ke speaker/LED
    ESP ==>|I2S audio| ALARM

    %% Style boxes
    classDef whiteBox fill:#ffffff,stroke:#000000,stroke-width:2px,color:#000000;
    classDef dbBox    fill:#ffffff,stroke:#000000,stroke-width:2px,color:#000000;
    class CAM,ESP,BTN,USR,PY,NX,MQTT,WA,ALARM,CF,WAUSER whiteBox;
    class DB dbBox;

    %% Style layers (cluster)
    style LAYER1 fill:#000000,stroke:#000000,color:#ffffff
    style LAYER2 fill:#000000,stroke:#000000,color:#ffffff
    style LAYER3 fill:#000000,stroke:#000000,color:#ffffff
    style LAYER4 fill:#000000,stroke:#000000,color:#ffffff

    %% Linkstyle: panah hitam tegas
    linkStyle default stroke:#000000,stroke-width:1.5px;
```

**Cara baca:**
- 4 layer hitam = arsitektur 4 lapis (atas ke bawah: input fisik → server → komunikasi → output).
- `==>` panah tebal hitam = aliran data utama (data path).
- `<==>` panah dua arah = komunikasi bolak-balik (request/response).
- `-.->`  panah putus-putus = trigger event lokal (bukan data path utama).
- Cylinder `[(...)]` = database.

---

## 3. Diagram Aliran Pelanggaran APD (Sequence)

Khusus skenario "deteksi pelanggaran helm/rompi → alarm + WA + audit log". Cocok untuk presentasi *use case* spesifik.

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
    NX-->>PY: 201 Created
    MQTT->>ESP: deliver encrypted message
    ESP->>ESP: AES-decrypt + validate<br/>nodeId + timestamp
    ESP->>ESP: play audio "gunakan APD lengkap"<br/>via I2S MAX98357A
    PY->>WA: HTTP POST + foto pelanggaran
    WA->>PIC: kirim pesan WhatsApp
```

**Cara baca:**
- Setiap kolom = satu komponen.
- Panah horizontal = pesan (request/response).
- Note kotak = catatan logika internal yang penting.
- Nomor di kiri panah = urutan kejadian (autonumber).

---

## 4. Diagram Alur Gas Alert (Sequence)

Skenario terpisah karena flow gas berbeda dengan APD violation.

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
    Note over PY: kalau alert sustained > 30 detik<br/>+ cooldown WA selesai (10 menit)
    PY->>WA: HTTP POST pesan gas alert
    WA->>PIC: kirim WhatsApp peringatan gas
```

---

## 5. Cara Render

Tiga opsi:

1. **GitHub native** — buka file ini di GitHub, Mermaid otomatis ter-render.
2. **VS Code preview** — pasang ekstensi *Markdown Preview Mermaid Support* lalu `Ctrl+Shift+V`.
3. **Online editor** — copy kode mermaid ke [mermaid.live](https://mermaid.live), bisa export PNG/SVG.

## Convention Warna & Bentuk

| Element | Tampilan | Arti |
|---|---|---|
| Cluster `subgraph` (kotak besar) | Hitam dengan teks putih | Layer/fase arsitektur |
| `[Box]` | Putih dengan border hitam | Komponen/sistem |
| `[(Cylinder)]` | Putih, simbol database | Penyimpanan data |
| `==>` | Panah tebal hitam | Data path utama |
| `<==>` | Panah dua arah, hitam | Komunikasi bidirectional |
| `-.->`  | Panah putus-putus hitam | Event/trigger lokal |

Simpel, hitam-putih, formal, mudah dibaca saat dicetak.
