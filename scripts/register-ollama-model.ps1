#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Manual / recovery tool: registers the bundled GGUF model with Ollama.
    No internet connection required — the GGUF is already on disk.

.DESCRIPTION
    As of v1.0.0 model registration is performed automatically on FIRST LAUNCH by
    the WPF shell (BootstrapManager + OllamaService), which is resumable and
    retried with bounded timeouts. The installer no longer calls this script — it
    is retained for manual recovery (e.g. "repair installation" or offline setup).

    Uses 'ollama create' with a Modelfile pointing to the bundled GGUF so the model
    becomes available without any download. The 'ollama create' call is bounded by
    -TimeoutSec and retried up to -MaxRetries times so it can never hang forever.

.PARAMETER GgufPath
    Absolute path to the bundled GGUF file (e.g. C:\Program Files\FactumIL\models\...).

.PARAMETER ModelTag
    Ollama model tag to register under.
    Default: BrainboxAI/law-il-E2B:Q4_K_M  (the only permitted model for Factum IL).

.PARAMETER TimeoutSec
    Maximum seconds to wait for a single 'ollama create' attempt. Default: 1800 (30 min).

.PARAMETER MaxRetries
    How many times to retry 'ollama create' on failure/timeout. Default: 1.
#>
param(
    [Parameter(Mandatory)]
    [string] $GgufPath,
    [string] $ModelTag   = "BrainboxAI/law-il-E2B:Q4_K_M",
    [int]    $TimeoutSec = 1800,
    [int]    $MaxRetries = 1
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
# Each attempt runs in a background job bounded by $TimeoutSec so the registration
# can never block indefinitely. Retried up to $MaxRetries times on failure/timeout.
function Invoke-OllamaCreate {
    param([string]$Exe, [string]$Tag, [string]$ModelFile, [int]$TimeoutSec)

    $job = Start-Job -ScriptBlock {
        param($exe, $tag, $mf)
        & $exe create $tag --file $mf
        $LASTEXITCODE
    } -ArgumentList $Exe, $Tag, $ModelFile

    if (Wait-Job $job -Timeout $TimeoutSec) {
        $code = Receive-Job $job
        Remove-Job $job -Force -ErrorAction SilentlyContinue
        # Coerce the last emitted value to an int exit code.
        return [int]($code | Select-Object -Last 1)
    }

    Write-Warning "ollama create exceeded ${TimeoutSec}s — cancelling attempt."
    Stop-Job   $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
    return 124   # timeout sentinel
}

$exitCode = 1
for ($attempt = 0; $attempt -le $MaxRetries; $attempt++) {
    if ($attempt -gt 0) { Write-Status "Retrying model registration (attempt $($attempt + 1))…" }
    Write-Status "Registering '$ModelTag' from bundled GGUF (no internet required)..."
    $exitCode = Invoke-OllamaCreate -Exe $ollama -Tag $ModelTag -ModelFile $mf -TimeoutSec $TimeoutSec
    if ($exitCode -eq 0) { break }
}

Remove-Item $mf -ErrorAction SilentlyContinue

if ($exitCode -ne 0) {
    Write-Warning "ollama create did not complete (last exit $exitCode) — model registration incomplete."
    exit 0   # non-fatal: the WPF first-launch bootstrap will retry on next start
}

Write-Status "'$ModelTag' registered successfully — Factum IL AI is ready."
exit 0
