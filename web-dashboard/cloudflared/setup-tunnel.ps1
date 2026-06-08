# setup-tunnel.ps1
# Script otomasi setup Cloudflare Tunnel untuk SafeGuard APD
# Requirements: 7.1, 7.2
#
# CATATAN: Beberapa langkah membutuhkan interaksi manual:
#   - cloudflared tunnel login  → buka browser untuk authorize domain
#   - cloudflared service install → butuh PowerShell Administrator
#
# Cara menjalankan (PowerShell biasa untuk setup, Administrator untuk service):
#   cd web-dashboard\cloudflared
#   .\setup-tunnel.ps1
#
# Untuk install service (step 5), jalankan ulang sebagai Administrator:
#   .\setup-tunnel.ps1 -InstallService

param(
    [switch]$InstallService,
    [switch]$SkipLogin
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ─── Warna helper ─────────────────────────────────────────
function Write-Step { param([string]$msg) Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "    [!]  $msg" -ForegroundColor Yellow }
function Write-Err  { param([string]$msg) Write-Host "    [X]  $msg" -ForegroundColor Red }

# ─── Cek cloudflared tersedia ─────────────────────────────
Write-Step "Memeriksa cloudflared..."
$cfPath = Get-Command "cloudflared" -ErrorAction SilentlyContinue
if (-not $cfPath) {
    $localExe = Join-Path $PSScriptRoot "cloudflared.exe"
    if (Test-Path $localExe) {
        $env:PATH = "$PSScriptRoot;$env:PATH"
        Write-Ok "cloudflared ditemukan di folder lokal: $localExe"
    } else {
        Write-Err "cloudflared tidak ditemukan."
        Write-Host ""
        Write-Host "  Download dari: https://github.com/cloudflare/cloudflared/releases" -ForegroundColor Yellow
        Write-Host "  Rename ke cloudflared.exe dan letakkan di:" -ForegroundColor Yellow
        Write-Host "    - Folder ini ($PSScriptRoot), atau" -ForegroundColor Yellow
        Write-Host "    - C:\Windows\System32\ (untuk global PATH)" -ForegroundColor Yellow
        exit 1
    }
} else {
    $cfVer = & cloudflared --version 2>&1
    Write-Ok "cloudflared ditemukan: $cfVer"
}

# ─── Input domain dari user ───────────────────────────────
Write-Step "Konfigurasi domain"
Write-Host ""
Write-Host "  Masukkan domain yang sudah terdaftar di Cloudflare." -ForegroundColor White
Write-Host "  Contoh: kampus.id  (bukan safeguard.kampus.id)" -ForegroundColor Gray
Write-Host ""
$domain = Read-Host "  Domain Cloudflare kamu"
$domain = $domain.Trim().ToLower()

if ([string]::IsNullOrEmpty($domain)) {
    Write-Err "Domain tidak boleh kosong."
    exit 1
}

$hostDash  = "safeguard.$domain"
$hostWS    = "ws.safeguard.$domain"
$tunnelName = "safeguard-apd"

Write-Ok "Dashboard hostname : $hostDash"
Write-Ok "WebSocket hostname : $hostWS"
Write-Ok "Tunnel name        : $tunnelName"

# ─── Step 1: Login ────────────────────────────────────────
if (-not $SkipLogin) {
    Write-Step "Step 1/5 — Login ke Cloudflare (akan buka browser)"
    Write-Host "  Pilih domain '$domain' saat halaman Cloudflare terbuka." -ForegroundColor White
    Write-Host "  Tekan Enter untuk lanjut atau Ctrl+C untuk batal..." -ForegroundColor Gray
    Read-Host | Out-Null

    & cloudflared tunnel login
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Login gagal (exit code $LASTEXITCODE). Coba ulang."
        exit 1
    }
    Write-Ok "Login berhasil."
} else {
    Write-Warn "Step 1 dilewati (-SkipLogin). Pastikan sudah login sebelumnya."
}

# ─── Step 2: Buat tunnel ──────────────────────────────────
Write-Step "Step 2/5 — Membuat tunnel '$tunnelName'"

$existingTunnels = & cloudflared tunnel list 2>&1
if ($existingTunnels -match $tunnelName) {
    Write-Warn "Tunnel '$tunnelName' sudah ada. Lewati pembuatan."
    Write-Host "  Untuk lihat UUID, jalankan: cloudflared tunnel info $tunnelName" -ForegroundColor Gray
    $tunnelInfo = & cloudflared tunnel info $tunnelName 2>&1
    $uuid = ($tunnelInfo | Select-String -Pattern '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | Select-Object -First 1).Matches.Value
} else {
    $createOutput = & cloudflared tunnel create $tunnelName 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Gagal membuat tunnel."
        Write-Host $createOutput
        exit 1
    }
    Write-Host $createOutput
    $uuid = ($createOutput | Select-String -Pattern '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}').Matches.Value
    Write-Ok "Tunnel dibuat."
}

if ([string]::IsNullOrEmpty($uuid)) {
    Write-Warn "UUID tidak bisa dideteksi otomatis dari output."
    Write-Host ""
    $uuid = Read-Host "  Masukkan UUID tunnel secara manual"
    $uuid = $uuid.Trim()
}

Write-Ok "UUID tunnel: $uuid"

# ─── Step 3: Update config.yml ────────────────────────────
Write-Step "Step 3/5 — Update config.yml"

$configPath = Join-Path $PSScriptRoot "config.yml"
$windowsUser = $env:USERNAME
$credentialsPath = "C:\Users\$windowsUser\.cloudflared\$uuid.json"

$configContent = @"
# cloudflared/config.yml
# Di-generate oleh setup-tunnel.ps1 pada $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
# Requirements: 7.1, 7.2
#
# Edit hostname di bawah jika domain berubah.
# Jangan edit tunnel UUID dan credentials-file secara manual.

tunnel: $uuid
credentials-file: $credentialsPath

ingress:
  # === Next.js Web (UI + API + Auth + RBAC) ===
  - hostname: $hostDash
    service: http://127.0.0.1:3000
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      keepAliveTimeout: 90s
      keepAliveConnections: 10
      disableChunkedEncoding: false

  # === Python YOLO WebSocket (live frame stream untuk halaman /monitor) ===
  - hostname: $hostWS
    service: http://127.0.0.1:8765
    originRequest:
      noTLSVerify: true
      connectTimeout: 30s
      # WebSocket long-lived; keep-alive panjang supaya frame tidak terputus.
      keepAliveTimeout: 600s
      keepAliveConnections: 5

  # Catch-all (wajib ada di akhir)
  - service: http_status:404
"@

Set-Content -Path $configPath -Value $configContent -Encoding UTF8
Write-Ok "config.yml sudah diupdate: $configPath"

# ─── Step 4: Route DNS ────────────────────────────────────
Write-Step "Step 4/5 — Route DNS"

Write-Host "  Membuat CNAME: $hostDash → tunnel..." -ForegroundColor White
& cloudflared tunnel route dns $tunnelName $hostDash
if ($LASTEXITCODE -ne 0) {
    Write-Warn "Route DNS untuk $hostDash gagal (mungkin sudah ada). Lanjutkan..."
} else {
    Write-Ok "DNS route: $hostDash"
}

Write-Host "  Membuat CNAME: $hostWS → tunnel..." -ForegroundColor White
& cloudflared tunnel route dns $tunnelName $hostWS
if ($LASTEXITCODE -ne 0) {
    Write-Warn "Route DNS untuk $hostWS gagal (mungkin sudah ada). Lanjutkan..."
} else {
    Write-Ok "DNS route: $hostWS"
}

# ─── Step 5: Update .env.local ────────────────────────────
Write-Step "Step 5a/5 — Update web-dashboard/.env.local"

$envLocalPath = Join-Path $PSScriptRoot "..\\.env.local"
$envLocalPath = [System.IO.Path]::GetFullPath($envLocalPath)

if (Test-Path $envLocalPath) {
    $envContent = Get-Content $envLocalPath -Raw

    # Update atau tambah variabel
    $vars = @{
        "BEHIND_PROXY"              = "cloudflare"
        "NEXT_PUBLIC_YOLO_WS_URL"   = "wss://$hostWS"
        "NEXTAUTH_URL"              = "https://$hostDash"
        "NODE_ENV"                  = "production"
    }

    foreach ($key in $vars.Keys) {
        $value = $vars[$key]
        if ($envContent -match "(?m)^$key=") {
            $envContent = $envContent -replace "(?m)^$key=.*$", "$key=$value"
            Write-Ok "Updated: $key=$value"
        } else {
            $envContent += "`n$key=$value"
            Write-Ok "Added:   $key=$value"
        }
    }

    Set-Content -Path $envLocalPath -Value $envContent.TrimEnd() -Encoding UTF8
    Write-Ok ".env.local diupdate: $envLocalPath"
} else {
    Write-Warn ".env.local tidak ditemukan di $envLocalPath"
    Write-Host "  Tambahkan baris berikut ke web-dashboard/.env.local secara manual:" -ForegroundColor Yellow
    Write-Host "    BEHIND_PROXY=cloudflare" -ForegroundColor Gray
    Write-Host "    NEXT_PUBLIC_YOLO_WS_URL=wss://$hostWS" -ForegroundColor Gray
    Write-Host "    NEXTAUTH_URL=https://$hostDash" -ForegroundColor Gray
    Write-Host "    NODE_ENV=production" -ForegroundColor Gray
}

# ─── Step 5b: Install Windows Service (opsional) ──────────
if ($InstallService) {
    Write-Step "Step 5b/5 — Install sebagai Windows Service (butuh Administrator)"

    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Err "Script tidak dijalankan sebagai Administrator."
        Write-Host "  Jalankan ulang PowerShell sebagai Administrator lalu:" -ForegroundColor Yellow
        Write-Host "    .\setup-tunnel.ps1 -InstallService -SkipLogin" -ForegroundColor Gray
    } else {
        & cloudflared service install
        if ($LASTEXITCODE -ne 0) {
            Write-Warn "service install mungkin sudah ada. Mencoba start..."
        } else {
            Write-Ok "Service diinstall."
        }

        Start-Service cloudflared -ErrorAction SilentlyContinue
        $svc = Get-Service cloudflared -ErrorAction SilentlyContinue
        if ($svc -and $svc.Status -eq "Running") {
            Write-Ok "Service cloudflared berjalan."
        } else {
            Write-Warn "Service belum berjalan. Cek log: cloudflared service log"
        }
    }
} else {
    Write-Host ""
    Write-Warn "Install service dilewati. Untuk install, jalankan sebagai Administrator:"
    Write-Host "    .\setup-tunnel.ps1 -InstallService -SkipLogin" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Atau jalankan manual untuk sesi ini saja:" -ForegroundColor White
    Write-Host "    cloudflared tunnel run $tunnelName" -ForegroundColor Gray
}

# ─── Summary ──────────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Setup selesai! Ringkasan:" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Tunnel name    : $tunnelName" -ForegroundColor White
Write-Host "  Tunnel UUID    : $uuid" -ForegroundColor White
Write-Host "  Dashboard URL  : https://$hostDash" -ForegroundColor White
Write-Host "  WebSocket URL  : wss://$hostWS" -ForegroundColor White
Write-Host "  config.yml     : $configPath" -ForegroundColor White
Write-Host ""
Write-Host "  Langkah selanjutnya:" -ForegroundColor Yellow
Write-Host "    1. Rebuild Next.js: cd ..\\ && npm run build && npm start" -ForegroundColor Gray
Write-Host "    2. Jalankan tunnel: cloudflared tunnel run $tunnelName" -ForegroundColor Gray
Write-Host "       (atau gunakan service jika sudah diinstall)" -ForegroundColor Gray
Write-Host "    3. Verifikasi: cloudflared tunnel info $tunnelName" -ForegroundColor Gray
Write-Host "    4. Test akses: https://$hostDash/api/health" -ForegroundColor Gray
Write-Host ""
Write-Host "  Lihat SETUP.md di folder ini untuk panduan lengkap." -ForegroundColor White
Write-Host ""
