#!/usr/bin/env pwsh
#Requires -Version 5.1
<#
.SYNOPSIS
    Factum IL v1.0.0  -  Production Build & Stage Script
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
    .\publish.ps1 -SkipTests  # Emergency rebuild only
    .\publish.ps1 -SkipGGUF   # Skip large GGUF download
#>
[CmdletBinding()]
param(
    [string] $OutDir           = "",
    [string] $NodeVersion      = "22.13.1",
    [switch] $SkipTests,
    [switch] $SkipGGUF,
    [int]    $MaxDownloadRetries = 3,
    [int]    $DownloadTimeoutSec = 1800
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$VerbosePreference = 'Continue'

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION & UTILITIES
# ═══════════════════════════════════════════════════════════════════════════════

# When invoked via pnpm/npm, $PSScriptRoot may be empty - resolve from invocation path
if (-not $PSScriptRoot) {
    $PSScriptRoot = Split-Path -Parent -Resolve $MyInvocation.MyCommand.Path
}
if (-not $OutDir) {
    $OutDir = Join-Path $PSScriptRoot "FactumIL_Dist"
}

$RepoRoot    = $PSScriptRoot
$DesktopDir  = Join-Path $RepoRoot "FactumIL.Desktop"
$TotalSteps  = 13  # Incremented: added "Validating staged artifacts"
$Step        = 0
$LogFile     = Join-Path $PSScriptRoot "Deployment-Log.txt"
$BuildId     = [datetime]::UtcNow.ToString('yyyy-MM-ddTHH-mm-ssZ')

# Single source of truth for workspace packages (used in both build and staging)
$WorkspacePackages = @(
    'shared', 'database', 'legal-ontology', 'events', 'observability',
    'model-router', 'memory', 'retrieval', 'ai', 'ai-guardrails',
    'citation-engine', 'pipeline', 'evals', 'orchestrator', 'policy-engine',
    'agent-core', 'support-diagnostics', 'update-core',
    'enterprise-hooks', 'encrypted-backup', 'litigation-intelligence',
    'api'
)

function Log([string]$msg) {
    Add-Content -Path $LogFile -Value "[$BuildId] $msg" -Encoding UTF8
    Write-Host $msg
}

function Step([string]$msg) {
    $script:Step++
    $script:StepStartTime = Get-Date
    Write-Host ""
    Write-Host "[$script:Step/$TotalSteps] $msg" -ForegroundColor Cyan
    Log "[$script:Step/$TotalSteps] $msg"
}

function StepElapsed() {
    if ($script:StepStartTime) {
        $elapsed = ((Get-Date) - $script:StepStartTime).TotalSeconds
        Write-Host "  ⏱ Completed in $($elapsed.ToString('F1'))s" -ForegroundColor DarkGray
    }
}

function CheckExe([string]$name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        throw "Required tool not found: $name. Please install it and re-run."
    }
}

function ValidateArtifact([string]$Path, [string]$Type) {
    <#
    .SYNOPSIS
        Validates staged artifacts for integrity.
    .PARAMETER Type
        Type of artifact: 'exe', 'gguf', 'sql', 'dll', 'generic'
    #>
    if (-not (Test-Path $Path)) { return $false }
    
    switch ($Type) {
        "exe" { 
            # Basic validity: file exists, is readable, has reasonable size
            $size = (Get-Item $Path -ErrorAction SilentlyContinue).Length
            return $size -gt 100KB  # Sanity check: EXEs should be >100KB
        }
        "gguf" { 
            # GGUF files have 4-byte magic: 0x67 0x67 0x75 0x66 (gguF)
            try {
                [byte[]]$magic = @(0x67, 0x67, 0x75, 0x66)
                $bytes = [System.IO.File]::ReadAllBytes($Path)
                if ($bytes.Length -lt 4) { return $false }
                for ($i = 0; $i -lt 4; $i++) {
                    if ($bytes[$i] -ne $magic[$i]) { return $false }
                }
                # Also verify reasonable size (at least 100MB for quantized model)
                return $bytes.Length -gt 100MB
            } catch {
                Log "  WARN: GGUF validation error: $_"
                return $false
            }
        }
        "sql" { 
            $content = Get-Content $Path -Raw -ErrorAction SilentlyContinue
            return $content -match "^[\s]*(CREATE|ALTER|INSERT|UPDATE|DELETE)"
        }
        "dll" {
            # DLL files start with "MZ" header
            try {
                [byte[]]$mz = Get-Content $Path -Encoding Byte -TotalCount 2
                return ($mz[0] -eq 0x4D) -and ($mz[1] -eq 0x5A)
            } catch {
                return $false
            }
        }
        default { return Test-Path $Path }
    }
}

function DownloadWithRetry([string]$Uri, [string]$OutFile, [int]$TimeoutSec, [int]$MaxRetries) {
    <#
    .SYNOPSIS
        Downloads a file with automatic retry and detailed diagnostics.
    #>
    $RetryCount = 0
    $Downloaded = $false
    $LastError = $null

    while ($RetryCount -lt $MaxRetries -and -not $Downloaded) {
        try {
            Write-Host "  Downloading $(Split-Path $OutFile -Leaf) (Attempt $($RetryCount+1)/$MaxRetries) ..." -ForegroundColor Gray
            Invoke-WebRequest -Uri $Uri `
                -OutFile $OutFile `
                -UseBasicParsing `
                -TimeoutSec $TimeoutSec `
                -ErrorAction Stop
            $Downloaded = $true
            $size = [math]::Round((Get-Item $OutFile).Length / 1MB, 1)
            Write-Host "  ✓ Downloaded ($size MB)" -ForegroundColor Green
        } catch {
            $LastError = $_
            $RetryCount++
            if ($RetryCount -lt $MaxRetries) {
                Write-Host "  ⚠ Download attempt $RetryCount failed. Retrying in 5 seconds..." -ForegroundColor Yellow
                Start-Sleep -Seconds 5
            }
        }
    }

    if (-not $Downloaded) {
        Write-Host "  ✗ Download failed after $MaxRetries attempts: $LastError" -ForegroundColor Red
        return $false
    }
    return $true
}

# Rotate old log files if size exceeds 10MB
if (Test-Path $LogFile) {
    $logSize = (Get-Item $LogFile).Length
    if ($logSize -gt 10MB) {
        $rotatedName = "Deployment-Log-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
        Rename-Item $LogFile -NewName $rotatedName
        Write-Host "  ℹ Rotated old log: $rotatedName" -ForegroundColor DarkGray
    }
}

# ═══════════════════════════════════════════════════════════════════════════════
# [1/13] Prerequisite check
# ═══════════════════════════════════════════════════════════════════════════════

Step "Verifying prerequisites"
CheckExe "pnpm"
CheckExe "dotnet"
CheckExe "node"
Write-Host "  pnpm   : $(pnpm --version)"   -ForegroundColor Gray
Write-Host "  dotnet : $(dotnet --version)" -ForegroundColor Gray
Write-Host "  node   : $(node --version)"   -ForegroundColor Gray

# Winget pre-flight checks (non-fatal)
if (Get-Command winget -ErrorAction SilentlyContinue) {
    if (winget list --id OpenJS.NodeJS.LTS 2>$null | Select-String "22\.") {
        Log "  ✓ Node 22 LTS: confirmed via winget"
    } else {
        Log "  ⚠ Node 22 LTS not confirmed - install: winget install OpenJS.NodeJS.LTS"
    }
    if (winget list --id JRSoftware.InnoSetup 2>$null | Select-String "InnoSetup") {
        Log "  ✓ Inno Setup: confirmed via winget"
    } else {
        Log "  ⚠ Inno Setup not found - install: winget install JRSoftware.InnoSetup"
    }
} else {
    Log "  ℹ winget not available - skipping tool version checks"
}
$wv2Key = "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
if (Test-Path $wv2Key) { Log "  ✓ WebView2 Runtime: present" }
else { Log "  ⚠ WebView2 Runtime not installed - installer will handle silent install" }

StepElapsed

# ═══════════════════════════════════════════════════════════════════════════════
# [2/13] Clean output directory
# ═══════════════════════════════════════════════════════════════════════════════

Step "Cleaning output directory"
if (Test-Path $OutDir) { Remove-Item -Recurse -Force $OutDir }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
Write-Host "  Cleaned: $OutDir" -ForegroundColor Gray

StepElapsed

# ═══════════════════════════════════════════════════════════════════════════════
# [3/13] Install dependencies
# ═══════════════════════════════════════════════════════════════════════════════

Step "Installing dependencies (pnpm install --frozen-lockfile)"
Push-Location $RepoRoot
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }
Pop-Location

StepElapsed

# ═══════════════════════════════════════════════════════════════════════════════
# [4/13] Typecheck all packages
# ═══════════════════════════════════════════════════════════════════════════════

Step "Typechecking all packages (pnpm -r typecheck)"
Push-Location $RepoRoot
pnpm -r typecheck
if ($LASTEXITCODE -ne 0) { throw "TypeScript typecheck failed  -  fix errors before packaging" }
Pop-Location

StepElapsed

# ═══════════════════════════════════════════════════════════════════════════════
# [5/13] Optional: run tests
# ═══════════════════════════════════════════════════════════════════════════════

if (-not $SkipTests) {
    Step "Running test suite (pnpm -r test)"
    Push-Location $RepoRoot
    pnpm -r test
    if ($LASTEXITCODE -ne 0) { throw "Tests failed  -  fix failures before packaging" }
    Pop-Location
} else {
    Step "Skipping tests (-SkipTests flag set)"
    Write-Host "  ⚠ WARNING: Skipping tests. Only use this for emergency rebuilds." -ForegroundColor Yellow
}

StepElapsed

# ═══════════════════════════════════════════════════════════════════════════════
# [6/13] Build all TypeScript packages (dependency order)
# ═══════════════════════════════════════════════════════════════════════════════

Step "Building all TypeScript packages"

# Build order mirrors WorkspacePackages (single source of truth)
$PackageBuildOrder = $WorkspacePackages

Push-Location $RepoRoot
$builtCount = 0
$skippedCount = 0

foreach ($pkg in $PackageBuildOrder) {
    $pkgDir = Join-Path $RepoRoot "packages\$pkg"
    if (-not (Test-Path $pkgDir)) {
        Write-Host "  ⊘ SKIP: packages\$pkg (not found)" -ForegroundColor Yellow
        $skippedCount++
        continue
    }
    $pkgJson = Get-Content (Join-Path $pkgDir "package.json") | ConvertFrom-Json
    if ($pkgJson.PSObject.Properties['scripts'] -and $pkgJson.scripts.PSObject.Properties['build']) {
        Write-Host "  Building @factum-il/$pkg ..." -ForegroundColor Gray
        Push-Location $pkgDir
        try {
            pnpm build
            if ($LASTEXITCODE -ne 0) { throw "@factum-il/$pkg build failed" }
            $builtCount++
        } catch {
            Log "  ERROR in @factum-il/$pkg build (CWD: $(Get-Location))"
            throw
        }
        Pop-Location
    } else {
        Write-Host "  ⊘ SKIP: @factum-il/$pkg (no build script)" -ForegroundColor DarkGray
        $skippedCount++
    }
}

# Build React dashboard
Write-Host "  Building dashboard (React/Vite)..." -ForegroundColor Gray
pnpm --filter dashboard build
if ($LASTEXITCODE -ne 0) { throw "Dashboard build failed" }

Pop-Location
Write-Host "  Built: $builtCount packages, Skipped: $skippedCount" -ForegroundColor Green

StepElapsed

# ═══════════════════════════════════════════════════════════════════════════════
# [7/13] Publish WPF shell
# ═══════════════════════════════════════════════════════════════════════════════

Step "Publishing WPF shell (dotnet publish, win-x64, no-self-contained)"
$ShellOut = Join-Path $OutDir "shell"
Push-Location $DesktopDir
try {
    dotnet publish FactumIL.Desktop.csproj `
        --configuration Release `
        --runtime win-x64 `
        --output $ShellOut `
        --no-self-contained `
        /p:PublishSingleFile=false `
        /p:DebugType=None `
        /p:DebugSymbols=false
    if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed" }
} catch {
    Log "  ERROR: dotnet publish failed in $DesktopDir"
    throw
}
Pop-Location
Write-Host "  ✓ Shell staged: $ShellOut" -ForegroundColor Green

StepElapsed

# ═══════════════════════════════════════════════════════════════════════════════
# [8/13] Stage backend (artifact copy + pnpm install --prod, flat node_modules)
# ═══════════════════════════════════════════════════════════════════════════════

Step "Staging API backend (artifact copy + pnpm install --prod --node-linker=hoisted)"

$BackendOut = Join-Path $OutDir "backend"

# 8.0  Kill node.exe — releases VS Code TS-server locks on packages\*\dist\*.d.ts
Write-Host "  Stopping node.exe processes (releasing file locks) ..." -ForegroundColor Gray
$NodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($NodeProcesses) {
    Write-Host "  Found $(($NodeProcesses | Measure-Object).Count) node.exe process(es):" -ForegroundColor Yellow
    $NodeProcesses | ForEach-Object { Write-Host "    - PID $($_.Id): $($_.StartTime)" -ForegroundColor DarkYellow }
    Write-Host "  Terminating (5 second grace period)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    
    $NodeProcesses | ForEach-Object {
        try { $_.Kill(); $_.WaitForExit(3000) } catch { $null }
    }
}
Start-Sleep -Milliseconds 300

# 8.2  Create backend/ and copy API dist/
New-Item -ItemType Directory -Force -Path "$BackendOut\dist" | Out-Null
Copy-Item -Recurse -Force "$RepoRoot\packages\api\dist\*" "$BackendOut\dist"
Write-Host "  API dist/ staged." -ForegroundColor Gray

# 8.2.1 Copy generated/ (tsc does not emit non-TS files — version.json lives here)
if (Test-Path "$RepoRoot\packages\api\src\generated") {
    New-Item -ItemType Directory -Force -Path "$BackendOut\dist\generated" | Out-Null
    Copy-Item -Recurse -Force "$RepoRoot\packages\api\src\generated\*" "$BackendOut\dist\generated"
    Write-Host "  API dist/generated/ staged." -ForegroundColor Gray
}

# 8.3  Build merged package.json:
#       API third-party deps (workspace:* stripped) + transitive third-party
#       deps from all workspace packages (ensures better-sqlite3, sqlite-vec,
#       etc. are installed by pnpm install even though they live in workspace pkgs)
$ApiPkg     = Get-Content (Join-Path $RepoRoot "packages\api\package.json") | ConvertFrom-Json
$MergedDeps = [ordered]@{}
if ($ApiPkg.PSObject.Properties['dependencies']) {
    foreach ($p in $ApiPkg.dependencies.PSObject.Properties) {
        if ($p.Value -notlike "workspace:*") { $MergedDeps[$p.Name] = $p.Value }
    }
}
foreach ($pkg in $WorkspacePackages) {
    $pj = Join-Path $RepoRoot "packages\$pkg\package.json"
    if (-not (Test-Path $pj)) { continue }
    $pkgData = Get-Content $pj | ConvertFrom-Json
    if (-not $pkgData.PSObject.Properties['dependencies']) { continue }
    foreach ($p in $pkgData.dependencies.PSObject.Properties) {
        if ($p.Value -like "workspace:*")  { continue }
        if ($p.Name  -like "@factum-il/*") { continue }
        if (-not $MergedDeps.Contains($p.Name)) { $MergedDeps[$p.Name] = $p.Value }
    }
}
# Pin better-sqlite3 to the EXACT workspace-locked version so the no-lockfile
# flat install doesn't resolve a newer release that hasn't published Windows
# prebuilt binaries yet (Node 22 ABI 127 prebuild confirmed for pinned version).
$bsqLockMatch = Select-String -Path "$RepoRoot\pnpm-lock.yaml" -Pattern "^\s+better-sqlite3@(\d+\.\d+\.\d+):" | Select-Object -First 1
$bsqPin = if ($bsqLockMatch -and $bsqLockMatch.Line -match "better-sqlite3@(\d+\.\d+\.\d+)") { $Matches[1] } else { "^11.0.0" }
Write-Host "  Pinning better-sqlite3 to: $bsqPin" -ForegroundColor DarkGray
[PSCustomObject]@{
    name         = "factum-il-backend-dist"
    version      = "1.0.0"
    private      = $true
    type         = "module"
    dependencies = [PSCustomObject]$MergedDeps
    pnpm         = [PSCustomObject]@{
        overrides = [PSCustomObject]@{ "better-sqlite3" = $bsqPin }
    }
} | ConvertTo-Json -Depth 10 | Set-Content "$BackendOut\package.json" -Encoding UTF8
Write-Host "  ✓ Merged package.json written ($($MergedDeps.Count) third-party deps)." -ForegroundColor Green

# 8.4  .npmrc + pnpm-workspace.yaml — flat hoisted layout; isolated from repo workspace
@"
node-linker=hoisted
shamefully-hoist=true
"@ | Set-Content "$BackendOut\.npmrc" -Encoding UTF8
@"
packages: []
overrides:
  better-sqlite3: "$bsqPin"
"@ | Set-Content "$BackendOut\pnpm-workspace.yaml" -Encoding UTF8

# 8.5  Install all third-party prod deps — flat layout, no lockfile, prefer local cache
Push-Location $BackendOut
pnpm install --prod --no-lockfile --node-linker=hoisted --prefer-offline --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw "pnpm install --prod failed in backend/" }

# Stage better-sqlite3 native binding — copy from workspace virtual store first
# (already downloaded/built during 'pnpm install --frozen-lockfile' in CI step 7),
# then fall back to npm rebuild with VS 2022 override if needed.
Write-Host "  Staging better-sqlite3 native binding..." -ForegroundColor Gray
$bsqDistDir  = "node_modules\better-sqlite3"
$bsqDistVer  = (Get-Content "$bsqDistDir\package.json" | ConvertFrom-Json).version
$wsStoreBin  = "$RepoRoot\node_modules\.pnpm\better-sqlite3@$bsqDistVer\node_modules\better-sqlite3\build\Release\better_sqlite3.node"
$distBinDir  = "$bsqDistDir\build\Release"
$distBinPath = "$distBinDir\better_sqlite3.node"

if (Test-Path $wsStoreBin) {
    New-Item -ItemType Directory -Force -Path $distBinDir | Out-Null
    Copy-Item $wsStoreBin $distBinPath -Force
    Write-Host "  ✓ better-sqlite3 binary staged from workspace store (v$bsqDistVer)." -ForegroundColor Green
} else {
    Write-Host "  Workspace store binary not found — running npm rebuild..." -ForegroundColor Yellow
    # Help node-gyp find VS 2022 (version 17) to avoid VS 2026 version-string parse failure
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vswhere) {
        $vs22 = (& $vswhere -products * -version "[17,18)" -property installationPath 2>$null | Select-Object -First 1)?.Trim()
        if ($vs22) {
            $env:GYP_MSVS_OVERRIDE_PATH = $vs22
            $env:npm_config_msvs_version = "2022"
            Write-Host "    GYP_MSVS_OVERRIDE_PATH=$vs22" -ForegroundColor DarkGray
        }
    }
    npm rebuild better-sqlite3
    if ($LASTEXITCODE -ne 0) { throw "npm rebuild better-sqlite3 failed — check Node ABI / network in $BackendOut" }
}

# Verify the native binding loads against the build host's Node (same major as bundled runtime)
Write-Host "  Verifying better-sqlite3 native binding..." -ForegroundColor Gray
$bsqlNodeVer = node -e "console.log(process.version)"
$bsqlArch    = node -e "console.log(process.arch)"
$bsqlAbi     = node -e "console.log(process.versions.modules)"

Write-Host "    Node: $bsqlNodeVer | Arch: $bsqlArch | ABI: $bsqlAbi" -ForegroundColor DarkGray

node -e "const D=require('better-sqlite3'); const db=new D(':memory:'); db.exec('CREATE TABLE _p(x)'); db.close(); console.log('  ✓ better-sqlite3 native binding OK (v'+require('./node_modules/better-sqlite3/package.json').version+')')" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: better-sqlite3 native binding failed. Diagnostics:" -ForegroundColor Red
    Write-Host "    • Node ABI: $bsqlAbi (check Arch: $bsqlArch)" -ForegroundColor Red
    Write-Host "    • Disk space: $(cmd /c "wmic logicaldisk get freespace" 2>$null | Select-String '\d+' | ForEach-Object {$_.Matches[0].Value})" -ForegroundColor Red
    throw "better-sqlite3 native binding failed — check Node ABI in $BackendOut"
}

Pop-Location
Write-Host "  ✓ pnpm install --prod complete." -ForegroundColor Green

# 8.6  Plant workspace package dist/ + patched package.json
foreach ($pkg in $WorkspacePackages) {
    $SrcDist = Join-Path $RepoRoot "packages\$pkg\dist"
    if (-not (Test-Path $SrcDist)) {
        Write-Host "  ⊘ SKIP: @factum-il/$pkg (no dist/ — not built?)" -ForegroundColor Yellow
        continue
    }
    $DstPkgDir = Join-Path $BackendOut "node_modules\@factum-il\$pkg"
    New-Item -ItemType Directory -Force -Path "$DstPkgDir\dist" | Out-Null
    Copy-Item -Recurse -Force "$SrcDist\*" "$DstPkgDir\dist" -ErrorAction Stop

    $SrcPkgJson = Join-Path $RepoRoot "packages\$pkg\package.json"
    if (Test-Path $SrcPkgJson) {
        Copy-Item -Force $SrcPkgJson "$DstPkgDir\package.json" -ErrorAction Stop
        $pkgJson = Get-Content "$DstPkgDir\package.json" | ConvertFrom-Json
        $pkgJson | Add-Member -NotePropertyName 'main'    -NotePropertyValue './dist/index.js' -Force
        $pkgJson | Add-Member -NotePropertyName 'exports' -NotePropertyValue ([PSCustomObject]@{ '.' = './dist/index.js' }) -Force
        # Strip workspace:* — meaningless outside the pnpm workspace
        if ($pkgJson.PSObject.Properties['dependencies']) {
            $cleanDeps = [ordered]@{}
            foreach ($p in $pkgJson.dependencies.PSObject.Properties) {
                if ($p.Value -notlike "workspace:*") { $cleanDeps[$p.Name] = $p.Value }
            }
            $pkgJson.dependencies = [PSCustomObject]$cleanDeps
        }
        $pkgJson | ConvertTo-Json -Depth 10 | Set-Content "$DstPkgDir\package.json" -Encoding UTF8
    }
    Write-Host "    ✓ @factum-il/$pkg" -ForegroundColor DarkGray
}
Write-Host "  ✓ Workspace packages staged." -ForegroundColor Green

# 8.7  Rebuild native modules for Windows x64 (paths are now flat — no deep .pnpm tree)
if (-not (Test-Path variable:IsWindows)) { $IsWindows = $true }
if ($IsWindows) {
    Write-Host "  Rebuilding native modules for win-x64 ..." -ForegroundColor Gray
    Push-Location $BackendOut
    if (Test-Path "node_modules\.bin\node-gyp-build") {
        node node_modules\.bin\node-gyp-build 2>$null; $true
    }
    if (Test-Path "node_modules\better-sqlite3\scripts\download-prebuilt.js") {
        node node_modules\better-sqlite3\scripts\download-prebuilt.js `
             --platform win32 --arch x64 2>$null; $true
    }
    Pop-Location
}
Write-Host "  ✓ Backend staged: $BackendOut" -ForegroundColor Green

StepElapsed

# ═══════════════════════════════════════════════════════════════════════════════
# [9/13] Stage dashboard + migrations
# ═══════════════════════════════════════════════════════════════════════════════

Step "Staging dashboard and migrations"

$DashboardDst = Join-Path $OutDir "dashboard\dist"
New-Item -ItemType Directory -Force -Path $DashboardDst | Out-Null
Copy-Item -Recurse -Force "$RepoRoot\apps\dashboard\dist\*" $DashboardDst
$dashboardFileCount = (Get-ChildItem $DashboardDst -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Host "  ✓ Dashboard: $dashboardFileCount files" -ForegroundColor Green

$MigrationsDst = Join-Path $OutDir "migrations"
New-Item -ItemType Directory -Force -Path $MigrationsDst | Out-Null
Copy-Item -Force "$RepoRoot\migrations\*.sql" $MigrationsDst -ErrorAction Stop
$sqlFileCount = (Get-ChildItem $MigrationsDst -Filter *.sql -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Host "  ✓ Migrations: $sqlFileCount SQL files" -ForegroundColor Green

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
Write-Host "  ✓ Legal Registry and PowerShell helpers staged" -ForegroundColor Green

# Bundled legislation corpus (offline KB)
# The v-corpus-latest release contains batch files: batch-<domain>.jsonl.gz + corpus-domain-index.json
# The runtime loader (legal-corpus-loader.ts) prefers legal-corpus/batches/ directory layout.
$CorpusDst        = Join-Path $OutDir "legal-corpus"
$CorpusBatchesDst = Join-Path $CorpusDst "batches"
New-Item -ItemType Directory -Force -Path $CorpusBatchesDst | Out-Null

$ApiHeaders = @{ 'User-Agent' = 'Factum-IL-Build' }
if ($env:GH_TOKEN) { $ApiHeaders['Authorization'] = "Bearer $($env:GH_TOKEN)" }

$corpusBatchCount = 0
Write-Host "  Trying to download legal corpus batches from GitHub Release v-corpus-latest..." -ForegroundColor Gray
try {
    $rel = Invoke-RestMethod `
        -Uri "https://api.github.com/repos/niraltman1/niraltman1/releases/tags/v-corpus-latest" `
        -Headers $ApiHeaders -UseBasicParsing -ErrorAction Stop

    $DlHeaders = @{
        'User-Agent' = 'Factum-IL-Build'
        'Accept'     = 'application/octet-stream'
    }
    if ($env:GH_TOKEN) { $DlHeaders['Authorization'] = "Bearer $($env:GH_TOKEN)" }

    # Download all batch-*.jsonl.gz files into batches/ subdirectory.
    foreach ($asset in $rel.assets) {
        if ($asset.name -match '^batch-.+\.jsonl\.gz$') {
            $dst = Join-Path $CorpusBatchesDst $asset.name
            if (DownloadWithRetry $asset.url $dst 300 2) {
                $corpusBatchCount++
                Write-Host "    ✓ $($asset.name)" -ForegroundColor Gray
            }
        }
    }

    # Download corpus-domain-index.json into batches/ subdirectory.
    $indexAsset = $rel.assets | Where-Object { $_.name -eq 'corpus-domain-index.json' } | Select-Object -First 1
    if ($indexAsset) {
        $indexDst = Join-Path $CorpusBatchesDst 'corpus-domain-index.json'
        DownloadWithRetry $indexAsset.url $indexDst 30 2 | Out-Null
        Write-Host "    ✓ corpus-domain-index.json" -ForegroundColor Gray
    }

    if ($corpusBatchCount -gt 0) {
        $totalMB = [math]::Round((Get-ChildItem $CorpusBatchesDst -Filter '*.jsonl.gz' | Measure-Object -Property Length -Sum).Sum / 1MB, 1)
        Write-Host "  ✓ Legal corpus: $corpusBatchCount batch(es), ${totalMB} MB" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Release v-corpus-latest found but no batch assets attached yet." -ForegroundColor DarkYellow
    }
} catch {
    Write-Host "  ⚠ Corpus auto-download failed: $_ — App will boot without bundled legislation." -ForegroundColor DarkYellow
}

if ($corpusBatchCount -eq 0) {
    Write-Host "  ⚠ WARNING: legal-corpus batches not found. App will boot without bundled legislation." -ForegroundColor Yellow
    Write-Host "    Run: pnpm ingest-knesset-odata -- --embed" -ForegroundColor Yellow
}

StepElapsed

# ═══════════════════════════════════════════════════════════════════════════════
# [10/13] Stage portable Node.js runtime
# ═══════════════════════════════════════════════════════════════════════════════

Step "Staging portable Node.js runtime"
$RuntimeDst = Join-Path $OutDir "runtime"
New-Item -ItemType Directory -Force -Path $RuntimeDst | Out-Null

# Prefer the node.exe already in PATH (zero-network, always correct in CI via actions/setup-node).
# This also avoids the $NodeVersion/$nodeVersion case-collision that produced double-v URLs.
$NodeExeSrc = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if ($NodeExeSrc -and (Test-Path $NodeExeSrc)) {
    Copy-Item -Force $NodeExeSrc "$RuntimeDst\node.exe"
    Write-Host "  ✓ node.exe staged from PATH: $NodeExeSrc" -ForegroundColor Green
} else {
    # Fallback: download from nodejs.org (strip leading v if $NodeVersion was set with one)
    $CleanVersion = $NodeVersion.TrimStart('v')
    $TempDir      = (Get-Item -LiteralPath $env:TEMP).FullName
    $NodeZip      = "$TempDir\node-v$CleanVersion-win-x64.zip"
    $NodeExtract  = "$TempDir\node-v$CleanVersion-win-x64-extract"
    $NodeUrl      = "https://nodejs.org/dist/v$CleanVersion/node-v$CleanVersion-win-x64.zip"
    if (-not (Test-Path $NodeZip)) {
        if (-not (DownloadWithRetry $NodeUrl $NodeZip $DownloadTimeoutSec $MaxDownloadRetries)) {
            Write-Host "  ⚠ Node.js download failed. Continuing without Node.exe." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ✓ Using cached: $(Split-Path $NodeZip -Leaf)" -ForegroundColor Green
    }
    if ((Test-Path $NodeZip) -and (ValidateArtifact $NodeZip "generic")) {
        if (Test-Path $NodeExtract) { Remove-Item -Recurse -Force $NodeExtract -ErrorAction SilentlyContinue }
        Expand-Archive -Path $NodeZip -DestinationPath $NodeExtract
        if (Test-Path "$NodeExtract\node-v$CleanVersion-win-x64\node.exe") {
            Copy-Item -Force "$NodeExtract\node-v$CleanVersion-win-x64\node.exe" "$RuntimeDst\node.exe"
            Write-Host "  ✓ node.exe staged from download" -ForegroundColor Green
        } else {
            Write-Host "  ✗ node.exe not found in archive!" -ForegroundColor Red
        }
    } else {
        Write-Host "  ⚠ SKIP: node.exe not staged (zip missing or invalid)." -ForegroundColor Yellow
    }
}

StepElapsed

# ═══════════════════════════════════════════════════════════════════════════════
# [11/13] Download Ollama, WebView2, and AI model GGUF
# ═══════════════════════════════════════════════════════════════════════════════

Step "Downloading Ollama, WebView2, and AI model GGUF"
$ToolsDst   = Join-Path $OutDir "tools"
New-Item -ItemType Directory -Force -Path $ToolsDst | Out-Null

# Ollama
$OllamaExe = Join-Path $ToolsDst "OllamaSetup.exe"
if (-not (Test-Path $OllamaExe)) {
    if (DownloadWithRetry "https://ollama.com/download/OllamaSetup.exe" $OllamaExe 120 $MaxDownloadRetries) {
        Write-Host "  ✓ OllamaSetup.exe staged" -ForegroundColor Green
    }
} else {
    Write-Host "  ✓ OllamaSetup.exe already staged" -ForegroundColor Green
}

# WebView2 bootstrapper
$WV2Exe = Join-Path $ToolsDst "MicrosoftEdgeWebview2Setup.exe"
if (-not (Test-Path $WV2Exe)) {
    if (DownloadWithRetry "https://go.microsoft.com/fwlink/p/?LinkId=2124703" $WV2Exe 60 $MaxDownloadRetries) {
        Write-Host "  ✓ WebView2 bootstrapper staged" -ForegroundColor Green
    }
} else {
    Write-Host "  ✓ WebView2 bootstrapper already staged" -ForegroundColor Green
}

# AI model GGUF (can be skipped with -SkipGGUF)
$GgufDst = Join-Path $OutDir "models"
New-Item -ItemType Directory -Force -Path $GgufDst | Out-Null
$GgufFile = Join-Path $GgufDst "law-il-E2B-Q4_K_M.gguf"

if (-not $SkipGGUF -and -not (Test-Path $GgufFile)) {
    Write-Host "  Downloading law-il-E2B-Q4_K_M.gguf (~1.3 GB) ..." -ForegroundColor Gray
    if (DownloadWithRetry "https://huggingface.co/BrainboxAI/law-il-E2B-GGUF/resolve/main/law-il-E2B-Q4_K_M.gguf" $GgufFile $DownloadTimeoutSec $MaxDownloadRetries) {
        if (ValidateArtifact $GgufFile "gguf") {
            $ggufSize = [math]::Round((Get-Item $GgufFile).Length/1GB,2)
            Write-Host "  ✓ GGUF: $ggufSize GB (validated)" -ForegroundColor Green
        } else {
            Write-Host "  ✗ GGUF validation failed - file may be corrupted" -ForegroundColor Red
            Remove-Item $GgufFile -Force -ErrorAction SilentlyContinue
        }
    }
} elseif ($SkipGGUF) {
    Write-Host "  ⊘ SKIP: GGUF download (-SkipGGUF flag set)" -ForegroundColor Yellow
} elseif (Test-Path $GgufFile) {
    Write-Host "  ✓ GGUF already staged" -ForegroundColor Green
}

# sqlite-vec  -  native KNN extension for SQLite
$VecVersion = "v0.1.7"
$VecZip     = "$TempDir\sqlite-vec.zip"
$VecDll     = "$ToolsDst\sqlite-vec.dll"
if (-not (Test-Path $VecDll)) {
    $VecUrl = "https://github.com/asg017/sqlite-vec/releases/download/$VecVersion/sqlite-vec-$VecVersion-loadable-windows-x86_64.zip"
    if (DownloadWithRetry $VecUrl $VecZip 60 2) {
        Expand-Archive $VecZip -DestinationPath "$TempDir\sqlite-vec-extract" -Force -ErrorAction SilentlyContinue
        $ExtractedDll = Get-ChildItem "$TempDir\sqlite-vec-extract" -Recurse -Filter "vec0.dll" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($ExtractedDll -and (ValidateArtifact $ExtractedDll.FullName "dll")) {
            Copy-Item $ExtractedDll.FullName $VecDll -ErrorAction Stop
            $vecSize = [math]::Round((Get-Item $VecDll).Length/1KB,0)
            Write-Host "  ✓ sqlite-vec ${VecVersion}: $vecSize KB" -ForegroundColor Green
        } else {
            Write-Host "  ⚠ vec0.dll not found or invalid in archive  -  KNN search will use JS fallback." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ⚠ Could not download sqlite-vec  -  KNN search will use JS fallback." -ForegroundColor Yellow
    }
} else {
    Write-Host "  ✓ sqlite-vec already staged" -ForegroundColor Green
}

StepElapsed

# ═══════════════════════════════════════════════════════════════════════════════
# [12/13] Inject UTF-8 BOMs into staged PowerShell scripts
# ═══════════════════════════════════════════════════════════════════════════════

Step "Injecting UTF-8 BOMs into staged PowerShell scripts"
$AddBomScript = Join-Path $RepoRoot "scripts\add-bom-to-dist.ts"
if (Test-Path $AddBomScript) {
    Push-Location $RepoRoot
    node --experimental-strip-types "$AddBomScript" "$OutDir"
    if ($LASTEXITCODE -ne 0) { throw "add-bom-to-dist.ts failed — check staged file encoding" }
    Pop-Location
    Write-Host "  ✓ BOM injection complete." -ForegroundColor Green
} else {
    Write-Host "  ⊘ SKIP: scripts\add-bom-to-dist.ts not found" -ForegroundColor Yellow
}

StepElapsed

# ═══════════════════════════════════════════════════════════════════════════════
# [13/13] Validate staged artifacts
# ═══════════════════════════════════════════════════════════════════════════════

Step "Validating staged artifacts"

$ValidationResults = @()

# Define artifacts to validate (Path, Type, Name)
$ArtifactsToValidate = @(
    @{ Path = "$OutDir\shell\FactumIL.Desktop.exe"; Type = "exe"; Name = "WPF Shell" }
    @{ Path = "$OutDir\backend\dist\start.js"; Type = "generic"; Name = "API Entry Point" }
    @{ Path = "$OutDir\dashboard\dist\index.html"; Type = "generic"; Name = "Dashboard Entry" }
    @{ Path = "$OutDir\runtime\node.exe"; Type = "exe"; Name = "Node.exe Runtime" }
    @{ Path = "$OutDir\tools\OllamaSetup.exe"; Type = "exe"; Name = "Ollama" }
    @{ Path = "$OutDir\tools\sqlite-vec.dll"; Type = "dll"; Name = "SQLite-Vec" }
)

# Validate SQL files
$migrationFiles = Get-ChildItem "$OutDir\migrations" -Filter "*.sql" -ErrorAction SilentlyContinue
foreach ($file in $migrationFiles) {
    if (ValidateArtifact $file.FullName "sql") {
        $ValidationResults += @{ File = $file.Name; Valid = $true }
    } else {
        $ValidationResults += @{ File = $file.Name; Valid = $false }
    }
}

$validCount = 0
$missingCount = 0
$invalidCount = 0

foreach ($artifact in $ArtifactsToValidate) {
    $isValid = ValidateArtifact $artifact.Path $artifact.Type
    
    if ($isValid) {
        Write-Host "  ✓ $($artifact.Name)" -ForegroundColor Green
        $validCount++
    } elseif (Test-Path $artifact.Path) {
        Write-Host "  ⚠ $($artifact.Name): File exists but validation failed" -ForegroundColor Yellow
        $invalidCount++
    } else {
        Write-Host "  ✗ $($artifact.Name): MISSING" -ForegroundColor Red
        $missingCount++
    }
}

Write-Host ""
Write-Host "  Validation Summary: $validCount valid, $invalidCount invalid, $missingCount missing" -ForegroundColor $(if ($missingCount -eq 0) { 'Green' } else { 'Yellow' })

if ($missingCount -gt 0) {
    Write-Host "  ⚠ Build completed with warnings. Some artifacts are missing." -ForegroundColor Yellow
}

StepElapsed

# ═══════════════════════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Green
Write-Host " ✓ BUILD COMPLETE  -  Factum IL v1.0.0" -ForegroundColor Green
Write-Host ("=" * 70) -ForegroundColor Green
Write-Host ""
Write-Host "  📦 Staged to: $OutDir" -ForegroundColor White
Write-Host ""
Write-Host "  Core artifacts:" -ForegroundColor Cyan
Write-Host "    shell\FactumIL.Desktop.exe        $(if (Test-Path "$OutDir\shell\FactumIL.Desktop.exe") {'✓'} else {'✗ MISSING'})" -ForegroundColor White
Write-Host "    runtime\node.exe                  $(if (Test-Path "$OutDir\runtime\node.exe") {'✓'} else {'⚠ MISSING (optional)'})" -ForegroundColor White
Write-Host "    backend\dist\start.js             $(if (Test-Path "$OutDir\backend\dist\start.js") {'✓'} else {'✗ MISSING'})" -ForegroundColor White
Write-Host "    dashboard\dist\index.html         $(if (Test-Path "$OutDir\dashboard\dist\index.html") {'✓'} else {'✗ MISSING'})" -ForegroundColor White
Write-Host ""
Write-Host "  Database & Migrations:" -ForegroundColor Cyan
Write-Host "    migrations\                        $((Get-ChildItem "$OutDir\migrations" -Filter *.sql -ErrorAction SilentlyContinue | Measure-Object).Count) SQL files" -ForegroundColor White
Write-Host ""
Write-Host "  Optional components:" -ForegroundColor Cyan
Write-Host "    tools\OllamaSetup.exe             $(if (Test-Path "$OutDir\tools\OllamaSetup.exe") {'✓'} else {'⚠ missing (manual install)'})" -ForegroundColor White
Write-Host "    tools\sqlite-vec.dll              $(if (Test-Path "$OutDir\tools\sqlite-vec.dll") {'✓'} else {'⚠ missing (JS fallback)'})" -ForegroundColor White
Write-Host "    models\law-il-E2B-Q4_K_M.gguf    $(if (Test-Path "$OutDir\models\law-il-E2B-Q4_K_M.gguf") {'✓'} else {'⚠ missing (Ollama Hub on first launch)'})" -ForegroundColor White
Write-Host ""
Write-Host "  📝 Build log: $LogFile" -ForegroundColor Gray
Write-Host ""
Write-Host "  Next step:" -ForegroundColor Yellow
Write-Host "    ISCC.exe installer.iss" -ForegroundColor Yellow
Write-Host "    → Factum-IL-Setup.exe  (repo root)" -ForegroundColor Yellow
Write-Host ""
