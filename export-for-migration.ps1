# ============================================================
# export-for-migration.ps1
# Mengumpulkan seluruh konfigurasi + database + model ke satu
# folder `_export_bundle/` agar mudah dipindah ke laptop lain (NVIDIA).
#
# Cara pakai:
#   powershell -ExecutionPolicy Bypass -File export-for-migration.ps1
#
# Hasil: folder _export_bundle/ + _export_bundle.zip
# ============================================================

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$bundle = Join-Path $root "_export_bundle"

function Write-Step { param([string]$m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok   { param([string]$m) Write-Host "    [OK] $m" -ForegroundColor Green }
function Write-Warn { param([string]$m) Write-Host "    [!]  $m" -ForegroundColor Yellow }

# ── Bersihkan bundle lama ────────────────────────────────────
if (Test-Path $bundle) {
    Remove-Item -Recurse -Force $bundle
}
New-Item -ItemType Directory -Path $bundle | Out-Null
Write-Step "Folder bundle dibuat: $bundle"

# ── 1. Checkpoint WAL SQLite agar .db konsisten ──────────────
Write-Step "Checkpoint WAL SQLite"
$dbPath = Join-Path $root "web-dashboard\data\safeguard.db"
if (Test-Path $dbPath) {
    try {
        python -c "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('PRAGMA wal_checkpoint(TRUNCATE)'); c.close()" "$dbPath"
        Write-Ok "WAL checkpoint selesai"
    } catch {
        Write-Warn "Gagal checkpoint WAL (lewati): $_"
    }
} else {
    Write-Warn "Database tidak ditemukan di $dbPath"
}

# ── 2. Copy file konfigurasi env ─────────────────────────────
Write-Step "Copy konfigurasi (.env)"
$envFiles = @(
    @{ src = ".env";                       dst = "env_root.txt" }
    @{ src = "web-dashboard\.env.local";   dst = "env_local.txt" }
    @{ src = ".env.example";               dst = "env.example.txt" }
)
foreach ($f in $envFiles) {
    $srcPath = Join-Path $root $f.src
    if (Test-Path $srcPath) {
        Copy-Item $srcPath (Join-Path $bundle $f.dst)
        Write-Ok "$($f.src)  ->  $($f.dst)"
    } else {
        Write-Warn "$($f.src) tidak ada"
    }
}

# ── 3. Copy database + state files ───────────────────────────
Write-Step "Copy database SQLite + state"
$dataDst = Join-Path $bundle "data"
New-Item -ItemType Directory -Path $dataDst | Out-Null
$dataFiles = @("safeguard.db", "db.json", "settings.json", "violations.json", ".migrated")
foreach ($df in $dataFiles) {
    $srcPath = Join-Path $root "web-dashboard\data\$df"
    if (Test-Path $srcPath) {
        Copy-Item $srcPath (Join-Path $dataDst $df)
        Write-Ok "data\$df"
    }
}

# ── 4. Copy model YOLO (.pt) jika ada ────────────────────────
Write-Step "Copy model YOLO"
$modelDst = Join-Path $bundle "models"
New-Item -ItemType Directory -Path $modelDst | Out-Null
Get-ChildItem -Path $root -Filter "*.pt" -File | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $modelDst $_.Name)
    Write-Ok "model: $($_.Name) ($([math]::Round($_.Length/1MB,1)) MB)"
}
# Model hasil training di runs/ (kalau ada best.pt)
$runsBest = Get-ChildItem -Path (Join-Path $root "runs") -Filter "best.pt" -Recurse -File -ErrorAction SilentlyContinue
foreach ($b in $runsBest) {
    $rel = $b.FullName.Substring($root.Length).TrimStart('\')
    $safeName = ($rel -replace '[\\/]', '_')
    Copy-Item $b.FullName (Join-Path $modelDst $safeName)
    Write-Ok "trained model: $safeName"
}

# ── 5. Snapshot daftar dependency ────────────────────────────
Write-Step "Snapshot dependency Python (pip freeze)"
try {
    pip freeze | Out-File -Encoding UTF8 (Join-Path $bundle "pip-freeze.txt")
    Write-Ok "pip-freeze.txt"
} catch {
    Write-Warn "pip freeze gagal: $_"
}

# ── 6. Copy firmware config ESP32 ────────────────────────────
Write-Step "Copy firmware ESP32"
$fwDst = Join-Path $bundle "alarm_apd"
New-Item -ItemType Directory -Path $fwDst -Force | Out-Null
Copy-Item (Join-Path $root "alarm_apd\alarm_apd.ino") $fwDst -ErrorAction SilentlyContinue
$fwData = Join-Path $fwDst "data"
New-Item -ItemType Directory -Path $fwData -Force | Out-Null
Copy-Item (Join-Path $root "alarm_apd\data\apd_alert.mp3") $fwData -ErrorAction SilentlyContinue
Write-Ok "alarm_apd.ino + apd_alert.mp3"

# ── 7. Buat ZIP ──────────────────────────────────────────────
Write-Step "Membuat ZIP"
$zipPath = Join-Path $root "_export_bundle.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path "$bundle\*" -DestinationPath $zipPath
Write-Ok "ZIP dibuat: $zipPath ($([math]::Round((Get-Item $zipPath).Length/1MB,1)) MB)"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " EXPORT SELESAI" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Folder : $bundle" -ForegroundColor White
Write-Host "  ZIP    : $zipPath" -ForegroundColor White
Write-Host ""
Write-Host "  Pindahkan _export_bundle.zip ke laptop teman," -ForegroundColor Yellow
Write-Host "  lalu ikuti _export_bundle\SETUP-DI-PC-BARU.md" -ForegroundColor Yellow
Write-Host ""
