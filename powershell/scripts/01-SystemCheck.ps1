#Requires -Version 5.1
<#
.SYNOPSIS
    Hardware detection for Factum IL.
    Sets $Script:HW_* variables for informational purposes.

.DESCRIPTION
    Detects RAM, GPU, CPU cores, and disk space.
    Results are informational only — hardware tier does NOT influence model selection.

    POLICY: Only BrainboxAI/law-il-E2B:Q4_K_M is permitted for AI inference.
    Model selection is fixed regardless of hardware tier.
    See docs/AI_EXECUTION_POLICY.md for the full policy.
#>

function Write-Step { param([string]$M) Write-Host ">> $M" -ForegroundColor Magenta }
function Write-Ok   { param([string]$M) Write-Host "[OK] $M"   -ForegroundColor Green  }
function Write-Warn { param([string]$M) Write-Host "[WARN] $M" -ForegroundColor Yellow }

Write-Step "Detecting hardware profile..."

# ── RAM detection ──────────────────────────────────────────────────────────────
$ramBytes         = (Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue).TotalPhysicalMemory
$Script:HW_RAM_GB = if ($ramBytes) { [math]::Round($ramBytes / 1GB, 1) } else { 0 }

# ── GPU detection ──────────────────────────────────────────────────────────────
$gpu = Get-CimInstance -ClassName Win32_VideoController -ErrorAction SilentlyContinue |
       Select-Object -First 1
$Script:HW_GPU_NAME   = if ($gpu) { $gpu.Name } else { 'Unknown' }
$Script:HW_HAS_NVIDIA = ($Script:HW_GPU_NAME -match 'NVIDIA|GeForce|RTX|GTX|Quadro')

# ── CPU ────────────────────────────────────────────────────────────────────────
$cpu              = Get-CimInstance -ClassName Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
$Script:HW_CPU    = if ($cpu) { $cpu.Name } else { 'Unknown' }
$Script:HW_CORES  = if ($cpu) { $cpu.NumberOfLogicalProcessors } else { 0 }

# ── Disk ───────────────────────────────────────────────────────────────────────
try {
    $sysDrive     = (Get-PSDrive C -ErrorAction SilentlyContinue)
    $Script:HW_DISK_FREE_GB = if ($sysDrive) { [math]::Round($sysDrive.Free / 1GB, 1) } else { 0 }
} catch { $Script:HW_DISK_FREE_GB = 0 }

# ── Print summary (informational only) ────────────────────────────────────────
Write-Host ""
Write-Host "  ┌────────────────────────────────────────────────┐" -ForegroundColor Cyan
Write-Host "  │  Factum-IL Hardware Profile                    │" -ForegroundColor Cyan
Write-Host "  ├────────────────────────────────────────────────┤" -ForegroundColor Cyan
Write-Host "  │  RAM:    $($Script:HW_RAM_GB) GB$((' ' * [Math]::Max(0, 38 - $Script:HW_RAM_GB.ToString().Length)))│" -ForegroundColor Cyan
Write-Host "  │  Disk:   $($Script:HW_DISK_FREE_GB) GB free$((' ' * [Math]::Max(0, 33 - $Script:HW_DISK_FREE_GB.ToString().Length)))│" -ForegroundColor Cyan
Write-Host "  │  GPU:    $($Script:HW_GPU_NAME.Substring(0, [Math]::Min(33, $Script:HW_GPU_NAME.Length)).PadRight(33)) │" -ForegroundColor Cyan
Write-Host "  │  Cores:  $($Script:HW_CORES.ToString().PadRight(36)) │" -ForegroundColor Cyan
Write-Host "  │  Model:  BrainboxAI/law-il-E2B:Q4_K_M (fixed) │" -ForegroundColor Cyan
Write-Host "  └────────────────────────────────────────────────┘" -ForegroundColor Cyan
Write-Host ""

# Validate minimum requirements
if ($Script:HW_RAM_GB -gt 0 -and $Script:HW_RAM_GB -lt 8) {
    Write-Warn "RAM is $($Script:HW_RAM_GB) GB — minimum 8 GB required for AI model. Factum-IL may not function correctly."
} elseif ($Script:HW_RAM_GB -gt 0 -and $Script:HW_RAM_GB -lt 16) {
    Write-Warn "RAM is $($Script:HW_RAM_GB) GB — 16 GB recommended for best AI performance."
}

if ($Script:HW_DISK_FREE_GB -gt 0 -and $Script:HW_DISK_FREE_GB -lt 15) {
    Write-Warn "Only $($Script:HW_DISK_FREE_GB) GB free disk — 15 GB minimum required."
}

Write-Ok "Hardware profile detected. AI model: BrainboxAI/law-il-E2B:Q4_K_M (non-negotiable)."
