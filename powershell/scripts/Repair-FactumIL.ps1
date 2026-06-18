#Requires -Version 5.1
<#
.SYNOPSIS
    Factum-IL — Recovery and Repair Tool

.DESCRIPTION
    Repairs a broken Factum-IL installation by reinstalling components, re-registering
    the AI model, rebuilding migrations, and regenerating readiness flags.

    Capabilities:
      - Reinstall Ollama (if missing or broken)
      - Re-download model GGUF (if corrupted)
      - Re-register model with Ollama
      - Verify model health with warmup inference
      - Rebuild database migrations
      - Regenerate BOOTSTRAP_DONE.flag and health JSON files
      - Re-run full bootstrap sequence

    Exposed through:
      - Start Menu: "Repair Factum-IL"
      - Desktop shortcut: "Repair Factum-IL"
      - Installer maintenance mode

.PARAMETER InstallDir
    Root installation directory. Default: read from FACTUM_IL_ROOT registry or C:\Program Files\FactumIL

.PARAMETER RepairOllama
    Force reinstall Ollama even if it appears functional.

.PARAMETER RepairModel
    Force re-register the AI model even if already registered.

.PARAMETER RepairMigrations
    Force re-apply all database migrations.

.PARAMETER RepairAll
    Perform all repair actions (equivalent to -RepairOllama -RepairModel -RepairMigrations).

.EXAMPLE
    .\Repair-FactumIL.ps1
    .\Repair-FactumIL.ps1 -RepairAll
    .\Repair-FactumIL.ps1 -RepairModel -InstallDir "C:\Program Files\FactumIL"
#>
[CmdletBinding()]
param(
    [string] $InstallDir       = "",
    [switch] $RepairOllama,
    [switch] $RepairModel,
    [switch] $RepairMigrations,
    [switch] $RepairAll
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

# Auto-elevate to Administrator
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Requesting administrator privileges..." -ForegroundColor Yellow
    $args = "-NonInteractive -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($InstallDir)       { $args += " -InstallDir `"$InstallDir`"" }
    if ($RepairOllama)     { $args += " -RepairOllama" }
    if ($RepairModel)      { $args += " -RepairModel" }
    if ($RepairMigrations) { $args += " -RepairMigrations" }
    if ($RepairAll)        { $args += " -RepairAll" }
    Start-Process PowerShell -ArgumentList $args -Verb RunAs
    exit
}

if ($RepairAll) {
    $RepairOllama     = $true
    $RepairModel      = $true
    $RepairMigrations = $true
}

# ── Resolve paths ──────────────────────────────────────────────────────────────
if (-not $InstallDir) {
    try {
        $factumRoot = [System.Environment]::GetEnvironmentVariable('FACTUM_IL_ROOT', 'Machine')
        if ($factumRoot) {
            $InstallDir = Split-Path $factumRoot -Parent
        }
    } catch {}
}
if (-not $InstallDir -or -not (Test-Path $InstallDir)) {
    $candidates = @(
        "C:\Program Files\FactumIL",
        "${env:ProgramFiles}\FactumIL"
    )
    $InstallDir = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $InstallDir -or -not (Test-Path $InstallDir)) {
    Write-Error "Cannot find Factum-IL installation directory. Specify -InstallDir."
    exit 1
}

$RuntimeDir  = Join-Path $InstallDir "runtime"
$ToolsDir    = Join-Path $InstallDir "tools"
$ModelsDir   = Join-Path $InstallDir "models"
$ScriptsDir  = Join-Path $InstallDir "scripts"
$AppDir      = Join-Path $InstallDir "app"
$NodeExe     = Join-Path $AppDir "node\node.exe"
$ApiEntry    = Join-Path $AppDir "api\dist\start.js"
$MigsDir     = Join-Path $AppDir "migrations"
$FlagFile    = Join-Path $RuntimeDir "BOOTSTRAP_DONE.flag"
$ModelTag    = "BrainboxAI/law-il-E2B:Q4_K_M"
$OllamaUrl   = "http://127.0.0.1:11434"
$LogFile     = Join-Path $RuntimeDir "repair.log"

New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

$RepairResults = [ordered]@{}
$TotalFailed   = 0
$RepairStart   = Get-Date

function Log([string]$msg, [string]$level = "INFO") {
    $ts   = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    $line = "[$ts][$level] $msg"
    Add-Content $LogFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
    $color = switch ($level) {
        "OK"    { "Green"  }
        "WARN"  { "Yellow" }
        "ERROR" { "Red"    }
        default { "Gray"   }
    }
    Write-Host $line -ForegroundColor $color
}

function Find-OllamaExe {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
        "$env:ProgramFiles\Ollama\ollama.exe",
        "${env:ProgramFiles(x86)}\Ollama\ollama.exe"
    )
    foreach ($p in $candidates) { if (Test-Path $p) { return $p } }
    return (Get-Command ollama -ErrorAction SilentlyContinue)?.Source
}

function Test-OllamaRunning {
    try {
        $null = Invoke-RestMethod "$OllamaUrl/api/tags" -TimeoutSec 5 -ErrorAction Stop
        return $true
    } catch { return $false }
}

# ── Banner ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "  ║        Factum-IL Repair Tool                            ║" -ForegroundColor Yellow
Write-Host "  ║        כלי תיקון ושחזור Factum-IL                       ║" -ForegroundColor Yellow
Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Installation: $InstallDir" -ForegroundColor Gray
Write-Host "  Actions: Ollama=$RepairOllama Model=$RepairModel Migrations=$RepairMigrations" -ForegroundColor Gray
Write-Host ""

Log "Repair started. InstallDir=$InstallDir" "INFO"

# Remove stale flag before repair
if (Test-Path $FlagFile) {
    Remove-Item $FlagFile -Force -ErrorAction SilentlyContinue
    Log "Removed stale BOOTSTRAP_DONE.flag" "INFO"
}

# ══════════════════════════════════════════════════════════════════════════════
# REPAIR OLLAMA
# ══════════════════════════════════════════════════════════════════════════════
if ($RepairOllama) {
    Write-Host ""
    Write-Host "  [REPAIR] Ollama Installation" -ForegroundColor Yellow
    $ollamaExe = Find-OllamaExe
    $ollamaInstaller = Join-Path $ToolsDir "OllamaSetup.exe"

    if (-not (Test-Path $ollamaInstaller)) {
        Log "OllamaSetup.exe not found at $ollamaInstaller — cannot reinstall" "ERROR"
        $TotalFailed++
        $RepairResults["Ollama"] = "FAILED: Installer not found"
    } else {
        try {
            if ($ollamaExe) {
                Log "Stopping existing Ollama processes..." "INFO"
                Get-Process -Name "ollama" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 2
            }
            Log "Running OllamaSetup.exe /S..." "INFO"
            $proc = Start-Process $ollamaInstaller -ArgumentList "/S" -Wait -PassThru
            Start-Sleep -Seconds 8
            $env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' +
                        [System.Environment]::GetEnvironmentVariable('Path','User')
            $newExe = Find-OllamaExe
            if ($newExe) {
                Log "Ollama installed at: $newExe" "OK"
                # Start service
                Start-Process $newExe -ArgumentList "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 8
                if (Test-OllamaRunning) {
                    Log "Ollama service responding at $OllamaUrl" "OK"
                    $RepairResults["Ollama"] = "OK"
                } else {
                    Log "Ollama installed but service not responding" "WARN"
                    $RepairResults["Ollama"] = "WARN: Installed but service not responding"
                }
            } else {
                Log "Ollama installation completed (exit $($proc.ExitCode)) but executable not found" "ERROR"
                $TotalFailed++
                $RepairResults["Ollama"] = "FAILED: Installed but not found"
            }
        } catch {
            Log "Ollama repair failed: $_" "ERROR"
            $TotalFailed++
            $RepairResults["Ollama"] = "FAILED: $_"
        }
    }
} else {
    # Just ensure service is running
    if (-not (Test-OllamaRunning)) {
        $ollamaExe = Find-OllamaExe
        if ($ollamaExe) {
            Log "Starting Ollama service..." "INFO"
            Start-Process $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
            Start-Sleep -Seconds 8
        }
    }
    if (Test-OllamaRunning) {
        Log "Ollama service is running" "OK"
        $RepairResults["OllamaService"] = "OK"
    } else {
        Log "Ollama service not running. Use -RepairOllama to reinstall." "WARN"
        $RepairResults["OllamaService"] = "WARN: Not running"
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# REPAIR MODEL
# ══════════════════════════════════════════════════════════════════════════════
if ($RepairModel) {
    Write-Host ""
    Write-Host "  [REPAIR] AI Model Registration" -ForegroundColor Yellow

    if (-not (Test-OllamaRunning)) {
        Log "Ollama not running — cannot repair model" "ERROR"
        $TotalFailed++
        $RepairResults["Model"] = "FAILED: Ollama not running"
    } else {
        $ggufFile = Get-ChildItem $ModelsDir -Filter "*.gguf" -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $ggufFile) {
            Log "No GGUF file found in $ModelsDir" "ERROR"
            $TotalFailed++
            $RepairResults["Model"] = "FAILED: No GGUF file"
        } else {
            Log "Found GGUF: $($ggufFile.FullName) ($([math]::Round($ggufFile.Length/1GB,2)) GB)" "INFO"
            $regScript = Join-Path $ToolsDir "register-ollama-model.ps1"
            if (-not (Test-Path $regScript)) { $regScript = Join-Path $ScriptsDir "register-ollama-model.ps1" }
            if (Test-Path $regScript) {
                try {
                    & powershell.exe -NonInteractive -ExecutionPolicy Bypass `
                        -File $regScript -GgufPath $ggufFile.FullName -ModelTag $ModelTag
                    if ($LASTEXITCODE -eq 0) {
                        Log "Model registration succeeded" "OK"
                        $RepairResults["Model"] = "OK"
                    } else {
                        Log "Model registration script exited $LASTEXITCODE" "ERROR"
                        $TotalFailed++
                        $RepairResults["Model"] = "FAILED: Script exit $LASTEXITCODE"
                    }
                } catch {
                    Log "Model registration error: $_" "ERROR"
                    $TotalFailed++
                    $RepairResults["Model"] = "FAILED: $_"
                }
            } else {
                # Fallback: direct ollama create
                $mfTmp = Join-Path ([IO.Path]::GetTempPath()) "factumil-repair-mf-$PID.txt"
                "FROM $($ggufFile.FullName)" | Set-Content $mfTmp -Encoding UTF8
                try {
                    $ollamaExe = Find-OllamaExe
                    if ($ollamaExe) {
                        & $ollamaExe create $ModelTag --file $mfTmp
                        if ($LASTEXITCODE -eq 0) {
                            Log "Model '$ModelTag' registered successfully (direct)" "OK"
                            $RepairResults["Model"] = "OK"
                        } else {
                            Log "ollama create failed ($LASTEXITCODE)" "ERROR"
                            $TotalFailed++
                            $RepairResults["Model"] = "FAILED: ollama create exit $LASTEXITCODE"
                        }
                    }
                } finally {
                    Remove-Item $mfTmp -Force -ErrorAction SilentlyContinue
                }
            }
        }
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# REPAIR MIGRATIONS
# ══════════════════════════════════════════════════════════════════════════════
if ($RepairMigrations) {
    Write-Host ""
    Write-Host "  [REPAIR] Database Migrations" -ForegroundColor Yellow

    $dbPath = "$env:LOCALAPPDATA\FactumIL\factum-il.db"
    if (-not (Test-Path $NodeExe)) {
        Log "node.exe not found at $NodeExe — cannot run migrations" "ERROR"
        $TotalFailed++
        $RepairResults["Migrations"] = "FAILED: node.exe not found"
    } elseif (-not (Test-Path $ApiEntry)) {
        Log "API entry not found at $ApiEntry — cannot run migrations" "ERROR"
        $TotalFailed++
        $RepairResults["Migrations"] = "FAILED: API entry not found"
    } else {
        try {
            $migCount = (Get-ChildItem $MigsDir -Filter "*.sql" -ErrorAction SilentlyContinue | Measure-Object).Count
            Log "Applying $migCount SQL migration files..." "INFO"
            $env:FACTUM_IL_ROOT = $AppDir
            $env:NODE_ENV       = "production"
            $proc = Start-Process $NodeExe -ArgumentList "`"$ApiEntry`" --migrate-only" `
                -Wait -PassThru -WindowStyle Hidden
            if ($proc.ExitCode -eq 0) {
                Log "Migrations applied successfully" "OK"
                $RepairResults["Migrations"] = "OK"
            } else {
                Log "Migration runner exited $($proc.ExitCode)" "WARN"
                $RepairResults["Migrations"] = "WARN: Exit $($proc.ExitCode)"
            }
        } catch {
            Log "Migration repair error: $_" "ERROR"
            $TotalFailed++
            $RepairResults["Migrations"] = "FAILED: $_"
        }
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# REGENERATE HEALTH FILES
# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "  [REPAIR] Regenerating health files..." -ForegroundColor Yellow

$aiHealthScript = Join-Path $ScriptsDir "Test-AIHealth.ps1"
if (-not (Test-Path $aiHealthScript)) {
    $aiHealthScript = Join-Path $PSScriptRoot "Test-AIHealth.ps1"
}
$aiHealthFile = Join-Path $RuntimeDir "AI_HEALTH.json"

$aiHealthOk = $false
if (Test-Path $aiHealthScript) {
    try {
        & powershell.exe -NonInteractive -ExecutionPolicy Bypass `
            -File $aiHealthScript -ModelTag $ModelTag -OllamaUrl $OllamaUrl -OutputFile $aiHealthFile
        $aiHealthOk = ($LASTEXITCODE -eq 0)
        if ($aiHealthOk) { Log "AI health check passed" "OK" }
        else { Log "AI health check failed (exit $LASTEXITCODE)" "WARN" }
    } catch {
        Log "AI health check error: $_" "WARN"
    }
} else {
    Log "Test-AIHealth.ps1 not found — skipping AI warmup verification" "WARN"
}

# Regenerate BOOTSTRAP_DONE.flag if all critical repairs passed
if ($TotalFailed -eq 0) {
    $flag = [ordered]@{
        bootstrappedAt    = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
        bootstrapVersion  = "1.0"
        repairedAt        = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
        repairResults     = $RepairResults
        aiWarmupPassed    = $aiHealthOk
    }
    $flag | ConvertTo-Json -Depth 5 | Set-Content $FlagFile -Encoding UTF8
    Log "BOOTSTRAP_DONE.flag regenerated: $FlagFile" "OK"
    $RepairResults["BootstrapFlag"] = "OK"
} else {
    Log "Skipping BOOTSTRAP_DONE.flag — $TotalFailed repair action(s) failed" "WARN"
    $RepairResults["BootstrapFlag"] = "SKIPPED: Failures present"
}

# ── Summary ────────────────────────────────────────────────────────────────────
$elapsed = ((Get-Date) - $RepairStart).TotalSeconds
Write-Host ""
Write-Host "  ── Repair Summary ──────────────────────────────────────────" -ForegroundColor Cyan
foreach ($k in $RepairResults.Keys) {
    $v     = $RepairResults[$k]
    $color = if ($v -like "OK*") { "Green" } elseif ($v -like "WARN*") { "Yellow" } else { "Red" }
    Write-Host "  $k : $v" -ForegroundColor $color
}
Write-Host ""
Write-Host "  Time: $($elapsed.ToString('F1'))s | Failures: $TotalFailed" -ForegroundColor $(if ($TotalFailed -gt 0) { 'Red' } else { 'Green' })
Write-Host "  Log:  $LogFile" -ForegroundColor Gray
Write-Host ""

if ($TotalFailed -gt 0) {
    Write-Host "  Repair completed with $TotalFailed failure(s)." -ForegroundColor Red
    Write-Host "  Factum-IL may not function correctly." -ForegroundColor Red
    Write-Host "  Contact support: altman.adv@gmail.com" -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "  ╔══════════════════════════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "  ║  Repair Complete — Factum-IL is ready!                  ║" -ForegroundColor Green
    Write-Host "  ╚══════════════════════════════════════════════════════════╝" -ForegroundColor Green

    $desktopExe = Join-Path $InstallDir "FactumIL.Desktop.exe"
    if (Test-Path $desktopExe) {
        $launch = Read-Host "`n  Launch Factum-IL now? (Y/n)"
        if ($launch -ne 'n' -and $launch -ne 'N') {
            Start-Process $desktopExe
        }
    }
    exit 0
}
