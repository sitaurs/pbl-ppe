# Scripts

Runtime / demo / utility scripts untuk SafeGuard APD.

## Demo Script (untuk presentasi PBL)

| File | Fungsi |
|---|---|
| `demo_security.ps1` | Live evidence demo 4 klaim keamanan: Argon2id, AES-128 + TLS, Service Token, Cloudflare Tunnel. Pause Enter antar section untuk talking points. |
| `aes_demo_compare.py` | Encrypt payload yang sama 3x, tunjukkan ciphertext berbeda total (bukti random IV). |
| `check_password_hash.py` | Parse PHC string Argon2id dari SQLite User table, validate parameter sesuai OWASP 2023. |
| `test_service_token.ps1` | 4 skenario otorisasi Service Token (anonymous, wrong-token, scope-denied, allowed). |

Dipakai oleh `demo_security.ps1` sebagai sub-process. Standalone juga bisa.

### Cara Pakai (interactive demo)

```powershell
powershell -File scripts/demo_security.ps1
# Mode auto (no pause antar section, untuk dry-run)
powershell -File scripts/demo_security.ps1 -Auto
# Skip live MQTT trigger (kalau ESP32 tidak connected)
powershell -File scripts/demo_security.ps1 -SkipMqtt
```

Lihat `docs/security-talking-points.md` untuk panduan apa yang diucapkan saat tiap section jalan.

## Operations

| File | Fungsi |
|---|---|
| `config_bundle.py` | Export/Import konfigurasi runtime (env + db + cloudflare) jadi 1 ZIP terenkripsi. |

Dipakai TUI (key `E` export, `I` import). Standalone juga bisa:

```bash
# Export
python -m scripts.config_bundle export safeguard-bundle.zip

# Import (dry-run dulu untuk preview)
python -m scripts.config_bundle import safeguard-bundle.zip --dry-run
python -m scripts.config_bundle import safeguard-bundle.zip
```

## Utilities

`utils/` — helper script untuk cek environment dev:

| File | Fungsi |
|---|---|
| `check_cuda.py` | Verify CUDA + GPU detected oleh PyTorch. |
