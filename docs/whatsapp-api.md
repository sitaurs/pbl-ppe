# 📱 WhatsApp REST API — Panduan Lengkap

> **Server**: `http://157.245.206.36:3000`
> **Auth**: Basic Auth (`admin` / `pbl_apd_2026!secure`)
> **Version**: go-whatsapp-web-multidevice v8.x (Multi-Device)
> **Repository**: [aldinokemal/go-whatsapp-web-multidevice](https://github.com/aldinokemal/go-whatsapp-web-multidevice)

---

## 📋 Daftar Isi

1. [Info Server & Koneksi](#1-info-server--koneksi)
2. [Authentication](#2-authentication)
3. [Device Management](#3-device-management)
4. [Login WhatsApp](#4-login-whatsapp)
5. [Kirim Pesan Teks](#5-kirim-pesan-teks)
6. [Kirim Gambar](#6-kirim-gambar)
7. [Kirim Video](#7-kirim-video)
8. [Kirim Audio](#8-kirim-audio)
9. [Kirim File/Dokumen](#9-kirim-filedokumen)
10. [Kirim Sticker](#10-kirim-sticker)
11. [Kirim Contact](#11-kirim-contact)
12. [Kirim Location](#12-kirim-location)
13. [Format Nomor Tujuan](#13-format-nomor-tujuan)
14. [Integrasi Python (Backend PBL)](#14-integrasi-python-backend-pbl)
15. [Management Server](#15-management-server)
16. [Troubleshooting](#16-troubleshooting)
17. [Ringkasan Endpoint](#17-ringkasan-endpoint)

---

## 1. Info Server & Koneksi

| Item | Value |
|------|-------|
| **Base URL** | `http://157.245.206.36:3000` |
| **Protocol** | HTTP REST |
| **Auth** | HTTP Basic Auth |
| **Username** | `admin` |
| **Password** | `pbl_apd_2026!secure` |
| **Web UI** | `http://157.245.206.36:3000` (buka di browser, login pakai Basic Auth) |
| **Lokasi di VPS** | `/opt/go-whatsapp-web-multidevice` |
| **Docker Container** | `go-whatsapp-web-multidevice-whatsapp_go-1` |

### Cek Server Hidup

```bash
curl -u admin:'pbl_apd_2026!secure' http://157.245.206.36:3000/app/devices
```

---

## 2. Authentication

Semua request **WAJIB** menyertakan Basic Auth header. Ada 2 cara:

### Cara 1: Flag `-u` (curl)

```bash
curl -u admin:'pbl_apd_2026!secure' http://157.245.206.36:3000/app/devices
```

### Cara 2: Header manual

```bash
# Base64 dari "admin:pbl_apd_2026!secure"
curl -H "Authorization: Basic YWRtaW46cGJsX2FwZF8yMDI2IXNlY3VyZQ==" \
  http://157.245.206.36:3000/app/devices
```

> ⚠️ **Tanpa auth akan mendapat response `401 Unauthorized`.**

---

## 3. Device Management

Karena ini versi v8 (multi-device), kamu perlu **membuat device dulu** sebelum login WhatsApp.

### 3.1 List Semua Device

```bash
curl -u admin:'pbl_apd_2026!secure' \
  http://157.245.206.36:3000/devices
```

### 3.2 Tambah Device Baru

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "Content-Type: application/json" \
  -d '{"device_id": "pbl-alarm"}' \
  http://157.245.206.36:3000/devices
```

### 3.3 Lihat Info Device

```bash
curl -u admin:'pbl_apd_2026!secure' \
  http://157.245.206.36:3000/devices/pbl-alarm
```

### 3.4 Hapus Device

```bash
curl -X DELETE -u admin:'pbl_apd_2026!secure' \
  http://157.245.206.36:3000/devices/pbl-alarm
```

### 3.5 Cek Status Koneksi Device

```bash
curl -u admin:'pbl_apd_2026!secure' \
  http://157.245.206.36:3000/devices/pbl-alarm/status
```

---

## 4. Login WhatsApp

Setelah device dibuat, login ke WhatsApp dengan salah satu metode:

### 4.1 Login via QR Code

```bash
curl -u admin:'pbl_apd_2026!secure' \
  http://157.245.206.36:3000/devices/pbl-alarm/login
```

Response berisi QR code image (base64).

**Cara termudah**: buka Web UI di browser `http://157.245.206.36:3000` → pilih device → klik Login → scan QR dari HP.

### 4.2 Login via Pairing Code (Tanpa QR)

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  "http://157.245.206.36:3000/devices/pbl-alarm/login/code?phone=628XXXXXXXXXX"
```

> Ganti `628XXXXXXXXXX` dengan nomor WhatsApp kamu (format internasional tanpa `+`).

Response:

```json
{
  "code": "SUCCESS",
  "results": {
    "code": "A1B2-C3D4"
  }
}
```

Masukkan kode tersebut di **WhatsApp → Linked Devices → Link a Device → Link with phone number**.

### 4.3 Reconnect Device

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  http://157.245.206.36:3000/devices/pbl-alarm/reconnect
```

### 4.4 Logout Device

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  http://157.245.206.36:3000/devices/pbl-alarm/logout
```

---

## 5. Kirim Pesan Teks

> ⚠️ **Semua endpoint `/send/*` memerlukan header `X-Device-Id` atau query `?device_id=`.**

### 5.1 Ke Nomor Pribadi

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: pbl-alarm" \
  -d '{
    "phone": "6281234567890@s.whatsapp.net",
    "message": "🚨 ALERT: Terdeteksi pelanggaran APD di Sektor A!"
  }' \
  http://157.245.206.36:3000/send/message
```

### 5.2 Ke Grup WhatsApp

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: pbl-alarm" \
  -d '{
    "phone": "120363012345678901@g.us",
    "message": "📢 Laporan Harian: Semua pekerja sudah memakai APD lengkap."
  }' \
  http://157.245.206.36:3000/send/message
```

### 5.3 Dengan Mention (Ghost Mention)

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: pbl-alarm" \
  -d '{
    "phone": "120363012345678901@g.us",
    "message": "⚠️ PIC Area harap segera cek CCTV Sektor B",
    "mentions": ["6281234567890", "6289876543210"]
  }' \
  http://157.245.206.36:3000/send/message
```

### 5.4 Mention Semua Anggota Grup (@everyone)

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: pbl-alarm" \
  -d '{
    "phone": "120363012345678901@g.us",
    "message": "🔴 DARURAT: Pelanggaran APD massal terdeteksi!",
    "mentions": ["@everyone"]
  }' \
  http://157.245.206.36:3000/send/message
```

### 5.5 Reply Pesan

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: pbl-alarm" \
  -d '{
    "phone": "6281234567890@s.whatsapp.net",
    "message": "Sudah ditangani, terima kasih laporannya.",
    "reply_message_id": "3EB089B9D6ADD58153C561"
  }' \
  http://157.245.206.36:3000/send/message
```

---

## 6. Kirim Gambar

### 6.1 Upload File Gambar — Ke Nomor Pribadi

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  -F "phone=6281234567890@s.whatsapp.net" \
  -F "caption=📸 Screenshot pelanggaran APD - Sektor A" \
  -F "image=@/path/to/screenshot.jpg" \
  http://157.245.206.36:3000/send/image
```

### 6.2 Upload File Gambar — Ke Grup

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  -F "phone=120363012345678901@g.us" \
  -F "caption=🔍 Deteksi YOLO: Pekerja tanpa helm di area loading dock" \
  -F "image=@/path/to/detection_result.jpg" \
  http://157.245.206.36:3000/send/image
```

### 6.3 Kirim Gambar dari URL

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  -F "phone=6281234567890@s.whatsapp.net" \
  -F "caption=Gambar dari URL" \
  -F "image_url=https://example.com/detection.jpg" \
  http://157.245.206.36:3000/send/image
```

### 6.4 Kirim Gambar View Once (Sekali Lihat)

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  -F "phone=6281234567890@s.whatsapp.net" \
  -F "caption=Foto sekali lihat" \
  -F "view_once=true" \
  -F "image=@/path/to/photo.jpg" \
  http://157.245.206.36:3000/send/image
```

### 6.5 Kirim Gambar Terkompresi

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  -F "phone=6281234567890@s.whatsapp.net" \
  -F "caption=Gambar dikompresi otomatis" \
  -F "compress=true" \
  -F "image=@/path/to/large_photo.jpg" \
  http://157.245.206.36:3000/send/image
```

---

## 7. Kirim Video

### 7.1 Upload File Video — Ke Nomor Pribadi

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  -F "phone=6281234567890@s.whatsapp.net" \
  -F "caption=🎥 Rekaman CCTV - Pelanggaran APD pukul 14:30" \
  -F "video=@/path/to/cctv_clip.mp4" \
  http://157.245.206.36:3000/send/video
```

### 7.2 Upload File Video — Ke Grup

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  -F "phone=120363012345678901@g.us" \
  -F "caption=📹 Bukti rekaman insiden area workshop" \
  -F "video=@/path/to/incident.mp4" \
  http://157.245.206.36:3000/send/video
```

### 7.3 Kirim Video dari URL

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  -F "phone=6281234567890@s.whatsapp.net" \
  -F "caption=Video dari server" \
  -F "video_url=https://example.com/sample.mp4" \
  http://157.245.206.36:3000/send/video
```

### 7.4 Kirim Video View Once

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  -F "phone=6281234567890@s.whatsapp.net" \
  -F "caption=Video sekali lihat" \
  -F "view_once=true" \
  -F "video=@/path/to/video.mp4" \
  http://157.245.206.36:3000/send/video
```

### 7.5 Kirim Video Terkompresi

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  -F "phone=6281234567890@s.whatsapp.net" \
  -F "caption=Video dikompresi" \
  -F "compress=true" \
  -F "video=@/path/to/large_video.mp4" \
  http://157.245.206.36:3000/send/video
```

### 7.6 Kirim Video sebagai GIF (Loop, Silent, Autoplay)

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  -F "phone=6281234567890@s.whatsapp.net" \
  -F "caption=GIF animasi" \
  -F "gif_playback=true" \
  -F "video=@/path/to/short_clip.mp4" \
  http://157.245.206.36:3000/send/video
```

---

## 8. Kirim Audio

### 8.1 Upload File Audio — Ke Nomor Pribadi

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  -F "phone=6281234567890@s.whatsapp.net" \
  -F "audio=@/path/to/alarm_sound.mp3" \
  http://157.245.206.36:3000/send/audio
```

### 8.2 Upload File Audio — Ke Grup

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  -F "phone=120363012345678901@g.us" \
  -F "audio=@/path/to/voice_note.ogg" \
  http://157.245.206.36:3000/send/audio
```

### 8.3 Kirim Audio dari URL

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  -F "phone=6281234567890@s.whatsapp.net" \
  -F "audio_url=https://example.com/audio.mp3" \
  http://157.245.206.36:3000/send/audio
```

---

## 9. Kirim File/Dokumen

### 9.1 Upload Dokumen — Ke Nomor Pribadi

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  -F "phone=6281234567890@s.whatsapp.net" \
  -F "caption=📄 Laporan APD Harian - 19 Mei 2026" \
  -F "file=@/path/to/laporan.pdf" \
  http://157.245.206.36:3000/send/file
```

### 9.2 Upload Dokumen — Ke Grup

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  -F "phone=120363012345678901@g.us" \
  -F "caption=📊 Spreadsheet monitoring APD mingguan" \
  -F "file=@/path/to/monitoring.xlsx" \
  http://157.245.206.36:3000/send/file
```

---

## 10. Kirim Sticker

### 10.1 Upload File Sticker

Format yang didukung: JPG, JPEG, PNG, WebP, GIF.
Otomatis di-convert ke WebP 512x512 px.

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  -F "phone=6281234567890@s.whatsapp.net" \
  -F "sticker=@/path/to/sticker.png" \
  http://157.245.206.36:3000/send/sticker
```

### 10.2 Kirim Sticker dari URL

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  -F "phone=120363012345678901@g.us" \
  -F "sticker_url=https://example.com/sticker.webp" \
  http://157.245.206.36:3000/send/sticker
```

---

## 11. Kirim Contact

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: pbl-alarm" \
  -d '{
    "phone": "6281234567890@s.whatsapp.net",
    "contact_name": "PIC Keselamatan Kerja",
    "contact_phone": "6289876543210"
  }' \
  http://157.245.206.36:3000/send/contact
```

### Ke Grup

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: pbl-alarm" \
  -d '{
    "phone": "120363012345678901@g.us",
    "contact_name": "Koordinator Lapangan",
    "contact_phone": "6281111222333"
  }' \
  http://157.245.206.36:3000/send/contact
```

---

## 12. Kirim Location

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: pbl-alarm" \
  -d '{
    "phone": "6281234567890@s.whatsapp.net",
    "latitude": "-6.200000",
    "longitude": "106.816666",
    "name": "Lokasi Insiden - Warehouse B"
  }' \
  http://157.245.206.36:3000/send/location
```

### Ke Grup

```bash
curl -X POST -u admin:'pbl_apd_2026!secure' \
  -H "Content-Type: application/json" \
  -H "X-Device-Id: pbl-alarm" \
  -d '{
    "phone": "120363012345678901@g.us",
    "latitude": "-7.250445",
    "longitude": "112.768845",
    "name": "Area Monitoring Sektor A - Pabrik"
  }' \
  http://157.245.206.36:3000/send/location
```

---

## 13. Format Nomor Tujuan

> ⚠️ **Format nomor sangat penting! Salah format = pesan gagal terkirim.**

### Nomor Pribadi (Personal Chat)

| Asal | Nomor Asli | Format API |
|------|-----------|------------|
| Indonesia | `0812-3456-7890` | `6281234567890@s.whatsapp.net` |
| Indonesia | `+6281234567890` | `6281234567890@s.whatsapp.net` |
| Singapura | `+6591234567` | `6591234567@s.whatsapp.net` |

**Aturan:**
- Awali dengan kode negara (`62` untuk Indonesia)
- Hilangkan `0` di depan → `0812...` → `6281...`
- Hilangkan `+` → `+6281...` → `6281...`
- Akhiri dengan `@s.whatsapp.net`

### Grup WhatsApp (Group JID)

| Format | Contoh |
|--------|--------|
| Grup | `120363XXXXXXXXXX@g.us` |

**Cara mendapatkan Group JID:**

```bash
# List semua grup yang kamu ikuti
curl -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  http://157.245.206.36:3000/user/my/groups
```

Response akan berisi `JID` setiap grup — gunakan value itu sebagai field `phone`.

---

## 14. Integrasi Python (Backend PBL)

### 14.1 Install Dependency

```bash
pip install requests
```

### 14.2 Class WhatsApp Client

```python
import requests
from pathlib import Path
from typing import Optional


class WhatsAppAPI:
    """Client untuk GoWA REST API."""

    def __init__(
        self,
        base_url: str = "http://157.245.206.36:3000",
        username: str = "admin",
        password: str = "pbl_apd_2026!secure",
        device_id: str = "pbl-alarm",
    ):
        self.base_url = base_url
        self.auth = (username, password)
        self.device_id = device_id
        self.headers = {"X-Device-Id": device_id}

    # ── Pesan Teks ─────────────────────────────────────────

    def send_message(
        self,
        phone: str,
        message: str,
        mentions: Optional[list[str]] = None,
        reply_message_id: Optional[str] = None,
    ) -> dict:
        """Kirim pesan teks ke nomor/grup."""
        payload: dict = {"phone": phone, "message": message}
        if mentions:
            payload["mentions"] = mentions
        if reply_message_id:
            payload["reply_message_id"] = reply_message_id
        resp = requests.post(
            f"{self.base_url}/send/message",
            json=payload,
            auth=self.auth,
            headers={**self.headers, "Content-Type": "application/json"},
        )
        return resp.json()

    # ── Gambar ─────────────────────────────────────────────

    def send_image(
        self,
        phone: str,
        image_path: Optional[str] = None,
        image_url: Optional[str] = None,
        caption: str = "",
        compress: bool = False,
        view_once: bool = False,
    ) -> dict:
        """Kirim gambar ke nomor/grup (file upload atau URL)."""
        data: dict = {
            "phone": phone,
            "caption": caption,
            "compress": str(compress).lower(),
            "view_once": str(view_once).lower(),
        }
        files = None
        if image_path:
            files = {"image": open(image_path, "rb")}
        elif image_url:
            data["image_url"] = image_url
        resp = requests.post(
            f"{self.base_url}/send/image",
            data=data,
            files=files,
            auth=self.auth,
            headers=self.headers,
        )
        return resp.json()

    # ── Video ──────────────────────────────────────────────

    def send_video(
        self,
        phone: str,
        video_path: Optional[str] = None,
        video_url: Optional[str] = None,
        caption: str = "",
        compress: bool = False,
        view_once: bool = False,
    ) -> dict:
        """Kirim video ke nomor/grup (file upload atau URL)."""
        data: dict = {
            "phone": phone,
            "caption": caption,
            "compress": str(compress).lower(),
            "view_once": str(view_once).lower(),
        }
        files = None
        if video_path:
            files = {"video": open(video_path, "rb")}
        elif video_url:
            data["video_url"] = video_url
        resp = requests.post(
            f"{self.base_url}/send/video",
            data=data,
            files=files,
            auth=self.auth,
            headers=self.headers,
        )
        return resp.json()

    # ── Audio ──────────────────────────────────────────────

    def send_audio(
        self,
        phone: str,
        audio_path: Optional[str] = None,
        audio_url: Optional[str] = None,
    ) -> dict:
        """Kirim audio ke nomor/grup."""
        data: dict = {"phone": phone}
        files = None
        if audio_path:
            files = {"audio": open(audio_path, "rb")}
        elif audio_url:
            data["audio_url"] = audio_url
        resp = requests.post(
            f"{self.base_url}/send/audio",
            data=data,
            files=files,
            auth=self.auth,
            headers=self.headers,
        )
        return resp.json()

    # ── File / Dokumen ─────────────────────────────────────

    def send_file(self, phone: str, file_path: str, caption: str = "") -> dict:
        """Kirim dokumen/file ke nomor/grup."""
        data = {"phone": phone, "caption": caption}
        files = {"file": open(file_path, "rb")}
        resp = requests.post(
            f"{self.base_url}/send/file",
            data=data,
            files=files,
            auth=self.auth,
            headers=self.headers,
        )
        return resp.json()

    # ── Sticker ────────────────────────────────────────────

    def send_sticker(
        self,
        phone: str,
        sticker_path: Optional[str] = None,
        sticker_url: Optional[str] = None,
    ) -> dict:
        """Kirim sticker ke nomor/grup."""
        data: dict = {"phone": phone}
        files = None
        if sticker_path:
            files = {"sticker": open(sticker_path, "rb")}
        elif sticker_url:
            data["sticker_url"] = sticker_url
        resp = requests.post(
            f"{self.base_url}/send/sticker",
            data=data,
            files=files,
            auth=self.auth,
            headers=self.headers,
        )
        return resp.json()

    # ── Info / Utility ─────────────────────────────────────

    def get_groups(self) -> dict:
        """List semua grup yang diikuti."""
        resp = requests.get(
            f"{self.base_url}/user/my/groups",
            auth=self.auth,
            headers=self.headers,
        )
        return resp.json()

    def get_contacts(self) -> dict:
        """List semua kontak."""
        resp = requests.get(
            f"{self.base_url}/user/my/contacts",
            auth=self.auth,
            headers=self.headers,
        )
        return resp.json()

    def get_status(self) -> dict:
        """Cek status koneksi device."""
        resp = requests.get(
            f"{self.base_url}/devices/{self.device_id}/status",
            auth=self.auth,
        )
        return resp.json()

    def check_phone(self, phone: str) -> dict:
        """Cek apakah nomor terdaftar di WhatsApp."""
        resp = requests.get(
            f"{self.base_url}/user/check",
            params={"phone": phone},
            auth=self.auth,
            headers=self.headers,
        )
        return resp.json()
```

### 14.3 Contoh Penggunaan

```python
wa = WhatsAppAPI()

# ── Kirim teks ke nomor pribadi
wa.send_message(
    "6281234567890@s.whatsapp.net",
    "Hello dari PBL APD System!"
)

# ── Kirim teks ke grup
wa.send_message(
    "120363012345678901@g.us",
    "📢 Update: Sistem monitoring aktif"
)

# ── Kirim teks dengan mention @everyone
wa.send_message(
    "120363012345678901@g.us",
    "🔴 DARURAT: Semua harap perhatian!",
    mentions=["@everyone"]
)

# ── Kirim gambar + caption ke grup
wa.send_image(
    phone="120363012345678901@g.us",
    image_path="/path/to/detection.jpg",
    caption="🔍 Terdeteksi pekerja tanpa helm"
)

# ── Kirim gambar dari URL
wa.send_image(
    phone="6281234567890@s.whatsapp.net",
    image_url="https://example.com/alert.jpg",
    caption="Screenshot pelanggaran"
)

# ── Kirim video + caption
wa.send_video(
    phone="120363012345678901@g.us",
    video_path="/path/to/cctv_clip.mp4",
    caption="🎥 Rekaman insiden 14:30 WIB"
)

# ── Kirim dokumen PDF
wa.send_file(
    phone="6281234567890@s.whatsapp.net",
    file_path="/path/to/laporan.pdf",
    caption="📄 Laporan APD Harian"
)

# ── Kirim audio
wa.send_audio(
    phone="6281234567890@s.whatsapp.net",
    audio_path="/path/to/alert_sound.mp3"
)

# ── List semua grup
groups = wa.get_groups()
for g in groups.get("results", {}).get("data", []):
    print(f"  {g['JID']}  →  {g['Name']}")

# ── Cek status koneksi
status = wa.get_status()
print(f"Connected: {status['results']['is_connected']}")
```

### 14.4 Contoh Integrasi di Backend FastAPI

```python
# Di backend/app/services/whatsapp.py
from app.core.config import settings

wa_client = WhatsAppAPI(
    base_url=settings.WHATSAPP_API_URL,   # http://157.245.206.36:3000
    username=settings.WHATSAPP_API_USER,   # admin
    password=settings.WHATSAPP_API_PASS,   # pbl_apd_2026!secure
    device_id=settings.WHATSAPP_DEVICE_ID, # pbl-alarm
)

def send_apd_alert(phone: str, sector: str, violation: str, image_path: str = None):
    """Kirim alert pelanggaran APD via WhatsApp."""
    message = (
        f"🚨 *ALERT PELANGGARAN APD*\n\n"
        f"📍 Sektor: {sector}\n"
        f"⚠️ Jenis: {violation}\n"
        f"🕐 Waktu: {datetime.now().strftime('%H:%M:%S WIB')}\n\n"
        f"Segera lakukan pengecekan!"
    )

    if image_path:
        return wa_client.send_image(
            phone=phone,
            image_path=image_path,
            caption=message,
        )
    else:
        return wa_client.send_message(phone=phone, message=message)
```

---

## 15. Management Server

### SSH ke VPS

```bash
ssh root@157.245.206.36
```

### Docker Commands

```bash
cd /opt/go-whatsapp-web-multidevice

# Lihat logs (real-time)
docker compose logs -f --tail 50

# Restart service
docker compose restart

# Stop service
docker compose down

# Start service
docker compose up -d

# Rebuild (setelah update code)
docker compose up -d --build
```

### Konfigurasi (.env)

File: `/opt/go-whatsapp-web-multidevice/src/.env`

```env
APP_PORT=3000
APP_HOST=0.0.0.0
APP_DEBUG=false
APP_OS=PBL-APD
APP_BASIC_AUTH=admin:pbl_apd_2026!secure
APP_TRUSTED_PROXIES=0.0.0.0/0
WHATSAPP_AUTO_MARK_READ=true
WHATSAPP_AUTO_DOWNLOAD_MEDIA=true
WHATSAPP_ACCOUNT_VALIDATION=true
WHATSAPP_PRESENCE_ON_CONNECT=unavailable
```

### Mengganti Password Auth

Edit `.env`, ubah `APP_BASIC_AUTH`, lalu restart:

```bash
# Format: user1:pass1,user2:pass2
APP_BASIC_AUTH=admin:newpassword123,operator:operpass456

# Restart
docker compose restart
```

---

## 16. Troubleshooting

### Masalah Umum

| Error | Penyebab | Solusi |
|-------|----------|--------|
| `401 Unauthorized` | Auth salah/tidak ada | Tambahkan `-u admin:'pbl_apd_2026!secure'` |
| `DEVICE_ID_REQUIRED` | Tidak ada device_id | Tambahkan header `X-Device-Id: pbl-alarm` |
| `device not found` | Device belum dibuat | Buat device dulu: `POST /devices` |
| `not logged in` | WhatsApp belum login | Login via QR/Pairing Code |
| `phone is not valid` | Format nomor salah | Pastikan format `628xxx@s.whatsapp.net` |
| `connection closed` | Koneksi terputus | Hit `POST /devices/{id}/reconnect` |
| `timeout` | Server lambat/file besar | Coba compress, atau kirim file lebih kecil |

### Alur Setup Pertama Kali (Step by Step)

```
1. POST /devices                              → buat device "pbl-alarm"
2. GET  /devices/pbl-alarm/login              → scan QR dari HP
   ATAU
   POST /devices/pbl-alarm/login/code?phone=628xxx → pairing code
3. GET  /devices/pbl-alarm/status             → pastikan is_connected=true
4. GET  /user/my/groups                       → catat Group JID yang dibutuhkan
5. POST /send/message                         → mulai kirim pesan!
```

### Cek Apakah Nomor Terdaftar WhatsApp

```bash
curl -u admin:'pbl_apd_2026!secure' \
  -H "X-Device-Id: pbl-alarm" \
  "http://157.245.206.36:3000/user/check?phone=628123456789"
```

---

## 17. Ringkasan Endpoint

### Device Management

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| `GET` | `/devices` | List semua device |
| `POST` | `/devices` | Tambah device baru |
| `GET` | `/devices/{id}` | Info device |
| `DELETE` | `/devices/{id}` | Hapus device |
| `GET` | `/devices/{id}/login` | Login QR |
| `POST` | `/devices/{id}/login/code?phone=` | Login pairing code |
| `POST` | `/devices/{id}/logout` | Logout |
| `POST` | `/devices/{id}/reconnect` | Reconnect |
| `GET` | `/devices/{id}/status` | Status koneksi |

### User Info

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| `GET` | `/user/info?phone=` | Info user |
| `GET` | `/user/avatar?phone=` | Avatar user |
| `GET` | `/user/check?phone=` | Cek nomor terdaftar |
| `GET` | `/user/my/groups` | List grup saya |
| `GET` | `/user/my/contacts` | List kontak saya |
| `GET` | `/user/my/newsletters` | List newsletter saya |
| `GET` | `/user/my/privacy` | Privacy settings |

### Send Messages (Semua butuh `X-Device-Id` header)

| Method | Endpoint | Content-Type | Fungsi |
|--------|----------|-------------|--------|
| `POST` | `/send/message` | `application/json` | Kirim teks |
| `POST` | `/send/image` | `multipart/form-data` | Kirim gambar |
| `POST` | `/send/video` | `multipart/form-data` | Kirim video |
| `POST` | `/send/audio` | `multipart/form-data` | Kirim audio |
| `POST` | `/send/file` | `multipart/form-data` | Kirim dokumen |
| `POST` | `/send/sticker` | `multipart/form-data` | Kirim sticker |
| `POST` | `/send/contact` | `application/json` | Kirim kontak |
| `POST` | `/send/location` | `application/json` | Kirim lokasi |

---

> 💡 **Tip**: Buka `http://157.245.206.36:3000` di browser untuk Web UI — bisa login WhatsApp, kirim pesan, dan manage device lewat interface grafis juga!
