#Requires -Version 5.1
<#
.SYNOPSIS
    Register the bundled BrainboxAI/law-il-E2B:Q4_K_M model with Ollama.

.DESCRIPTION
    Registers the bundled GGUF as the Factum-IL AI model with the local Ollama instance.
    This script does NOT pull models from the internet (except the initial Ollama install).
    The GGUF must already be present in the models/ directory.

    POLICY: Only BrainboxAI/law-il-E2B:Q4_K_M is permitted.
    No fallback models. No external AI providers. Local inference only.
    See docs/AI_EXECUTION_POLICY.md.

.PARAMETER GgufDir
    Directory containing the GGUF file. Default: {repo-root}\models\
    or {install-dir}\models\ depending on context.
#>
param(
    [string] $GgufDir = ""
)

$ModelTag  = "BrainboxAI/law-il-E2B:Q4_K_M"
$OllamaUrl = "http://127.0.0.1:11434"

function Write-Step { param([string]$M) Write-Host ">> $M"     -ForegroundColor Magenta }
function Write-Ok   { param([string]$M) Write-Host "[OK] $M"   -ForegroundColor Green  }
function Write-Warn { param([string]$M) Write-Host "[WARN] $M" -ForegroundColor Yellow }
function Write-Err  { param([string]$M) Write-Host "[ERR] $M"  -ForegroundColor Red    }

# ── Resolve GgufDir ────────────────────────────────────────────────────────────
if (-not $GgufDir) {
    $repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
    $GgufDir  = Join-Path $repoRoot "models"
    if (-not (Test-Path $GgufDir)) {
        # Try install layout
        $installRoot = Join-Path (Split-Path $PSScriptRoot) "models"
        if (Test-Path $installRoot) { $GgufDir = $installRoot }
    }
}

# ── Find GGUF ──────────────────────────────────────────────────────────────────
$ggufFile = $null
if (Test-Path $GgufDir) {
    $ggufFile = Get-ChildItem $GgufDir -Filter "*.gguf" -ErrorAction SilentlyContinue | Select-Object -First 1
}

if (-not $ggufFile) {
    Write-Warn "No GGUF file found in '$GgufDir'."
    Write-Warn "The model will need to be registered manually or via Repair-FactumIL.ps1."
    Write-Warn "bootstrap-world.ps1 will block application launch until the model is registered."
    exit 0
}

Write-Ok "Found GGUF: $($ggufFile.FullName) ($([math]::Round($ggufFile.Length/1GB,2)) GB)"

# ── Locate ollama.exe ──────────────────────────────────────────────────────────
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
    Write-Warn "ollama.exe not found. bootstrap-world.ps1 will install Ollama during first-run bootstrap."
    exit 0
}
Write-Ok "Ollama found: $ollama"

# ── Start Ollama service ───────────────────────────────────────────────────────
Write-Step "Starting Ollama service..."
Start-Process $ollama -ArgumentList "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue
$started = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 2
    try {
        $null = Invoke-RestMethod "$OllamaUrl/api/tags" -TimeoutSec 2 -ErrorAction Stop
        $started = $true; break
    } catch {}
}
if (-not $started) {
    Write-Warn "Ollama service did not respond within 30s — bootstrap-world.ps1 will retry."
    exit 0
}
Write-Ok "Ollama service is running."

# ── Check if already registered ────────────────────────────────────────────────
try {
    $tags     = Invoke-RestMethod "$OllamaUrl/api/tags" -TimeoutSec 10 -ErrorAction Stop
    $existing = $tags.models | ForEach-Object { $_.name }
    $searchBase = ($ModelTag -replace ":Q4_K_M$","").ToLower()
    $alreadyReg = $existing | Where-Object { $_.ToLower() -like "*$searchBase*" }
    if ($alreadyReg) {
        Write-Ok "Model already registered: $($alreadyReg -join ', ')"
        [System.Environment]::SetEnvironmentVariable('OLLAMA_MODEL', $ModelTag, 'Machine')
        exit 0
    }
} catch {
    Write-Warn "Cannot query Ollama tags: $_ — proceeding with registration."
}

# ── Register model from GGUF ───────────────────────────────────────────────────
Write-Step "Registering '$ModelTag' from bundled GGUF (no internet required)..."
$mfTmp = Join-Path ([IO.Path]::GetTempPath()) "factumil-modelfile-$PID.txt"
"FROM $($ggufFile.FullName)" | Set-Content $mfTmp -Encoding UTF8

try {
    & $ollama create $ModelTag --file $mfTmp
    $exitCode = $LASTEXITCODE
} finally {
    Remove-Item $mfTmp -Force -ErrorAction SilentlyContinue
}

if ($exitCode -ne 0) {
    Write-Warn "ollama create exited $exitCode — bootstrap-world.ps1 will retry during first-run bootstrap."
    exit 0
}

Write-Ok "'$ModelTag' registered successfully."
[System.Environment]::SetEnvironmentVariable('OLLAMA_MODEL', $ModelTag, 'Machine')
Write-Ok "OLLAMA_MODEL set to '$ModelTag' (machine-level)."
