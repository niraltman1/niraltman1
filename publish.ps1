#Requires -Version 5.1
<#
.SYNOPSIS
    Factum IL v1.0.0 — Production Build & Stage Script
    Builds all packages and stages FactumIL_Dist\ for Inno Setup packaging.

.DESCRIPTION
    Output layout (matches installer.iss and FactumIL.Desktop expectations):
        FactumIL_Dist\
          shell\        WPF exe + WebView2 DLLs (.NET 8, no-self-contained)
          backend\      Express API (isolated prod node_modules, no pnpm symlinks)
          dashboard\    React SPA compiled assets (index.html etc.)
          migrations\   SQL migration files (run once on first boot)
          runtime\      Portable node.exe (no system Node.js required)
          tools\        OllamaSetup.exe (downloaded from Ollama releases)
          powershell\   Legal Registry + helper scripts

    The WPF shell (FactumIL.Desktop.exe) expects:
        {app}\app\node\node.exe
        {app}\app\api\dist\start.js
        {app}\app\migrations\*.sql
        {app}\app\dashboard\dist\index.html
        %LOCALAPPDATA%\FactumIL\factum-il.db  (created at runtime)

.EXAMPLE
    .\publish.ps1
    .\publish.ps1 -OutDir "C:\Build\FactumIL_Dist" -NodeVersion "22.13.1"
#>
[CmdletBinding()]
param(
    [string] $OutDir      = (Join-Path $PSScriptRoot "FactumIL_Dist"),
    [string] $NodeVersion = "22.13.1",
    [switch] $SkipTests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot    = $PSScriptRoot
$DesktopDir  = Join-Path $RepoRoot "FactumIL.Desktop"
$TotalSteps  = 10
$Step        = 0

function Step([string]$msg) {
    $script:Step++
    Write-Host ""
    Write-Host "[$script:Step/$TotalSteps] $msg" -ForegroundColor Cyan
}

function CheckExe([string]$name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "Required tool not found: $name. Please install it and re-run."
    }
}

# ── Prerequisite check ────────────────────────────────────────────────────────
Step "Verifying prerequisites"
CheckExe "pnpm"
CheckExe "dotnet"
CheckExe "node"
Write-Host "  pnpm   : $(pnpm --version)"   -ForegroundColor Gray
Write-Host "  dotnet : $(dotnet --version)" -ForegroundColor Gray
Write-Host "  node   : $(node --version)"   -ForegroundColor Gray

# ── Clean output directory ────────────────────────────────────────────────────
Step "Cleaning output directory"
if (Test-Path $OutDir) { Remove-Item -Recurse -Force $OutDir }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
Write-Host "  Cleaned: $OutDir" -ForegroundColor Gray

# ── Install dependencies ──────────────────────────────────────────────────────
Step "Installing dependencies (pnpm install --frozen-lockfile)"
Push-Location $RepoRoot
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }
Pop-Location

# ── Typecheck all packages ────────────────────────────────────────────────────
Step "Typechecking all packages (pnpm -r typecheck)"
Push-Location $RepoRoot
pnpm -r typecheck
if ($LASTEXITCODE -ne 0) { throw "TypeScript typecheck failed — fix errors before packaging" }
Pop-Location

# ── Optional: run tests ───────────────────────────────────────────────────────
if (-not $SkipTests) {
    Step "Running test suite (pnpm -r test)"
    Push-Location $RepoRoot
    pnpm -r test
    if ($LASTEXITCODE -ne 0) { throw "Tests failed — fix failures before packaging" }
    Pop-Location
} else {
    Step "Skipping tests (-SkipTests flag set)"
    Write-Host "  WARNING: Skipping tests. Only use this for emergency rebuilds." -ForegroundColor Yellow
}

# ── Build all TypeScript packages (dependency order) ─────────────────────────
Step "Building all TypeScript packages"

$PackageBuildOrder = @(
    'shared', 'database', 'legal-ontology', 'events', 'observability',
    'model-router', 'memory', 'retrieval', 'ai', 'ai-guardrails',
    'citation-engine', 'pipeline', 'evals', 'orchestrator', 'policy-engine',
    'agent-core', 'api'
)

Push-Location $RepoRoot
foreach ($pkg in $PackageBuildOrder) {
    $pkgDir = Join-Path $RepoRoot "packages\$pkg"
    if (-not (Test-Path $pkgDir)) {
        Write-Host "  SKIP: packages\$pkg (not found)" -ForegroundColor Yellow
        continue
    }
    $pkgJson = Get-Content (Join-Path $pkgDir "package.json") | ConvertFrom-Json
    if ($pkgJson.scripts.build) {
        Write-Host "  Building @factum-il/$pkg ..." -ForegroundColor Gray
        Push-Location $pkgDir
        pnpm build
        if ($LASTEXITCODE -ne 0) { throw "@factum-il/$pkg build failed" }
        Pop-Location
    } else {
        Write-Host "  SKIP: @factum-il/$pkg (no build script)" -ForegroundColor DarkGray
    }
}

# Build React dashboard
Write-Host "  Building dashboard (React/Vite)..." -ForegroundColor Gray
pnpm --filter dashboard build
if ($LASTEXITCODE -ne 0) { throw "Dashboard build failed" }
Pop-Location

# ── Publish WPF shell ─────────────────────────────────────────────────────────
Step "Publishing WPF shell (dotnet publish, win-x64, no-self-contained)"
$ShellOut = Join-Path $OutDir "shell"
Push-Location $DesktopDir
dotnet publish FactumIL.Desktop.csproj `
    --configuration Release `
    --runtime win-x64 `
    --output $ShellOut `
    --no-self-contained `
    /p:PublishSingleFile=false `
    /p:DebugType=None `
    /p:DebugSymbols=false
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed" }
Pop-Location
Write-Host "  Shell staged: $ShellOut" -ForegroundColor Gray

# ── Stage backend (pnpm deploy — isolated node_modules) ──────────────────────
Step "Staging API backend (pnpm deploy --prod)"
$BackendOut = Join-Path $OutDir "backend"
Push-Location $RepoRoot
pnpm --filter @factum-il/api deploy --prod $BackendOut
if ($LASTEXITCODE -ne 0) { throw "pnpm deploy failed" }
Pop-Location

# Copy compiled API dist/ (pnpm deploy excludes .gitignored dist/)
$ApiDistSrc = Join-Path $RepoRoot "packages\api\dist"
$ApiDistDst = Join-Path $BackendOut "dist"
New-Item -ItemType Directory -Force -Path $ApiDistDst | Out-Null
Copy-Item -Recurse -Force "$ApiDistSrc\*" $ApiDistDst

# Copy all @factum-il/* workspace packages' compiled output
$WorkspacePackages = @(
    'shared', 'database', 'legal-ontology', 'events', 'observability',
    'model-router', 'memory', 'retrieval', 'ai', 'ai-guardrails',
    'citation-engine', 'pipeline', 'evals', 'orchestrator', 'policy-engine',
    'agent-core'
)
foreach ($pkg in $WorkspacePackages) {
    $SrcDist = Join-Path $RepoRoot "packages\$pkg\dist"
    if (-not (Test-Path $SrcDist)) {
        Write-Host "  SKIP workspace pkg dist: $pkg (no dist/)" -ForegroundColor Yellow
        continue
    }
    $DstPkgDir = Join-Path $BackendOut "node_modules\@factum-il\$pkg"
    if (-not (Test-Path $DstPkgDir)) { New-Item -ItemType Directory -Force -Path $DstPkgDir | Out-Null }

    New-Item -ItemType Directory -Force -Path "$DstPkgDir\dist" | Out-Null
    Copy-Item -Recurse -Force "$SrcDist\*" "$DstPkgDir\dist"

    # Patch package.json to resolve to dist/index.js
    $pkgJsonPath = Join-Path $DstPkgDir "package.json"
    if (Test-Path $pkgJsonPath) {
        $pkgJson = Get-Content $pkgJsonPath | ConvertFrom-Json
        $pkgJson.main    = "./dist/index.js"
        $pkgJson.exports = [PSCustomObject]@{ "." = "./dist/index.js" }
        $pkgJson | ConvertTo-Json -Depth 10 | Set-Content $pkgJsonPath -Encoding UTF8
    }
}

# ── Stage dashboard + migrations ──────────────────────────────────────────────
Step "Staging dashboard and migrations"

$DashboardDst = Join-Path $OutDir "dashboard"
New-Item -ItemType Directory -Force -Path $DashboardDst | Out-Null
Copy-Item -Recurse -Force "$RepoRoot\apps\dashboard\dist\*" $DashboardDst
Write-Host "  Dashboard: $DashboardDst ($((Get-ChildItem $DashboardDst -Recurse -File).Count) files)" -ForegroundColor Gray

$MigrationsDst = Join-Path $OutDir "migrations"
New-Item -ItemType Directory -Force -Path $MigrationsDst | Out-Null
Copy-Item -Force "$RepoRoot\migrations\*.sql" $MigrationsDst
Write-Host "  Migrations: $((Get-ChildItem $MigrationsDst -Filter *.sql).Count) SQL files" -ForegroundColor Gray

# Stage Legal Registry + PowerShell helpers
$LibSrc = Join-Path $RepoRoot "powershell\lib"
$LibDst = Join-Path $OutDir "powershell\lib"
New-Item -ItemType Directory -Force -Path $LibDst | Out-Null
if (Test-Path (Join-Path $LibSrc "Legal_Registry.json")) {
    Copy-Item (Join-Path $LibSrc "Legal_Registry.json") $LibDst -Force
}
foreach ($f in @("Config.ps1", "IdentifierParser.ps1")) {
    $src = Join-Path $LibSrc $f
    if (Test-Path $src) { Copy-Item $src $LibDst -Force }
}

# ── Download portable Node.js ─────────────────────────────────────────────────
Step "Downloading portable Node.js v$NodeVersion"
$RuntimeDst = Join-Path $OutDir "runtime"
New-Item -ItemType Directory -Force -Path $RuntimeDst | Out-Null

$NodeZip     = "$env:TEMP\node-v$NodeVersion-win-x64.zip"
$NodeExtract = "$env:TEMP\node-v$NodeVersion-win-x64-extract"

if (-not (Test-Path $NodeZip)) {
    $NodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
    Write-Host "  Downloading $NodeUrl ..." -ForegroundColor Gray
    Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZip -UseBasicParsing
} else {
    Write-Host "  Using cached: $NodeZip" -ForegroundColor Gray
}

if (Test-Path $NodeExtract) { Remove-Item -Recurse -Force $NodeExtract }
Expand-Archive -Path $NodeZip -DestinationPath $NodeExtract
Copy-Item -Force "$NodeExtract\node-v$NodeVersion-win-x64\node.exe" "$RuntimeDst\node.exe"
Write-Host "  node.exe staged: $RuntimeDst\node.exe" -ForegroundColor Gray

# ── Download Ollama installer ─────────────────────────────────────────────────
Step "Downloading Ollama installer"
$ToolsDst = Join-Path $OutDir "tools"
New-Item -ItemType Directory -Force -Path $ToolsDst | Out-Null

$OllamaExe = Join-Path $ToolsDst "OllamaSetup.exe"
$OllamaUrl = "https://github.com/ollama/ollama/releases/latest/download/OllamaSetup.exe"
try {
    Write-Host "  Downloading OllamaSetup.exe ..." -ForegroundColor Gray
    Invoke-WebRequest -Uri $OllamaUrl -OutFile $OllamaExe -UseBasicParsing -TimeoutSec 120
    Write-Host "  OllamaSetup.exe staged: $OllamaExe" -ForegroundColor Gray
} catch {
    Write-Host "  WARNING: Could not download OllamaSetup.exe: $_" -ForegroundColor Yellow
    Write-Host "  Place OllamaSetup.exe manually in: $ToolsDst" -ForegroundColor Yellow
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=" * 70 -ForegroundColor Green
Write-Host " BUILD COMPLETE — Factum IL v1.0.0" -ForegroundColor Green
Write-Host "=" * 70 -ForegroundColor Green
Write-Host ""
Write-Host "  Staged to: $OutDir" -ForegroundColor White
Write-Host ""
Write-Host "  shell\FactumIL.Desktop.exe        $(if (Test-Path "$OutDir\shell\FactumIL.Desktop.exe") {'✓'} else {'MISSING'})" -ForegroundColor White
Write-Host "  runtime\node.exe                  $(if (Test-Path "$OutDir\runtime\node.exe") {'✓'} else {'MISSING'})" -ForegroundColor White
Write-Host "  backend\dist\start.js             $(if (Test-Path "$OutDir\backend\dist\start.js") {'✓'} else {'MISSING'})" -ForegroundColor White
Write-Host "  dashboard\index.html              $(if (Test-Path "$OutDir\dashboard\index.html") {'✓'} else {'MISSING'})" -ForegroundColor White
Write-Host "  migrations\                        $((Get-ChildItem "$OutDir\migrations" -Filter *.sql -ErrorAction SilentlyContinue).Count) SQL files" -ForegroundColor White
Write-Host "  tools\OllamaSetup.exe             $(if (Test-Path "$OutDir\tools\OllamaSetup.exe") {'✓'} else {'missing — add manually'})" -ForegroundColor White
Write-Host ""
Write-Host "  Next step:" -ForegroundColor Yellow
Write-Host "    ISCC.exe installer.iss" -ForegroundColor Yellow
Write-Host "    → dist-package\FactumIL_v1.0.0_Setup.exe" -ForegroundColor Yellow
Write-Host ""
