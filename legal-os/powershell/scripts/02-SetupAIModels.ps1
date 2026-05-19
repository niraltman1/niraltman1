#Requires -Version 5.1
<#
.SYNOPSIS
    Pull the hardware-appropriate AI base model and create the 'legal-brain' Ollama alias.
    Relies on $Script:AI_* variables populated by 01-SystemCheck.ps1.
    Falls back to gemma2:2b if both primary model and standard fallback fail.
#>

$ModelfileRoot = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Write-Step { param([string]$M) Write-Host ">> $M" -ForegroundColor Magenta }
function Write-Ok   { param([string]$M) Write-Host "[OK] $M"   -ForegroundColor Green  }
function Write-Warn { param([string]$M) Write-Host "[WARN] $M" -ForegroundColor Yellow }
function Write-Err  { param([string]$M) Write-Host "[ERR] $M"  -ForegroundColor Red    }

# ── Defaults (if called standalone without 01-SystemCheck having run) ──────────
if (-not $Script:AI_BASE_MODEL) {
    Write-Warn "Hardware profile not set — running 01-SystemCheck.ps1..."
    $checkScript = Join-Path $PSScriptRoot '01-SystemCheck.ps1'
    if (Test-Path $checkScript) { & $checkScript } else {
        $Script:AI_TIER       = 'standard'
        $Script:AI_BASE_MODEL = 'gemma2:9b'
        $Script:AI_MODELFILE  = 'Modelfile.gemma2'
        $Script:AI_ALIAS      = 'legal-brain'
    }
}

$PrimaryModel = $Script:AI_BASE_MODEL
$AliasName    = $Script:AI_ALIAS      # always 'legal-brain'
$ModelfileName = $Script:AI_MODELFILE  # 'Modelfile' or 'Modelfile.gemma2'
$ModelfilePath = Join-Path $ModelfileRoot $ModelfileName

if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
    Write-Warn "ollama not in PATH — skipping AI model setup."
    return
}

# ── Start Ollama service (idempotent) ──────────────────────────────────────────
Write-Step "Starting Ollama service..."
Start-Process 'ollama' -ArgumentList 'serve' -WindowStyle Hidden -ErrorAction SilentlyContinue
Start-Sleep -Seconds 4

# ── For low-end tier: rewrite FROM line in Modelfile.gemma2 to gemma2:2b ──────
if ($Script:AI_TIER -eq 'low' -and (Test-Path $ModelfilePath)) {
    Write-Step "Low-end hardware: patching Modelfile.gemma2 to use gemma2:2b..."
    $content = Get-Content $ModelfilePath -Raw
    $content = $content -replace '^FROM gemma2:\w+', 'FROM gemma2:2b'
    Set-Content $ModelfilePath -Value $content -Encoding UTF8 -NoNewline
    Write-Ok "Modelfile.gemma2 patched → FROM gemma2:2b"
}

# ── Pull base model ────────────────────────────────────────────────────────────
Write-Step "Pulling base model '$PrimaryModel' (Tier: $Script:AI_TIER)..."
ollama pull $PrimaryModel 2>&1 | Out-Null
$primaryOk = ($LASTEXITCODE -eq 0)

if (-not $primaryOk) {
    Write-Warn "Pull of '$PrimaryModel' failed — trying gemma2:2b as last resort..."
    ollama pull 'gemma2:2b' 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Err "All model pulls failed. AI features will be unavailable."
        [System.Environment]::SetEnvironmentVariable('OLLAMA_MODEL', 'legal-brain', 'Machine')
        return
    }
    $PrimaryModel  = 'gemma2:2b'
    $ModelfileName = 'Modelfile.gemma2'
    $ModelfilePath = Join-Path $ModelfileRoot $ModelfileName
    Write-Ok "gemma2:2b ready (minimal fallback)."
} else {
    Write-Ok "Model '$PrimaryModel' downloaded."
}

# ── Create 'legal-brain' alias ─────────────────────────────────────────────────
if (Test-Path $ModelfilePath) {
    Write-Step "Creating Ollama alias '$AliasName' from $ModelfileName..."
    ollama create $AliasName -f $ModelfilePath
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Alias '$AliasName' registered — Israeli Legal Brain ready."
    } else {
        Write-Warn "Alias creation failed; '$PrimaryModel' will be used directly."
        [System.Environment]::SetEnvironmentVariable('OLLAMA_MODEL', $PrimaryModel, 'Machine')
        return
    }
} else {
    Write-Warn "Modelfile '$ModelfileName' not found at $ModelfilePath — alias skipped."
    [System.Environment]::SetEnvironmentVariable('OLLAMA_MODEL', $PrimaryModel, 'Machine')
    return
}

# ── Set machine-level OLLAMA_MODEL = 'legal-brain' ────────────────────────────
[System.Environment]::SetEnvironmentVariable('OLLAMA_MODEL', $AliasName, 'Machine')
Write-Ok "OLLAMA_MODEL set to '$AliasName' (machine-level)."
Write-Host ""
Write-Host "  [AI] Tier: $Script:AI_TIER | Base: $PrimaryModel | Alias: $AliasName" -ForegroundColor Cyan
