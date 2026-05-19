#Requires -Version 5.1
<#
.SYNOPSIS
    Hardware detection and AI tier selection for Factum IL.
    Sets $Script:AI_* variables consumed by 02-SetupAIModels.ps1 and START-HERE.ps1.
#>

function Write-Step { param([string]$M) Write-Host ">> $M" -ForegroundColor Magenta }
function Write-Ok   { param([string]$M) Write-Host "[OK] $M"   -ForegroundColor Green  }
function Write-Warn { param([string]$M) Write-Host "[WARN] $M" -ForegroundColor Yellow }

Write-Step "Detecting hardware profile..."

# ── RAM detection ──────────────────────────────────────────────────────────────
$ramBytes  = (Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue).TotalPhysicalMemory
$Script:HW_RAM_GB = if ($ramBytes) { [math]::Round($ramBytes / 1GB, 1) } else { 8 }

# ── GPU detection ──────────────────────────────────────────────────────────────
$gpu = Get-CimInstance -ClassName Win32_VideoController -ErrorAction SilentlyContinue |
       Select-Object -First 1
$Script:HW_GPU_NAME   = if ($gpu) { $gpu.Name } else { 'Unknown' }
$Script:HW_HAS_NVIDIA = ($Script:HW_GPU_NAME -match 'NVIDIA|GeForce|RTX|GTX|Quadro')

# ── Tier decision ──────────────────────────────────────────────────────────────
# High:     ≥16 GB → law-il-E2B (BrainboxAI, fine-tuned on Israeli law)
# Standard: 8–15 GB → gemma2:9b + Israeli Legal system prompt
# Low:      < 8 GB  → gemma2:2b + Israeli Legal system prompt

if ($Script:HW_RAM_GB -ge 16) {
    $Script:AI_TIER        = 'high'
    $Script:AI_BASE_MODEL  = 'hf.co/BrainboxAI/law-il-E2B:Q4_K_M'
    $Script:AI_MODELFILE   = 'Modelfile'
    $tierLabel             = "חומרה גבוהה → law-il-E2B"
} elseif ($Script:HW_RAM_GB -ge 8) {
    $Script:AI_TIER        = 'standard'
    $Script:AI_BASE_MODEL  = 'gemma2:9b'
    $Script:AI_MODELFILE   = 'Modelfile.gemma2'
    $tierLabel             = "סטנדרטי → gemma2:9b"
} else {
    $Script:AI_TIER        = 'low'
    $Script:AI_BASE_MODEL  = 'gemma2:2b'
    $Script:AI_MODELFILE   = 'Modelfile.gemma2'
    $tierLabel             = "בסיסי → gemma2:2b"
}

# Always use 'legal-brain' as the Ollama alias regardless of base model
$Script:AI_ALIAS = 'legal-brain'

# ── Print summary ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ┌────────────────────────────────────────────────┐" -ForegroundColor Cyan
Write-Host "  │  Factum IL Hardware Profile                     │" -ForegroundColor Cyan
Write-Host "  ├────────────────────────────────────────────────┤" -ForegroundColor Cyan
Write-Host "  │  RAM:   $($Script:HW_RAM_GB) GB$((' ' * [Math]::Max(0, 39 - $Script:HW_RAM_GB.ToString().Length)))│" -ForegroundColor Cyan
Write-Host "  │  GPU:   $($Script:HW_GPU_NAME.Substring(0, [Math]::Min(36, $Script:HW_GPU_NAME.Length)).PadRight(36)) │" -ForegroundColor Cyan
Write-Host "  │  NVIDIA: $($Script:HW_HAS_NVIDIA.ToString().PadRight(35)) │" -ForegroundColor Cyan
Write-Host "  │  Tier:  $($tierLabel.PadRight(37)) │" -ForegroundColor Cyan
Write-Host "  │  Alias: legal-brain                            │" -ForegroundColor Cyan
Write-Host "  └────────────────────────────────────────────────┘" -ForegroundColor Cyan
Write-Host ""

Write-Ok "Hardware profile ready: $tierLabel"

# Persist tier to machine environment for the API server to read at runtime
[System.Environment]::SetEnvironmentVariable('AI_TIER', $Script:AI_TIER, 'Machine')
