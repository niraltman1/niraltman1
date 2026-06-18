#Requires -Version 5.1
<#
.SYNOPSIS
    Factum IL — Installer, launcher, and environment bootstrapper.
.DESCRIPTION
    Installs all dependencies, sets up the office folder structure, initialises
    the database, builds the project, and creates a desktop shortcut.

    Modes:
      -Mode Install  (default) — fresh installation
      -Mode Repair   — re-validate and fix a broken install
      -Mode Upgrade  — upgrade components to latest supported versions

.EXAMPLE
    .\START-HERE.ps1
    .\START-HERE.ps1 -Mode Repair
    .\START-HERE.ps1 -Mode Upgrade -SkipModelPull
#>
[CmdletBinding()]
param(
    [ValidateSet('Install', 'Repair', 'Upgrade', 'Installer')]
    [string] $Mode = 'Install',
    [switch] $SkipModelPull,
    [switch] $Silent          # suppress interactive prompts (used by Inno Setup)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Host.UI.RawUI.WindowTitle = "Factum IL Installer"

# ─────────────────────────────────────────────
#  Auto-elevate to Administrator
# ─────────────────────────────────────────────

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "מפעיל עם הרשאות Administrator..." -ForegroundColor Yellow
    Start-Process PowerShell -ArgumentList `
        "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Mode $Mode$(if($SkipModelPull){' -SkipModelPull'})" `
        -Verb RunAs
    exit
}

# ─────────────────────────────────────────────
#  Load Config (office paths)
# ─────────────────────────────────────────────

$ConfigPath = Join-Path $PSScriptRoot '..\..\powershell\lib\Config.ps1'
if (Test-Path $ConfigPath) { . $ConfigPath }

$ProjectRoot  = Resolve-Path (Join-Path $PSScriptRoot '..\..')
# When run from inside the installed package (Installer mode) the EXE lives next to START-HERE.ps1
$DesktopExe   = if ($Mode -eq 'Installer') {
    Join-Path $PSScriptRoot 'FactumIL.exe'
} else {
    Join-Path $ProjectRoot 'dist\win-x64\shell\FactumIL.Desktop.exe'
}
$DesktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Factum IL.lnk'
# Root of the installed package (used for tools/ paths in Installer mode)
if ($Mode -eq 'Installer' -and -not $Script:FactumIL_Root) {
    $Script:FactumIL_Root = $PSScriptRoot
}

# ─────────────────────────────────────────────
#  Logging
# ─────────────────────────────────────────────

function Write-Step { param([string]$M) Write-Host ">> $M" -ForegroundColor Magenta }
function Write-Ok   { param([string]$M) Write-Host "[OK] $M" -ForegroundColor Green }
function Write-Warn { param([string]$M) Write-Host "[WARN] $M" -ForegroundColor Yellow }
function Write-Err  { param([string]$M) Write-Host "[ERR] $M" -ForegroundColor Red }

# ─────────────────────────────────────────────
#  Banner
# ─────────────────────────────────────────────

Write-Host @"

  ╔══════════════════════════════════════════════════════╗
  ║          F a c t u m - I L   v1.0.0                 ║
  ║     אלטמן משרד עורכי דין — סדר 2026                 ║
  ╚══════════════════════════════════════════════════════╝
  Mode: $Mode

"@ -ForegroundColor Cyan

# ─────────────────────────────────────────────
#  winget packages
# ─────────────────────────────────────────────

$WingetPackages = [ordered]@{
    'Node.js LTS'  = 'OpenJS.NodeJS.LTS'
    'Git'          = 'Git.Git'
    'FFmpeg'       = 'Gyan.FFmpeg'
    'Tesseract'    = 'UB-Mannheim.TesseractOCR'
    'Ghostscript'  = 'ArtifexSoftware.GhostScript'
    'Ollama'       = 'Ollama.Ollama'
    '.NET 8'       = 'Microsoft.DotNet.Runtime.8'
}

function Install-WingetPackage {
    param([string]$Name, [string]$Id)
    Write-Step "Checking $Name ($Id)..."
    $list = winget list --id $Id --exact --accept-source-agreements 2>&1
    if ($LASTEXITCODE -eq 0 -and ($list -match [regex]::Escape($Id))) {
        Write-Ok "$Name already installed."
        return
    }
    winget install --id $Id --exact --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw "winget failed to install $Name" }
    Write-Ok "$Name installed."
}

function Install-AllDependencies {
    Write-Step "Checking winget..."
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Err "winget not found. Install 'App Installer' from the Microsoft Store."
        exit 1
    }
    foreach ($pkg in $WingetPackages.GetEnumerator()) {
        Install-WingetPackage -Name $pkg.Key -Id $pkg.Value
    }

    # Refresh PATH so node/npm are available immediately
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('Path', 'User')

    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        Write-Step "Installing pnpm..."
        npm install -g pnpm@9.4.0
        if ($LASTEXITCODE -ne 0) { throw "pnpm installation failed" }
        Write-Ok "pnpm installed."
    }
}

# ─────────────────────────────────────────────
#  Tesseract Hebrew data
# ─────────────────────────────────────────────

function Install-HebrewData {
    Write-Step "Checking Tesseract Hebrew language data..."
    $tess = (Get-Command tesseract -ErrorAction SilentlyContinue)?.Source
    if (-not $tess) { Write-Warn "tesseract not in PATH — reboot may be required."; return }

    $tessData = Join-Path (Split-Path (Split-Path $tess)) 'tessdata'
    $heb      = Join-Path $tessData 'heb.traineddata'
    if (Test-Path $heb) { Write-Ok "Hebrew data present."; return }

    Write-Step "Downloading heb.traineddata..."
    Invoke-WebRequest -Uri 'https://github.com/tesseract-ocr/tessdata_best/raw/main/heb.traineddata' `
        -OutFile $heb -UseBasicParsing
    Write-Ok "Hebrew data installed."
}

# ─────────────────────────────────────────────
#  Ollama models (law-il-E2B via HF registry)
# ─────────────────────────────────────────────

# ─────────────────────────────────────────────
#  Hardware-aware AI provisioning
# ─────────────────────────────────────────────

function Invoke-SystemCheck {
    $checkScript = Join-Path $PSScriptRoot '..\..\powershell\scripts\01-SystemCheck.ps1'
    if (Test-Path $checkScript) {
        Write-Step "בודק תצורת חומרה..."
        . $checkScript
    } else {
        Write-Warn "01-SystemCheck.ps1 not found — using standard defaults."
        $Script:AI_TIER       = 'standard'
        $Script:AI_BASE_MODEL = 'gemma2:9b'
        $Script:AI_MODELFILE  = 'Modelfile.gemma2'
        $Script:AI_ALIAS      = 'legal-brain'
        [System.Environment]::SetEnvironmentVariable('AI_TIER', 'standard', 'Machine')
    }
}

function Ensure-Ollama {
    Write-Step "בודק Ollama..."
    $ollamaExe = Get-Command ollama -ErrorAction SilentlyContinue
    if ($ollamaExe) { Write-Ok "Ollama כבר מותקן ($($ollamaExe.Source))."; return }

    # Try bundled installer first (Inno Setup placed it in tools/)
    $bundled = @(
        Join-Path $PSScriptRoot 'tools\OllamaSetup.exe',
        Join-Path $PSScriptRoot '..\tools\OllamaSetup.exe',
        Join-Path $ProjectRoot  'dist-package\tools\OllamaSetup.exe'
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if ($bundled) {
        Write-Step "מתקין Ollama מהחבילה המצורפת..."
        Start-Process $bundled -ArgumentList '/S' -Wait
    } else {
        Write-Step "מוריד ומתקין Ollama..."
        $tmp = "$env:TEMP\OllamaSetup.exe"
        Invoke-WebRequest 'https://ollama.com/download/OllamaSetup.exe' -OutFile $tmp -UseBasicParsing
        Start-Process $tmp -ArgumentList '/S' -Wait
        Remove-Item $tmp -Force
    }

    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('Path', 'User')

    if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
        Write-Warn "Ollama לא נמצא ב-PATH לאחר ההתקנה — ייתכן שנדרשת אתחול מחדש."
    } else {
        Write-Ok "Ollama הותקן בהצלחה."
    }
}

function Verify-EnvPaths {
    Write-Step "מאמת נתיבי כלים..."
    $whisperExe = [System.Environment]::GetEnvironmentVariable('WHISPER_EXE', 'Machine') ?? $env:WHISPER_EXE
    $ffmpegExe  = [System.Environment]::GetEnvironmentVariable('FFMPEG_EXE',  'Machine') ?? 'ffmpeg'

    if (-not $whisperExe -or -not (Test-Path $whisperExe -ErrorAction SilentlyContinue)) {
        Write-Warn "WHISPER_EXE not set or file missing ($whisperExe) — calling Install-WhisperFast."
        Install-WhisperFast
    } else {
        Write-Ok "WHISPER_EXE → $whisperExe"
    }

    $ffmpegFound = (Get-Command $ffmpegExe -ErrorAction SilentlyContinue) -or (Test-Path $ffmpegExe -ErrorAction SilentlyContinue)
    if (-not $ffmpegFound) {
        Write-Warn "ffmpeg not found — attempting winget install..."
        winget install --id Gyan.FFmpeg --exact --silent --accept-package-agreements --accept-source-agreements
    } else {
        Write-Ok "FFMPEG_EXE → $ffmpegExe"
    }

    $ollamaModel = [System.Environment]::GetEnvironmentVariable('OLLAMA_MODEL', 'Machine') ?? $env:OLLAMA_MODEL
    $expectedModel = 'BrainboxAI/law-il-E2B:Q4_K_M'
    if ($ollamaModel -ne $expectedModel) {
        Write-Warn "OLLAMA_MODEL = '$ollamaModel' (expected '$expectedModel') — 02-SetupAIModels will correct this."
    } else {
        Write-Ok "OLLAMA_MODEL = $expectedModel"
    }
}

function Initialize-OllamaModels {
    if ($SkipModelPull) { Write-Warn "Skipping Ollama model pull (-SkipModelPull)."; return }
    Ensure-Ollama
    $setupScript = if ($Mode -eq 'Installer') {
        Join-Path $PSScriptRoot '02-SetupAIModels.ps1'
    } else {
        Join-Path $PSScriptRoot '..\..\powershell\scripts\02-SetupAIModels.ps1'
    }
    if (Test-Path $setupScript) {
        Write-Step "מתקין מנוע AI (BrainboxAI/law-il-E2B:Q4_K_M)..."
        & $setupScript
    } else {
        Write-Warn "02-SetupAIModels.ps1 not found — model registration deferred to bootstrap-world.ps1."
        Write-Warn "bootstrap-world.ps1 will block application launch until the model is registered."
    }
}

# ─────────────────────────────────────────────
#  Whisper-fast download
# ─────────────────────────────────────────────

function Install-WhisperFast {
    if (-not $Script:FactumIL_Root) {
        Write-Warn "FactumIL_Root not defined — skipping Whisper-fast install."
        return
    }
    $toolsDir   = Join-Path $Script:FactumIL_Root 'tools'
    $whisperExe = Join-Path $toolsDir 'whisper-fast.exe'

    New-Item -ItemType Directory -Force $toolsDir | Out-Null

    if (-not (Test-Path $whisperExe)) {
        Write-Step "Downloading whisper-fast.exe..."
        $whisperUrl = 'https://github.com/Const-me/Whisper/releases/latest/download/main.exe'
        try {
            Invoke-WebRequest -Uri $whisperUrl -OutFile $whisperExe -UseBasicParsing -TimeoutSec 120
            Write-Ok "whisper-fast.exe downloaded to $whisperExe"
        } catch {
            Write-Warn "Whisper download failed: $_  — audio transcription will be skipped."
            return
        }
    } else {
        Write-Ok "whisper-fast.exe already present."
    }

    [System.Environment]::SetEnvironmentVariable('WHISPER_EXE', $whisperExe, 'Machine')
    Write-Ok "WHISPER_EXE set to $whisperExe"
}

# ─────────────────────────────────────────────
#  Global environment variables
# ─────────────────────────────────────────────

function Set-GlobalEnvironment {
    if ($Script:FactumIL_Root) {
        [System.Environment]::SetEnvironmentVariable('FACTUM_IL_ROOT', $Script:FactumIL_Root, 'Machine')
        Write-Ok "FACTUM_IL_ROOT = $Script:FactumIL_Root"
    }
    [System.Environment]::SetEnvironmentVariable('FFMPEG_EXE', 'ffmpeg', 'Machine')
    Write-Ok "FFMPEG_EXE = ffmpeg (PATH)"
    # Refresh PATH so ffmpeg is available immediately in current session
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('Path', 'User')
}

# ─────────────────────────────────────────────
#  Office folder structure + ACL
# ─────────────────────────────────────────────

function Initialize-OfficeStructure {
    $structureScript = Join-Path $PSScriptRoot '..\..\powershell\scripts\01-CreateFolderStructure.ps1'
    if (Test-Path $structureScript) {
        Write-Step "יוצר מבנה תיקיות משרד..."
        & $structureScript
    } else {
        Write-Warn "01-CreateFolderStructure.ps1 not found — skipping."
    }
}

# ─────────────────────────────────────────────
#  Build
# ─────────────────────────────────────────────

function Build-Project {
    Write-Step "Installing Node dependencies (pnpm install)..."
    Push-Location $ProjectRoot
    pnpm install
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

    Write-Step "Building (pnpm build)..."
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw "pnpm build failed" }
    Pop-Location

    Write-Step "Publishing desktop shell (dotnet publish)..."
    & (Join-Path $PSScriptRoot '..\..\apps\desktop\publish.ps1')
    if ($LASTEXITCODE -ne 0) { throw "Desktop publish failed" }

    Write-Ok "Build complete."
}

# ─────────────────────────────────────────────
#  Desktop shortcut
# ─────────────────────────────────────────────

function New-DesktopShortcut {
    if (-not (Test-Path $DesktopExe)) {
        Write-Warn "Executable not found at $DesktopExe — shortcut skipped."
        return
    }
    $wsh      = New-Object -ComObject WScript.Shell
    $shortcut = $wsh.CreateShortcut($DesktopShortcut)
    $shortcut.TargetPath       = $DesktopExe
    $shortcut.WorkingDirectory = Split-Path $DesktopExe
    $shortcut.Description      = "Factum IL — אלטמן משרד עורכי דין"
    $shortcut.Save()
    Write-Ok "קיצור דרך 'Factum IL' נוצר על שולחן העבודה."
}

# ─────────────────────────────────────────────
#  Smoke tests
# ─────────────────────────────────────────────

function Invoke-SmokeTests {
    Write-Step "Running smoke tests..."
    $pass = 0; $fail = 0
    $checks = @(
        @{ Name = 'Node.js';          Cmd = 'node --version'        },
        @{ Name = 'pnpm';             Cmd = 'pnpm --version'        },
        @{ Name = 'FFmpeg';           Cmd = 'ffmpeg -version'       },
        @{ Name = 'Tesseract';        Cmd = 'tesseract --version'   },
        @{ Name = 'Ghostscript';      Cmd = 'gswin64c --version'    },
        @{ Name = 'Ollama';           Cmd = 'ollama --version'      },
        @{ Name = 'Whisper-fast';     Cmd = "& '$env:WHISPER_EXE' --help 2>&1" }
    )
    foreach ($c in $checks) {
        try {
            $out = Invoke-Expression $c.Cmd 2>&1
            if ($LASTEXITCODE -eq 0 -or $out) { Write-Ok "  [PASS] $($c.Name)"; $pass++ }
            else { Write-Warn "  [WARN] $($c.Name)"; $fail++ }
        } catch { Write-Warn "  [WARN] $($c.Name) not in PATH"; $fail++ }
    }
    $level = if ($fail -gt 0) { 'WARN' } else { 'SUCCESS' }
    Write-Host "Smoke tests: $pass passed, $fail warnings." -ForegroundColor ($fail -gt 0 ? 'Yellow' : 'Green')
}

# ─────────────────────────────────────────────
#  Entry point
# ─────────────────────────────────────────────

switch ($Mode) {
    'Install' {
        Invoke-SystemCheck
        Install-AllDependencies
        Set-GlobalEnvironment
        Install-WhisperFast
        Install-HebrewData
        Initialize-OllamaModels
        Initialize-OfficeStructure
        Build-Project
        Invoke-SmokeTests
        New-DesktopShortcut

        Write-Host ""
        Write-Host "  ╔══════════════════════════════════════════╗" -ForegroundColor Green
        Write-Host "  ║  ההתקנה הסתיימה בהצלחה!                 ║" -ForegroundColor Green
        Write-Host "  ║  לחץ פעמיים על Factum IL בשולחן העבודה. ║" -ForegroundColor Green
        Write-Host "  ╚══════════════════════════════════════════╝" -ForegroundColor Green
        Write-Host ""

        if (-not $Silent -and (Test-Path $DesktopExe)) {
            $launch = Read-Host "הפעל את Factum IL עכשיו? (Y/n)"
            if ($launch -ne 'n') { Start-Process $DesktopExe }
        }
    }

    # ── Installer mode: called by Inno Setup post-install action ────────────
    'Installer' {
        Invoke-SystemCheck
        Set-GlobalEnvironment
        Install-WhisperFast
        Install-HebrewData
        Initialize-OllamaModels
        Verify-EnvPaths
        Invoke-SmokeTests
        New-DesktopShortcut
        Write-Ok "Post-install configuration complete."
    }

    'Repair' {
        Invoke-SystemCheck
        Install-AllDependencies
        Set-GlobalEnvironment
        Install-WhisperFast
        Install-HebrewData
        Initialize-OllamaModels
        Verify-EnvPaths
        Initialize-OfficeStructure
        Invoke-SmokeTests
        New-DesktopShortcut
        Write-Ok "Repair complete."
    }

    'Upgrade' {
        Write-Step "Upgrading components via winget..."
        foreach ($pkg in $WingetPackages.GetEnumerator()) {
            winget upgrade --id $pkg.Value --silent --accept-package-agreements --accept-source-agreements
        }
        Initialize-OllamaModels
        Build-Project
        New-DesktopShortcut
        Write-Ok "Upgrade complete."
    }
}
