```mermaid
graph LR

subgraph Input
    A["IP Camera 1-N\n(RTSP)"]
end

subgraph Jaringan
    D["Hub / Switch"]
    E["MikroTik Router\n(Firewall/NAT)"]
end

subgraph Proses (Server)
    F["Python Backend\n(Deteksi YOLOv8)"]
    G["Next.js Dashboard\n🔒 Argon2id, 2FA, RBAC\n🔒 CSRF, Audit Log"]
end

subgraph Output & Akses
    H["ESP32 Alarm"]
    I["WhatsApp PIC"]
    J["Browser / User"]
end

A --> D
D --> E
E --> F
F -.->|"🔒 Service Token"| G
F -->|"🔒 MQTT + AES-128"| H
F -->|"HTTP"| I
F -->|"WebSocket"| J
G -->|"🔒 Cloudflare Tunnel\n(HTTPS, Anti-DDoS,\nNo Open Ports)"| J
```
