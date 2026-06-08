# Architecture Documentation

Dokumen visual arsitektur sistem SafeGuard APD.

## Isi

| Folder | Format | Cara Akses |
|---|---|---|
| `visual/` | HTML interaktif | Buka `visual/index.html` di browser |
| `block-diagram/` | HTML + Markdown | Buka `block-diagram/index.html` di browser |

## Konten

- **Layer 1 (Fisik)**: IP Camera → MikroTik → Server, plus WiFi untuk ESP32
- **Layer 2 (Aplikasi)**: Python YOLO backend + Next.js dashboard + SQLite + Prisma
- **Layer 3 (Output)**: ESP32 alarm via MQTT (AES-128-CBC + TLS) + WhatsApp via GoWA
- **Layer 4 (Akses)**: Cloudflare Tunnel (`apd.ecosystech.me`)

## Lihat juga

- `../../ARSITEKTUR.md` — narasi text + tabel pemetaan ke file/line code
- `../demo-script.md` — 8 langkah demo
- `../security-talking-points.md` — narasi 4 klaim keamanan
