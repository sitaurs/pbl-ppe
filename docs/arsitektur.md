# Arsitektur Sistem Deteksi APD

## Diagram Alur

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Python + GPU)                        │
│                                                                     │
│  ┌───────────┐    ┌──────────────────┐    ┌──────────────────────┐ │
│  │ IP Camera │───▶│  ServiceAPDBackend│───▶│ YOLOv8 Inference     │ │
│  │ / Webcam  │    │  (Multi-Thread)  │    │ PPE Model + Person   │ │
│  └───────────┘    └────────┬─────────┘    └──────────────────────┘ │
│                            │                                        │
│              ┌─────────────┼─────────────────────┐                  │
│              ▼             ▼                     ▼                  │
│    ┌─────────────┐  ┌───────────┐      ┌──────────────┐           │
│    │ MQTT Publish│  │ WebSocket │      │ WhatsApp API │           │
│    │(Encrypted) │  │ Broadcast │      │  (GoWA REST) │           │
│    └──────┬──────┘  └─────┬─────┘      └──────┬───────┘           │
└───────────┼───────────────┼────────────────────┼───────────────────┘
            │               │                    │
            ▼               ▼                    ▼
┌───────────────┐   ┌────────────────┐   ┌──────────────┐
│  HiveMQ Cloud │   │ Web Dashboard  │   │     PIC      │
│  (IoT Broker) │   │ (Next.js)      │   │  (WhatsApp)  │
└───────────────┘   └────────────────┘   └──────────────┘
```

## Komponen Utama

### 1. Detection Engine
- **Model PPE**: YOLOv8 kustom (4 kelas: helmet, no_helmet, vest, no_vest)
- **Model Person**: YOLOv8n pre-trained (deteksi orang)
- **Logika Asosiasi**: Menghubungkan APD yang terdeteksi ke orang terdekat (overlap ≥35%)

### 2. Communication Layer
- **MQTT**: Pesan terenkripsi AES128-CBC untuk alert jarak jauh
- **WebSocket**: Streaming frame real-time ke browser (localhost)
- **REST API**: Notifikasi WhatsApp dan logging ke dashboard

### 3. Web Dashboard
- **Next.js 16**: Server-side rendering + API Routes
- **Database**: File JSON sederhana (db.json, violations.json)
- **Real-time**: WebSocket client untuk video feed

### 4. Notification System
- **GoWA**: Self-hosted WhatsApp gateway di VPS
- **Cooldown**: 120 detik per sektor untuk hindari spam
- **Evidence**: Foto pelanggaran dikirim bersama alert

## Alur Data

1. Frame dibaca dari kamera (RTSP/Webcam)
2. Inferensi GPU: deteksi orang + APD
3. Asosiasi: cek kelengkapan APD per orang
4. Jika pelanggaran:
   - Publish ke MQTT (terenkripsi)
   - Kirim WA ke PIC (dengan foto)
   - Log ke dashboard API
5. Frame beranotasi di-broadcast via WebSocket
6. Dashboard menampilkan live feed + statistik
