#Requires -Version 5.1
<#
.SYNOPSIS
    Master build script — stages and compiles FactumIL_V13_Installer.exe.
    Place this file at the legal-os\ root and run it from anywhere.
.EXAMPLE
    .\Build-FactumIL.ps1
#>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'

# ── Resolve absolute paths from this script's own location ─────────────────────────────
# $PSScriptRoot is legal-os\ (the directory containing this script).
# Using absolute paths throughout avoids any Set-Location breakage.
$repoRoot   = $PSScriptRoot
$desktopDir = Join-Path $repoRoot 'apps\desktop'
$issPath    = Join-Path $repoRoot 'installer.iss'                        # canonical — NOT apps\installer\FactumIL.iss
$isccPath   = 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe'
$outputPath = Join-Path $repoRoot 'dist-package\FactumIL_V13_Installer.exe'  # matches OutputDir + OutputBaseFilename in installer.iss

Write-Host '--- Initializing FactumIL V13 Build Process ---' -ForegroundColor Cyan

# ── Pre-flight checks ────────────────────────────────────────────────────────────
if (!(Test-Path $desktopDir)) { Write-Error "Desktop directory not found: $desktopDir"; exit 1 }
if (!(Test-Path $issPath))    { Write-Error "installer.iss not found: $issPath"; exit 1 }
if (!(Test-Path $isccPath))   { Write-Error "Inno Setup (ISCC) not found: $isccPath`nInstall from https://jrsoftware.org/isdl.php"; exit 1 }

# ── Stage distribution ───────────────────────────────────────────────────────
# publish.ps1 outputs to legal-os\FactumIL_Dist\ (via its own $PSScriptRoot)
# and self-cleans on every run — no pre-clean needed here.
Write-Host 'Executing publish.ps1 for FactumIL distribution...' -ForegroundColor Yellow
& (Join-Path $desktopDir 'publish.ps1')
if ($LASTEXITCODE -ne 0) { throw "publish.ps1 failed with exit code $LASTEXITCODE" }

# ── Compile installer ───────────────────────────────────────────────────────────
Write-Host "Compiling FactumIL installer from $issPath..." -ForegroundColor Green
& $isccPath $issPath
if ($LASTEXITCODE -ne 0) { throw "ISCC compilation failed with exit code $LASTEXITCODE" }

# ── Validate output ─────────────────────────────────────────────────────────────
if (Test-Path $outputPath) {
    Write-Host '--- BUILD SUCCESSFUL ---' -ForegroundColor Green
    Write-Host "Installer ready at: $outputPath" -ForegroundColor Yellow
} else {
    Write-Host '--- BUILD FAILED: output file not found ---' -ForegroundColor Red
    Write-Host "Expected: $outputPath" -ForegroundColor Gray
    exit 1
}
