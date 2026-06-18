#Requires -Version 5.1
<#
.SYNOPSIS
    Factum-IL — System Requirements Validation

.DESCRIPTION
    Validates hardware and OS requirements before installation or bootstrap.
    Writes SYSTEM_HEALTH.json with detailed results.

    Requirements:
      Disk:  15 GB free (minimum)
      RAM:   16 GB recommended, 8 GB minimum (warn if below recommendation)
      CPU:   x64 required
      OS:    Windows 10 22H2 (19045)+ or Windows 11

.PARAMETER InstallDir
    Installation drive/directory used to check disk space. Default: C:\

.PARAMETER OutputFile
    Path to write SYSTEM_HEALTH.json. Default: runtime\SYSTEM_HEALTH.json

.PARAMETER Strict
    Exit with code 1 on any warning (used during CI build validation).

.EXAMPLE
    .\Test-SystemRequirements.ps1
    .\Test-SystemRequirements.ps1 -InstallDir "D:\" -Strict
#>
[CmdletBinding()]
param(
    [string] $InstallDir  = "C:\",
    [string] $OutputFile  = "",
    [switch] $Strict
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

if (-not $OutputFile) {
    $scriptDir  = $PSScriptRoot
    $runtimeDir = Join-Path (Resolve-Path (Join-Path $scriptDir '..\..')).Path "runtime"
    New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
    $OutputFile = Join-Path $runtimeDir "SYSTEM_HEALTH.json"
}

$Failures = 0
$Warnings = 0

$result = [ordered]@{
    timestamp         = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    diskFreeGB        = 0.0
    diskMeetsMinimum  = $false
    diskInstallDrive  = $InstallDir
    ramGB             = 0.0
    ramMeetsMinimum   = $false
    ramMeetsRecommended = $false
    cpuArch           = ""
    cpuSupported      = $false
    cpuCores          = 0
    osVersion         = ""
    osBuild           = 0
    osSupported       = $false
    dotNet8Present    = $false
    overallPass       = $false
    warnings          = @()
    errors            = @()
}

function Chk-Pass([string]$name) {
    Write-Host "  [PASS] $name" -ForegroundColor Green
}

function Chk-Warn([string]$name, [string]$detail) {
    $script:Warnings++
    $result.warnings += "$name : $detail"
    Write-Host "  [WARN] $name — $detail" -ForegroundColor Yellow
}

function Chk-Fail([string]$name, [string]$detail) {
    $script:Failures++
    $result.errors += "$name : $detail"
    Write-Host "  [FAIL] $name — $detail" -ForegroundColor Red
}

Write-Host ""
Write-Host "  ── Factum-IL System Requirements Check ────────────────────" -ForegroundColor Cyan
Write-Host ""

# ── CHECK 1: Disk space (minimum 15 GB free) ──────────────────────────────────
Write-Host "  Disk space..." -ForegroundColor Gray
try {
    $drive = $InstallDir.Substring(0, 2)
    $disk  = Get-PSDrive ($drive.TrimEnd(':')) -ErrorAction SilentlyContinue
    if (-not $disk) {
        $diskInfo = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='$drive'" -ErrorAction Stop
        $freeGB   = [math]::Round($diskInfo.FreeSpace / 1GB, 1)
    } else {
        $freeGB = [math]::Round($disk.Free / 1GB, 1)
    }
    $result.diskFreeGB = $freeGB
    if ($freeGB -ge 15) {
        $result.diskMeetsMinimum = $true
        Chk-Pass "Disk space: $freeGB GB free (minimum 15 GB)"
    } else {
        $result.diskMeetsMinimum = $false
        Chk-Fail "Disk space" "$freeGB GB free — minimum 15 GB required. Free up space on $drive."
    }
} catch {
    Chk-Fail "Disk space" "Cannot query disk space: $_"
}

# ── CHECK 2: RAM (minimum 8 GB, recommended 16 GB) ────────────────────────────
Write-Host "  RAM..." -ForegroundColor Gray
try {
    $cs    = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
    $ramGB = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1)
    $result.ramGB = $ramGB
    if ($ramGB -ge 16) {
        $result.ramMeetsMinimum     = $true
        $result.ramMeetsRecommended = $true
        Chk-Pass "RAM: $ramGB GB (meets 16 GB recommendation)"
    } elseif ($ramGB -ge 8) {
        $result.ramMeetsMinimum     = $true
        $result.ramMeetsRecommended = $false
        Chk-Warn "RAM" "$ramGB GB installed. 16 GB recommended for best AI performance. AI inference may be slow."
    } else {
        $result.ramMeetsMinimum     = $false
        $result.ramMeetsRecommended = $false
        Chk-Fail "RAM" "$ramGB GB installed — minimum 8 GB required. AI model cannot load."
    }
} catch {
    Chk-Fail "RAM" "Cannot query RAM: $_"
}

# ── CHECK 3: CPU architecture (x64 required) ─────────────────────────────────
Write-Host "  CPU architecture..." -ForegroundColor Gray
try {
    $cpuArch = $env:PROCESSOR_ARCHITECTURE
    $result.cpuArch = $cpuArch
    $proc = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc) { $result.cpuCores = $proc.NumberOfLogicalProcessors }
    if ($cpuArch -eq "AMD64" -or $cpuArch -eq "x86_64") {
        $result.cpuSupported = $true
        Chk-Pass "CPU: x64 ($cpuArch), $($result.cpuCores) logical cores"
    } else {
        $result.cpuSupported = $false
        Chk-Fail "CPU architecture" "Detected '$cpuArch' — x64 (AMD64) is required. ARM and 32-bit are not supported."
    }
} catch {
    Chk-Fail "CPU" "Cannot query CPU: $_"
}

# ── CHECK 4: OS Version (Windows 10 22H2 = 19045+, or Windows 11) ─────────────
Write-Host "  OS version..." -ForegroundColor Gray
try {
    $osInfo  = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    $verStr  = $osInfo.Version
    $buildNr = [int]($osInfo.BuildNumber)
    $result.osVersion = $verStr
    $result.osBuild   = $buildNr
    # Windows 10 22H2 = build 19045; Windows 11 21H2 = build 22000
    if ($buildNr -ge 19045) {
        $result.osSupported = $true
        $caption = $osInfo.Caption
        Chk-Pass "OS: $caption (build $buildNr)"
    } elseif ($buildNr -ge 17763) {
        # Windows 10 1809 (minimum in installer) but below 22H2
        $result.osSupported = $false
        Chk-Warn "OS version" "Build $buildNr detected — Windows 10 22H2 (build 19045) or later is recommended. Some features may not work correctly."
        $Warnings++
    } else {
        $result.osSupported = $false
        Chk-Fail "OS version" "Build $buildNr — Windows 10 22H2 (build 19045) or Windows 11 required."
    }
} catch {
    Chk-Fail "OS version" "Cannot query OS: $_"
}

# ── CHECK 5: .NET 8 Desktop Runtime ──────────────────────────────────────────
Write-Host "  .NET 8 Desktop Runtime..." -ForegroundColor Gray
try {
    $desktopDir = "${env:ProgramFiles}\dotnet\shared\Microsoft.WindowsDesktop.App"
    $dotNet8 = $false
    if (Test-Path $desktopDir) {
        $v8 = Get-ChildItem $desktopDir -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "8.*" }
        $dotNet8 = ($null -ne $v8 -and $v8.Count -gt 0)
    }
    if (-not $dotNet8) {
        try {
            $subKeys = $null
            [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey(
                'SOFTWARE\dotnet\Setup\InstalledVersions\x64\sharedfx\Microsoft.WindowsDesktop.App'
            )?.GetSubKeyNames() | ForEach-Object {
                if ($_ -like "8.*") { $dotNet8 = $true }
            }
        } catch {}
    }
    $result.dotNet8Present = $dotNet8
    if ($dotNet8) {
        Chk-Pass ".NET 8 Desktop Runtime: present"
    } else {
        Chk-Warn ".NET 8 Desktop Runtime" "Not detected. Required for WPF desktop shell. Install from: https://dotnet.microsoft.com/download/dotnet/8.0"
    }
} catch {
    Chk-Warn ".NET 8 Desktop Runtime" "Cannot query .NET installation: $_"
}

# ── Write results ──────────────────────────────────────────────────────────────
$result.overallPass = ($Failures -eq 0) -and ($Warnings -eq 0 -or -not $Strict)
$result | ConvertTo-Json -Depth 5 | Set-Content $OutputFile -Encoding UTF8

Write-Host ""
Write-Host "  ── System Health Summary ───────────────────────────────────" -ForegroundColor Cyan
Write-Host "  Failures: $Failures" -ForegroundColor $(if ($Failures -gt 0) { 'Red' } else { 'Green' })
Write-Host "  Warnings: $Warnings" -ForegroundColor $(if ($Warnings -gt 0) { 'Yellow' } else { 'Green' })
Write-Host "  Overall:  $(if ($result.overallPass) { 'PASS' } else { 'FAIL' })" -ForegroundColor $(if ($result.overallPass) { 'Green' } else { 'Red' })
Write-Host "  Report:   $OutputFile" -ForegroundColor Gray
Write-Host ""

if ($Failures -gt 0) {
    Write-Host "  SYSTEM DOES NOT MEET MINIMUM REQUIREMENTS." -ForegroundColor Red
    Write-Host "  Factum-IL cannot be installed on this machine." -ForegroundColor Red
    exit 1
} elseif ($Warnings -gt 0 -and $Strict) {
    Write-Host "  System has warnings (-Strict mode — treating as failure)." -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "  System meets requirements for Factum-IL." -ForegroundColor Green
    exit 0
}
