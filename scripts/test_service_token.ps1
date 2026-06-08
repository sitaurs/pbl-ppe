# test_service_token.ps1 — 4 skenario otorisasi Service Token
#
# Kompatibel dengan PowerShell 5.1 (tidak pakai -SkipHttpErrorCheck).
#
# Membuktikan bahwa middleware Next.js menerapkan deny-by-default + endpoint
# whitelist untuk Service Token.
#
# Usage:
#   powershell -File .\scripts\test_service_token.ps1

param(
    [string]$BaseUrl = "http://127.0.0.1:3000"
)

$ErrorActionPreference = "Continue"

# Read APD_SERVICE_TOKEN dari .env root
$envFile = Join-Path $PSScriptRoot "..\.env"
$token = ""
if (Test-Path $envFile) {
    $line = Get-Content $envFile | Where-Object { $_ -match "^APD_SERVICE_TOKEN=" } | Select-Object -First 1
    if ($line) { $token = ($line -split "=", 2)[1].Trim() }
}

if (-not $token) {
    Write-Host "  [FAIL] APD_SERVICE_TOKEN tidak ditemukan di .env" -ForegroundColor Red
    exit 1
}

Write-Host ("=" * 64)
Write-Host "  Service Token Authorization (4 Skenario)"
Write-Host ("=" * 64)
Write-Host ""
Write-Host "  Target: $BaseUrl"
Write-Host ("  Token : {0}...{1} ({2} chars)" -f $token.Substring(0, 8), $token.Substring($token.Length - 4), $token.Length)
Write-Host ""

function Invoke-StatusTest {
    param(
        [string]$Label,
        [string]$Url,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [int]$ExpectedStatus
    )

    $actualStatus = 0
    $actualBody = ""

    try {
        # PS 5.1: WebRequest throws on 4xx/5xx. Tangkap status dari exception.
        $resp = Invoke-WebRequest -Uri $Url -Method $Method -Headers $Headers `
            -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        $actualStatus = [int]$resp.StatusCode
        $actualBody = $resp.Content
    } catch [System.Net.WebException] {
        if ($_.Exception.Response) {
            $actualStatus = [int]$_.Exception.Response.StatusCode
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object System.IO.StreamReader($stream)
                $actualBody = $reader.ReadToEnd()
                $reader.Close()
            } catch {}
        } else {
            Write-Host "  [SKIP] $Label" -ForegroundColor Yellow
            Write-Host "         Network error: $($_.Exception.Message)" -ForegroundColor DarkGray
            Write-Host ""
            return $false
        }
    } catch {
        Write-Host "  [SKIP] $Label" -ForegroundColor Yellow
        Write-Host "         Error: $($_.Exception.Message)" -ForegroundColor DarkGray
        Write-Host ""
        return $false
    }

    $pass = $actualStatus -eq $ExpectedStatus
    $color = if ($pass) { "Green" } else { "Red" }
    $marker = if ($pass) { "[OK]  " } else { "[FAIL]" }

    Write-Host "  $marker $Label" -ForegroundColor $color
    Write-Host "         Method   : $Method"
    Write-Host "         URL      : $Url"
    Write-Host "         Expected : $ExpectedStatus"
    Write-Host "         Actual   : $actualStatus"
    if ($actualBody -and $actualBody.Length -lt 200) {
        Write-Host "         Body     : $actualBody" -ForegroundColor DarkGray
    }
    Write-Host ""
    return $pass
}

$results = @()

$results += Invoke-StatusTest `
    -Label "Skenario 1: Akses /api/nodes TANPA token" `
    -Url "$BaseUrl/api/nodes" `
    -ExpectedStatus 401

$results += Invoke-StatusTest `
    -Label "Skenario 2: Akses /api/nodes dengan token SALAH" `
    -Url "$BaseUrl/api/nodes" `
    -Headers @{ "Authorization" = "Bearer wrong_token_0123456789abcdef0123456789ab" } `
    -ExpectedStatus 401

$results += Invoke-StatusTest `
    -Label "Skenario 3: Token valid akses /api/users (NOT whitelisted)" `
    -Url "$BaseUrl/api/users" `
    -Headers @{ "Authorization" = "Bearer $token" } `
    -ExpectedStatus 403

$results += Invoke-StatusTest `
    -Label "Skenario 4: Token valid akses /api/nodes (whitelisted)" `
    -Url "$BaseUrl/api/nodes" `
    -Headers @{ "Authorization" = "Bearer $token" } `
    -ExpectedStatus 200

# Summary
$passCount = ($results | Where-Object { $_ -eq $true }).Count
$totalCount = $results.Count

Write-Host ("-" * 64)
Write-Host ("  Hasil: {0}/{1} skenario PASS" -f $passCount, $totalCount)
if ($passCount -eq $totalCount) {
    Write-Host "  -> Service Token + endpoint whitelist (deny-by-default) AKTIF" -ForegroundColor Green
    exit 0
} else {
    Write-Host "  -> Ada skenario yang gagal" -ForegroundColor Red
    exit 1
}
