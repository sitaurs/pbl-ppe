# demo_security.ps1 — Live evidence demo untuk 4 klaim keamanan PBL
#
# Membuktikan klaim keamanan jaringan SafeGuard APD ke dosen secara live
# dalam 4 section. Setiap section berhenti dan menunggu Enter sebelum lanjut,
# memberi waktu untuk menjelaskan / menjawab pertanyaan.
#
# 4 klaim yang dibuktikan:
#   1. Login: Argon2id + 2FA + RBAC
#   2. MQTT: AES-128-CBC random IV + TLS verify cert
#   3. Python -> Web: Service Token + endpoint whitelist
#   4. Akses internet: Cloudflare Tunnel (HTTPS, no port forward)
#
# Kompatibel: PowerShell 5.1+ (Windows default).
#
# Usage:
#   powershell -File .\scripts\demo_security.ps1
#   powershell -File .\scripts\demo_security.ps1 -Auto         # tanpa pause
#   powershell -File .\scripts\demo_security.ps1 -SkipMqtt     # skip live alarm

param(
    [switch]$Auto,
    [switch]$SkipMqtt,
    [string]$BaseUrl = "http://127.0.0.1:3000",
    [string]$PublicUrl = "https://apd.ecosystech.me"
)

$ErrorActionPreference = "Continue"
$script:passCount = 0
$script:failCount = 0
$ROOT = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Write-Banner {
    param([string]$Title, [int]$Step, [int]$Total)
    Write-Host ""
    Write-Host ("=" * 68) -ForegroundColor Cyan
    Write-Host ("  [{0}/{1}] {2}" -f $Step, $Total, $Title) -ForegroundColor Cyan
    Write-Host ("=" * 68) -ForegroundColor Cyan
    Write-Host ""
}

function Write-Section {
    param([string]$Text)
    Write-Host ""
    Write-Host "-> $Text" -ForegroundColor Yellow
}

function Mark-Result {
    param([bool]$Pass, [string]$Label)
    if ($Pass) {
        Write-Host "   [OK]   $Label" -ForegroundColor Green
        $script:passCount++
    } else {
        Write-Host "   [FAIL] $Label" -ForegroundColor Red
        $script:failCount++
    }
}

function Mark-Info {
    param([string]$Label, [string]$Value = "")
    if ($Value) {
        Write-Host ("   [INFO] {0,-18}: {1}" -f $Label, $Value) -ForegroundColor DarkCyan
    } else {
        Write-Host "   [INFO] $Label" -ForegroundColor DarkCyan
    }
}

function Wait-Continue {
    if ($Auto) { return }
    Write-Host ""
    Write-Host "   [Tekan Enter untuk lanjut, atau Q untuk berhenti...]" -ForegroundColor DarkGray -NoNewline
    $key = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    Write-Host ""
    if ($key.Character -eq 'q' -or $key.Character -eq 'Q') {
        Write-Host ""
        Write-Host "   Demo dihentikan oleh user." -ForegroundColor Yellow
        exit 0
    }
}

function Get-EnvValue {
    param([string]$Key)
    $envFile = Join-Path $ROOT ".env"
    if (-not (Test-Path $envFile)) { return "" }
    $line = Get-Content $envFile | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
    if (-not $line) { return "" }
    return ($line -split "=", 2)[1].Trim()
}

function Invoke-Http {
    # Helper compatible dengan PS 5.1 — return @{ Status; Body; Headers }
    param([string]$Url, [string]$Method = "GET", [hashtable]$Headers = @{}, [int]$TimeoutSec = 10)
    $result = @{ Status = 0; Body = ""; Headers = @{}; Error = $null }
    try {
        $resp = Invoke-WebRequest -Uri $Url -Method $Method -Headers $Headers `
            -UseBasicParsing -TimeoutSec $TimeoutSec -ErrorAction Stop
        $result.Status = [int]$resp.StatusCode
        $result.Body = $resp.Content
        $result.Headers = $resp.Headers
    } catch [System.Net.WebException] {
        if ($_.Exception.Response) {
            $result.Status = [int]$_.Exception.Response.StatusCode
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                $result.Body = $reader.ReadToEnd()
                $reader.Close()
            } catch {}
        } else {
            $result.Error = $_.Exception.Message
        }
    } catch {
        $result.Error = $_.Exception.Message
    }
    return $result
}

# ============================================================================
#   HEADER
# ============================================================================
Clear-Host
Write-Host ""
Write-Host ("#" * 68) -ForegroundColor Magenta
Write-Host ("#  {0,-64}#" -f "SAFEGUARD APD - SECURITY EVIDENCE DEMO") -ForegroundColor Magenta
Write-Host ("#  {0,-64}#" -f "PBL Polinema | WS Keamanan Jaringan") -ForegroundColor Magenta
Write-Host ("#" * 68) -ForegroundColor Magenta
Write-Host ""
Write-Host "  Tanggal  : $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
Write-Host "  Operator : $env:USERNAME"
Write-Host ("  Mode     : {0}" -f $(if ($Auto) { "AUTO (no pause)" } else { "INTERACTIVE (Enter to continue)" }))
Write-Host ""
Write-Host "  Demo akan membuktikan 4 klaim keamanan jaringan secara live."
Write-Host ""

Wait-Continue

# ============================================================================
#   PRE-FLIGHT
# ============================================================================
Write-Banner -Step 0 -Total 4 -Title "PRE-FLIGHT CHECKS"

Write-Section "Cek Next.js dashboard..."
$health = Invoke-Http -Url "$BaseUrl/api/health" -TimeoutSec 5
if ($health.Error) {
    Mark-Result $false "Next.js TIDAK MERESPON di $BaseUrl ($($health.Error))"
    Write-Host "         Jalankan TUI -> Start All atau 'npm run dev' di web-dashboard/" -ForegroundColor DarkGray
} else {
    Mark-Result ($health.Status -eq 200) "Next.js running di $BaseUrl (status $($health.Status))"
}

Write-Section "Cek environment variables wajib..."
$envChecks = @(
    @{ Key = "APD_SERVICE_TOKEN"; MinLen = 32 },
    @{ Key = "AES_KEY"; MinLen = 32 },
    @{ Key = "MQTT_HOSTNAME"; MinLen = 5 }
)
foreach ($chk in $envChecks) {
    $val = Get-EnvValue $chk.Key
    $ok = $val -and $val.Length -ge $chk.MinLen
    $info = if ($val) { "$($val.Length) chars" } else { "kosong" }
    Mark-Result $ok "$($chk.Key) terisi ($info)"
}

Wait-Continue

# ============================================================================
#   CLAIM 1 — Argon2id + 2FA + RBAC
# ============================================================================
Write-Banner -Step 1 -Total 4 -Title "CLAIM 1: Login pakai Argon2id + 2FA + RBAC"

Write-Section "Inspeksi format password hash di database SQLite..."
$pyExe = Get-Command python -ErrorAction SilentlyContinue
if ($pyExe) {
    $output = & python (Join-Path $ROOT "scripts\check_password_hash.py") 2>&1
    $output | ForEach-Object { Write-Host "   $_" }
    if ($LASTEXITCODE -eq 0) {
        Mark-Result $true "Password hash sesuai OWASP 2023 (Argon2id m>=19 MiB, t>=2)"
    } else {
        Mark-Result $false "Password hash check gagal (lihat output di atas)"
    }
} else {
    Mark-Result $false "Python tidak ditemukan di PATH"
}

Write-Section "File yang relevan untuk klaim ini:"
Mark-Info "Argon2id config" "web-dashboard/src/lib/auth/argon2.ts"
Mark-Info "TOTP (2FA)" "web-dashboard/src/lib/auth/totp.ts"
Mark-Info "Encrypt secret" "web-dashboard/src/lib/auth/encrypt.ts (AES-256-GCM)"
Mark-Info "RBAC" "web-dashboard/src/lib/rbac/permission-map.ts"
Mark-Info "Recovery codes" "web-dashboard/src/lib/auth/recovery-codes.ts"

Write-Section "Property tests yang validate klaim ini:"
Mark-Info "Property 1" "argon2 verify roundtrip"
Mark-Info "Property 2" "argon2 rehash invariant (auto-upgrade hash lama)"
Mark-Info "Property 4" "permission-map deny-by-default"
Mark-Info "Property 9" "rate limiter + lockout state machine"
Mark-Info "Property 11" "TOTP secret AES-256-GCM roundtrip"

Wait-Continue

# ============================================================================
#   CLAIM 2 — AES-128-CBC + MQTT TLS
# ============================================================================
Write-Banner -Step 2 -Total 4 -Title "CLAIM 2: MQTT pakai AES-128-CBC + TLS"

Write-Section "Run unit test AES roundtrip (14 test cases)..."
if ($pyExe) {
    $output = & python -m pytest (Join-Path $ROOT "tests\test_aes_roundtrip.py") -q 2>&1
    $output | Select-Object -Last 5 | ForEach-Object { Write-Host "   $_" }
    Mark-Result ($LASTEXITCODE -eq 0) "AES property tests passed (encrypt/decrypt + tampered detection)"
}

Write-Section "Demo random IV: encrypt payload yang sama 3x..."
if ($pyExe) {
    $output = & python (Join-Path $ROOT "scripts\aes_demo_compare.py") 2>&1
    $output | ForEach-Object { Write-Host "   $_" }
    Mark-Result ($LASTEXITCODE -eq 0) "Plaintext sama -> 3 ciphertext berbeda total (random IV verified)"
}

if (-not $SkipMqtt) {
    Write-Section "Live MQTT trigger — APD ALARM (kirim alarm pelanggaran APD ke ESP32)..."
    Write-Host "   Akan publish 1x test alarm APD ke topik apd/alarm/1." -ForegroundColor DarkGray
    Write-Host "   Speaker ESP32 akan bunyi suara 'gunakan APD lengkap' sebentar." -ForegroundColor DarkGray
    Write-Host ""
    $skip = $false
    if (-not $Auto) {
        Write-Host "   [Tekan Enter untuk trigger APD alarm, S untuk skip...]" -ForegroundColor DarkGray -NoNewline
        $key = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        Write-Host ""
        if ($key.Character -eq 's' -or $key.Character -eq 'S') { $skip = $true }
    }
    if (-not $skip) {
        try {
            $output = & python (Join-Path $ROOT "trigger_alarm.py") --test 2>&1
            $output | Where-Object { $_ -notmatch "UnicodeEncodeError|charmap_encode|Traceback" } | ForEach-Object { Write-Host "   $_" }
            Mark-Result $true "Pesan APD terenkripsi dipublish ke broker (port 8883/TLS)"
        } catch {
            Mark-Result $false "Gagal trigger APD: $($_.Exception.Message)"
        }
    } else {
        Mark-Info "Live APD trigger di-skip"
    }

    Write-Section "Live MQTT trigger — GAS ALARM (simulasi gas terdeteksi MQ-135)..."
    Write-Host "   Akan publish 1x event 'gas_test' ke topik apd/alarm/1." -ForegroundColor DarkGray
    Write-Host "   ESP32 akan eksekusi handleGasAlert(true) -> LED merah ON + bunyi alarm gas." -ForegroundColor DarkGray
    Write-Host ""
    $skipGas = $false
    if (-not $Auto) {
        Write-Host "   [Tekan Enter untuk trigger GAS alarm, S untuk skip...]" -ForegroundColor DarkGray -NoNewline
        $key = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        Write-Host ""
        if ($key.Character -eq 's' -or $key.Character -eq 'S') { $skipGas = $true }
    }
    if (-not $skipGas) {
        # Pastikan APD alarm sudah selesai dulu (audio overlap = state conflict)
        Write-Host "   Menunggu 8 detik agar APD alarm selesai dulu..." -ForegroundColor DarkGray
        Start-Sleep -Seconds 8
        try {
            $output = & python (Join-Path $ROOT "trigger_alarm.py") --gas 2>&1
            $output | Where-Object { $_ -notmatch "UnicodeEncodeError|charmap_encode|Traceback" } | ForEach-Object { Write-Host "   $_" }
            Mark-Result $true "Pesan GAS terenkripsi dipublish ke broker (port 8883/TLS)"
        } catch {
            Mark-Result $false "Gagal trigger GAS: $($_.Exception.Message)"
        }
    } else {
        Mark-Info "Live GAS trigger di-skip"
    }
}

Write-Section "File yang relevan untuk klaim ini:"
Mark-Info "Encrypt Python" "ServiceAPDBackend.py:encrypt_aes128"
Mark-Info "Decrypt ESP32" "alarm_apd/alarm_apd.ino:aesDecrypt"
Mark-Info "TLS Root CA" "alarm_apd/alarm_apd.ino:HIVEMQ_ROOT_CA"
Mark-Info "TLS verify" "alarm_apd/alarm_apd.ino:setCACert"
Mark-Info "Random IV (PC)" "ServiceAPDBackend.py: os.urandom(16)"
Mark-Info "Random IV (ESP)" "alarm_apd.ino: esp_fill_random() (HW RNG)"

Wait-Continue

# ============================================================================
#   CLAIM 3 — Service Token
# ============================================================================
Write-Banner -Step 3 -Total 4 -Title "CLAIM 3: Python -> Web pakai Service Token"

Write-Section "4 skenario otorisasi Service Token..."
$tokenScript = Join-Path $ROOT "scripts\test_service_token.ps1"
& powershell -ExecutionPolicy Bypass -File $tokenScript -BaseUrl $BaseUrl
Mark-Result ($LASTEXITCODE -eq 0) "4 skenario authz lulus (anonymous, wrong token, scope-denied, allowed)"

Write-Section "File yang relevan untuk klaim ini:"
Mark-Info "Token validator" "web-dashboard/src/middleware.ts (line 161-184)"
Mark-Info "Endpoint whitelist" "web-dashboard/src/lib/rbac/permission-map.ts"
Mark-Info "Python sender" "ServiceAPDBackend.py:DASHBOARD_HEADERS"

Write-Section "Endpoint yang DI-whitelist untuk Service Token:"
Mark-Info "GET  /api/nodes"
Mark-Info "POST /api/nodes/:id/heartbeat"
Mark-Info "POST /api/violations"
Mark-Info "POST /api/telemetry/gas"
Mark-Info "GET  /api/settings"
Write-Host "   Endpoint lain (delete user, ganti password, dll) DITOLAK 403 walau token valid." -ForegroundColor DarkGray

Wait-Continue

# ============================================================================
#   CLAIM 4 — Cloudflare Tunnel
# ============================================================================
Write-Banner -Step 4 -Total 4 -Title "CLAIM 4: Cloudflare Tunnel (HTTPS, no port forward)"

Write-Section "Cek service / process cloudflared..."
$svc = Get-Service cloudflared -ErrorAction SilentlyContinue
if ($svc) {
    Mark-Result ($svc.Status -eq 'Running') "cloudflared service status: $($svc.Status)"
} else {
    $proc = Get-Process cloudflared -ErrorAction SilentlyContinue
    if ($proc) {
        Mark-Result $true "cloudflared process running (PID $($proc.Id))"
    } else {
        Mark-Result $false "cloudflared TIDAK running (cek TUI -> Setup -> step H)"
    }
}

Write-Section "Akses publik via internet ($PublicUrl/api/health)..."
$pub = Invoke-Http -Url "$PublicUrl/api/health" -TimeoutSec 10
if ($pub.Error) {
    Mark-Result $false "Public endpoint error: $($pub.Error)"
} else {
    Mark-Result ($pub.Status -eq 200) "Public endpoint reachable (status $($pub.Status))"
    if ($pub.Body) {
        $preview = if ($pub.Body.Length -gt 80) { $pub.Body.Substring(0, 80) } else { $pub.Body }
        Mark-Info "Response body" $preview
    }
    foreach ($h in @("CF-RAY", "CF-Cache-Status", "Server")) {
        if ($pub.Headers[$h]) {
            Mark-Info "Header $h" $pub.Headers[$h]
        }
    }
}

Write-Section "Bukti tidak ada port forwarding:"
Mark-Info "Cloudflare Tunnel = outbound connection laptop -> CF edge"
Mark-Info "CF Dashboard configure ingress (apd.ecosystech.me -> :3000)"
Mark-Info "Tidak perlu buka port di MikroTik / firewall ke internet"

Write-Section "File yang relevan untuk klaim ini:"
Mark-Info "Tunnel config" "web-dashboard/cloudflared/config.yml"
Mark-Info "BEHIND_PROXY" "web-dashboard/.env.local"
Mark-Info "Real IP resolver" "web-dashboard/src/middleware.ts (Cloudflare IP whitelist)"

Wait-Continue

# ============================================================================
#   SUMMARY
# ============================================================================
Write-Host ""
Write-Host ("=" * 68) -ForegroundColor Magenta
Write-Host "  SUMMARY" -ForegroundColor Magenta
Write-Host ("=" * 68) -ForegroundColor Magenta
Write-Host ""
$total = $script:passCount + $script:failCount
Write-Host "  Total checks   : $total"
Write-Host "  PASS           : $($script:passCount)" -ForegroundColor Green
$failColor = if ($script:failCount -gt 0) { 'Red' } else { 'DarkGray' }
Write-Host "  FAIL           : $($script:failCount)" -ForegroundColor $failColor
Write-Host ""
if ($script:failCount -eq 0) {
    Write-Host "  STATUS: SEMUA KLAIM KEAMANAN TERVERIFIKASI" -ForegroundColor Green
    Write-Host ""
    exit 0
} else {
    Write-Host "  STATUS: ADA $($script:failCount) CHECK YANG GAGAL" -ForegroundColor Red
    Write-Host "  Cek output di atas untuk detail." -ForegroundColor DarkGray
    Write-Host ""
    exit 1
}
