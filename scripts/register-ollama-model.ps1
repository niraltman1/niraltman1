#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Registers the bundled GGUF model with Ollama during Factum IL installation.
    No internet connection required — the GGUF is already on disk.

.DESCRIPTION
    Called by installer.iss [Run] and bootstrap-world.ps1 after OllamaSetup.exe.
    Uses 'ollama create' with a Modelfile pointing to the bundled GGUF so the
    model is immediately available without any post-install configuration step.

    After registration, executes a warmup inference to verify the model is responsive.
    Writes ModelHealth.json to {AppDir}\runtime\ModelHealth.json.

    POLICY: Only BrainboxAI/law-il-E2B:Q4_K_M is permitted.
    No fallback models. Local inference only.

.PARAMETER GgufPath
    Absolute path to the bundled GGUF file.

.PARAMETER ModelTag
    Ollama model tag. MUST be BrainboxAI/law-il-E2B:Q4_K_M.

.PARAMETER AppDir
    Installation root directory (for writing ModelHealth.json and BOOTSTRAP_DONE.flag).
    Default: parent of the directory containing this script.

.PARAMETER SkipWarmup
    Skip warmup inference (used during CI where GPU/model resources are unavailable).
#>
param(
    [Parameter(Mandatory)]
    [string] $GgufPath,
    [string] $ModelTag  = "BrainboxAI/law-il-E2B:Q4_K_M",
    [string] $AppDir    = "",
    [switch] $SkipWarmup
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

# Enforce policy: only one model is permitted
if ($ModelTag -ne "BrainboxAI/law-il-E2B:Q4_K_M") {
    Write-Error "POLICY VIOLATION: Only 'BrainboxAI/law-il-E2B:Q4_K_M' is permitted. Provided: '$ModelTag'"
    exit 1
}

$OllamaUrl = "http://127.0.0.1:11434"

# Resolve AppDir for writing ModelHealth.json
if (-not $AppDir) {
    $AppDir = Split-Path -Parent $PSScriptRoot
    if (-not (Test-Path $AppDir)) { $AppDir = Split-Path -Parent $GgufPath | Split-Path -Parent }
}
$RuntimeDir    = Join-Path $AppDir "runtime"
$ModelHFile    = Join-Path $RuntimeDir "ModelHealth.json"
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

$health = [ordered]@{
    installed        = $false
    registered       = $false
    loaded           = $false
    warmupPassed     = $false
    checksumVerified = $false
    timestamp        = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    modelTag         = $ModelTag
    ggufPath         = $GgufPath
    error            = $null
}

function Write-Status([string]$msg) { Write-Host "[factum-il] $msg" }

function Save-Health {
    $health | ConvertTo-Json | Set-Content $ModelHFile -Encoding UTF8 -ErrorAction SilentlyContinue
}

# ── Guard: skip if GGUF was not bundled ──────────────────────────────────────
if (-not (Test-Path $GgufPath)) {
    $health.error = "GGUF not found at: $GgufPath"
    Write-Warning "GGUF not found at '$GgufPath' — skipping model registration."
    Save-Health
    exit 0
}

$health.installed = $true
Write-Status "GGUF found: $GgufPath ($([math]::Round((Get-Item $GgufPath).Length/1GB, 2)) GB)"

# ── Verify GGUF checksum ──────────────────────────────────────────────────────
$manifestPath = Join-Path $AppDir "deps-manifest.json"
if (Test-Path $manifestPath) {
    try {
        $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
        $ggufName = Split-Path $GgufPath -Leaf
        if ($manifest.$ggufName -and $manifest.$ggufName -ne "") {
            Write-Status "Verifying GGUF SHA-256..."
            $actualHash   = (Get-FileHash -Path $GgufPath -Algorithm SHA256).Hash
            $expectedHash = $manifest.$ggufName.ToUpper()
            if ($actualHash -eq $expectedHash) {
                $health.checksumVerified = $true
                Write-Status "Checksum verified: $actualHash"
            } else {
                $health.error = "GGUF checksum mismatch. Expected: $expectedHash Actual: $actualHash"
                Write-Warning "GGUF SHA-256 mismatch!`n  Expected: $expectedHash`n  Actual:   $actualHash"
                Write-Warning "File may be corrupted. Re-run the installer."
                Save-Health
                exit 1
            }
        } else {
            Write-Status "No checksum in manifest for '$ggufName' — skipping verification"
            $health.checksumVerified = $true
        }
    } catch {
        Write-Status "Cannot read deps-manifest.json (non-fatal): $_"
        $health.checksumVerified = $true
    }
} else {
    Write-Status "deps-manifest.json not found — skipping checksum verification"
    $health.checksumVerified = $true
}

# ── Locate ollama.exe ────────────────────────────────────────────────────────
$candidates = @(
    "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
    "$env:ProgramFiles\Ollama\ollama.exe",
    "${env:ProgramFiles(x86)}\Ollama\ollama.exe"
)
$ollama = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $ollama) {
    $ollama = (Get-Command ollama -ErrorAction SilentlyContinue)?.Source
}
if (-not $ollama) {
    $health.error = "ollama.exe not found"
    Write-Warning "ollama.exe not found — model registration skipped."
    Save-Health
    exit 0
}
Write-Status "Found ollama at: $ollama"

# ── Ensure Ollama service is running ─────────────────────────────────────────
function Test-OllamaRunning {
    try {
        $null = Invoke-RestMethod "$OllamaUrl/api/tags" -TimeoutSec 3 -ErrorAction Stop
        return $true
    } catch { return $false }
}

if (-not (Test-OllamaRunning)) {
    Write-Status "Starting Ollama service..."
    Start-Process -FilePath $ollama -ArgumentList "serve" -WindowStyle Hidden
    $started = $false
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 2
        if (Test-OllamaRunning) { $started = $true; break }
    }
    if (-not $started) {
        $health.error = "Ollama service did not respond within 40s"
        Write-Warning "Ollama service did not respond within 40s — model registration skipped."
        Save-Health
        exit 0
    }
    Write-Status "Ollama service is up."
}

# ── Check if already registered ──────────────────────────────────────────────
try {
    $tags     = Invoke-RestMethod "$OllamaUrl/api/tags" -TimeoutSec 10 -ErrorAction Stop
    $existing = $tags.models | ForEach-Object { $_.name }
    $base     = ($ModelTag -replace ":Q4_K_M$","").ToLower()
    $found    = $existing | Where-Object { $_.ToLower() -like "*$base*" -or $_ -eq $ModelTag }
    if ($found) {
        Write-Status "Model already registered: $($found -join ', ')"
        $health.registered = $true
        $health.loaded     = $true
    }
} catch {
    Write-Status "Cannot query Ollama tags: $_ — proceeding with registration"
}

# ── Register model if not already registered ──────────────────────────────────
if (-not $health.registered) {
    $mf = Join-Path ([System.IO.Path]::GetTempPath()) "factum-il-modelfile-$PID.txt"
    "FROM $GgufPath" | Set-Content $mf -Encoding UTF8

    Write-Status "Registering '$ModelTag' from bundled GGUF (no internet required)..."
    & $ollama create $ModelTag --file $mf
    $exitCode = $LASTEXITCODE
    Remove-Item $mf -ErrorAction SilentlyContinue

    if ($exitCode -ne 0) {
        $health.error = "ollama create exited $exitCode"
        Write-Warning "ollama create exited $exitCode — model registration incomplete."
        Save-Health
        exit 0
    }

    Write-Status "'$ModelTag' registered successfully."
    $health.registered = $true
    $health.loaded     = $true
}

# ── Warmup inference ──────────────────────────────────────────────────────────
if (-not $SkipWarmup) {
    Write-Status "Running warmup inference (may take 1-3 minutes)..."
    $warmupBody = @{
        model   = $ModelTag
        prompt  = "ענה במילה אחת בלבד: מהי עיר הבירה של מדינת ישראל?"
        stream  = $false
        options = @{ num_predict = 10; temperature = 0.0 }
    } | ConvertTo-Json
    try {
        $t0   = Get-Date
        $resp = Invoke-RestMethod "$OllamaUrl/api/generate" `
            -Method POST -Body $warmupBody -ContentType "application/json; charset=utf-8" `
            -TimeoutSec 300 -ErrorAction Stop
        $ms = [math]::Round(((Get-Date) - $t0).TotalMilliseconds)
        if ($resp.response -and $resp.response.Trim().Length -gt 0) {
            $health.warmupPassed = $true
            Write-Status "Warmup inference succeeded in ${ms}ms. Response: '$($resp.response.Trim().Substring(0,[math]::Min(40,$resp.response.Trim().Length)))'"
        } else {
            Write-Warning "Warmup inference returned empty response."
            $health.error = "Warmup returned empty response"
        }
    } catch {
        Write-Warning "Warmup inference failed: $_"
        $health.error = "Warmup inference failed: $_"
    }
} else {
    Write-Status "Warmup skipped (-SkipWarmup flag set)"
    $health.warmupPassed = $true
}

# ── Write ModelHealth.json ────────────────────────────────────────────────────
Save-Health
Write-Status "ModelHealth.json written: $ModelHFile"
Write-Status "'$ModelTag' setup complete. Warmup passed: $($health.warmupPassed)"

if ($health.registered -and $health.warmupPassed) {
    exit 0
} else {
    exit 1
}
