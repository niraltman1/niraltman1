#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Registers the bundled GGUF model with Ollama during Factum IL installation.
    No internet connection required — the GGUF is already on disk.

.DESCRIPTION
    Called by installer.iss [Run] after OllamaSetup.exe completes.
    Uses 'ollama create' with a Modelfile pointing to the bundled GGUF so the
    model is immediately available without any post-install configuration step.

.PARAMETER GgufPath
    Absolute path to the bundled GGUF file (e.g. C:\Program Files\FactumIL\models\...).

.PARAMETER ModelTag
    Ollama model tag to register under.
    Default: BrainboxAI/law-il-E2B:Q4_K_M  (the only permitted model for Factum IL).
#>
param(
    [Parameter(Mandatory)]
    [string] $GgufPath,
    [string] $ModelTag = "BrainboxAI/law-il-E2B:Q4_K_M"
)

$ErrorActionPreference = 'Stop'

function Write-Status([string]$msg) { Write-Host "[factum-il] $msg" }

# ── Guard: skip if GGUF was not bundled ──────────────────────────────────────
if (-not (Test-Path $GgufPath)) {
    Write-Status "GGUF not found at '$GgufPath' — skipping model registration (online mode)."
    exit 0
}

# ── Locate ollama.exe ────────────────────────────────────────────────────────
$candidates = @(
    "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
    "$env:ProgramFiles\Ollama\ollama.exe",
    "${env:ProgramFiles(x86)}\Ollama\ollama.exe"
)
$ollama = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $ollama) {
    Write-Warning "ollama.exe not found — model registration skipped."
    exit 0   # non-fatal: WPF OllamaService handles first-run fallback
}
Write-Status "Found ollama at: $ollama"

# ── Ensure Ollama service is running ─────────────────────────────────────────
function Test-OllamaRunning {
    try {
        $null = Invoke-RestMethod "http://127.0.0.1:11434/api/tags" -TimeoutSec 2 -EA Stop
        return $true
    } catch { return $false }
}

if (-not (Test-OllamaRunning)) {
    Write-Status "Starting Ollama service..."
    Start-Process -FilePath $ollama -ArgumentList "serve" -WindowStyle Hidden
    # Wait up to 30 s for the service to become responsive
    $started = $false
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 2
        if (Test-OllamaRunning) { $started = $true; break }
    }
    if (-not $started) {
        Write-Warning "Ollama service did not respond within 30 s — model registration skipped."
        exit 0   # non-fatal: WPF OllamaService handles first-run fallback
    }
    Write-Status "Ollama service is up."
}

# ── Write a temporary Modelfile pointing to the bundled GGUF ─────────────────
$mf = Join-Path ([System.IO.Path]::GetTempPath()) "factum-il-modelfile-$PID.txt"
"FROM $GgufPath" | Set-Content $mf -Encoding UTF8

# ── Register the model (no download — all data is on-disk) ───────────────────
Write-Status "Registering '$ModelTag' from bundled GGUF (no internet required)..."
& $ollama create $ModelTag --file $mf
$exitCode = $LASTEXITCODE

Remove-Item $mf -ErrorAction SilentlyContinue

if ($exitCode -ne 0) {
    Write-Warning "ollama create exited $exitCode — model registration incomplete."
    exit 0   # non-fatal: WPF OllamaService handles first-run fallback
}

Write-Status "'$ModelTag' registered successfully — Factum IL AI is ready."
exit 0
