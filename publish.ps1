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
#>
[CmdletBinding()]
param(
    [string] $OutDir      = "",
    [string] $NodeVersion = "22.13.1",
    [switch] $SkipTests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# When invoked via pnpm/npm, $PSScriptRoot may be empty - resolve from invocation path
if (-not $PSScriptRoot) {
    $PSScriptRoot = Split-Path -Parent -Resolve $MyInvocation.MyCommand.Path
}
if (-not $OutDir) {
    $OutDir = Join-Path $PSScriptRoot "FactumIL_Dist"
}

$RepoRoot    = $PSScriptRoot
$DesktopDir  = Join-Path $RepoRoot "FactumIL.Desktop"
$TotalSteps  = 12
$Step        = 0
$LogFile     = Join-Path $PSScriptRoot "Deployment-Log.txt"
$BuildId     = [datetime]::UtcNow.ToString('yyyy-MM-ddTHH-mm-ssZ')

function Log([string]$msg) {
    Add-Content -Path $LogFile -Value "[$BuildId] $msg" -Encoding UTF8
    Write-Host $msg
}

function Step([string]$msg) {
    $script:Step++
    Write-Host ""
    Write-Host "[$script:Step/$TotalSteps] $msg" -ForegroundColor Cyan
    Log "[$script:Step/$TotalSteps] $msg"
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

# Winget pre-flight checks (non-fatal)
if (Get-Command winget -ErrorAction SilentlyContinue) {
    if (winget list --id OpenJS.NodeJS.LTS 2>$null | Select-String "22\.") {
        Log "  Node 22 LTS: confirmed via winget"
    } else {
        Log "  WARN: Node 22 LTS not confirmed - install: winget install OpenJS.NodeJS.LTS"
    }
    if (winget list --id JRSoftware.InnoSetup 2>$null | Select-String "InnoSetup") {
        Log "  Inno Setup: confirmed via winget"
    } else {
        Log "  WARN: Inno Setup not found - install: winget install JRSoftware.InnoSetup"
    }
} else {
    Log "  INFO: winget not available - skipping tool version checks"
}
$wv2Key = "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
if (Test-Path $wv2Key) { Log "  WebView2 Runtime: present" }
else { Log "  WARN: WebView2 Runtime not installed - installer will handle silent install" }

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
if ($LASTEXITCODE -ne 0) { throw "TypeScript typecheck failed  -  fix errors before packaging" }
Pop-Location

# ── Optional: run tests ───────────────────────────────────────────────────────
if (-not $SkipTests) {
    Step "Running test suite (pnpm -r test)"
    Push-Location $RepoRoot
    pnpm -r test
    if ($LASTEXITCODE -ne 0) { throw "Tests failed  -  fix failures before packaging" }
    Pop-Location
} else {
    Step "Skipping tests (-SkipTests flag set)"
    Write-Host "  WARNING: Skipping tests. Only use this for emergency rebuilds." -ForegroundColor Yellow
}

# ── Build all TypeScript packages (dependency order) ─────────────────────────
Step "Building all TypeScript packages"

$PackageBuildOrder = @(
    'shared', 'database', 'legal-ontology', 'events', 'observability',
    'model-router', 'policy-engine', 'memory', 'retrieval', 'ai', 'ai-guardrails',
    'citation-engine', 'pipeline', 'evals', 'orchestrator',
    'agent-core', 'support-diagnostics', 'update-core',
    'litigation-intelligence', 'enterprise-hooks', 'encrypted-backup', 'api'
)

Push-Location $RepoRoot
foreach ($pkg in $PackageBuildOrder) {
    $pkgDir = Join-Path $RepoRoot "packages\$pkg"
    if (-not (Test-Path $pkgDir)) {
        Write-Host "  SKIP: packages\$pkg (not found)" -ForegroundColor Yellow
        continue
    }
    $pkgJson = Get-Content (Join-Path $pkgDir "package.json") | ConvertFrom-Json
    if ($pkgJson.PSObject.Properties['scripts'] -and $pkgJson.scripts.PSObject.Properties['build']) {
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

# ── Stage backend (artifact copy + pnpm install --prod, flat node_modules) ────
Step "Staging API backend (artifact copy + pnpm install --prod --node-linker=hoisted)"

$BackendOut = Join-Path $OutDir "backend"

# 8.0  Kill node.exe — releases VS Code TS-server locks on packages\*\dist\*.d.ts
Write-Host "  Stopping node.exe processes (releasing file locks) ..." -ForegroundColor Gray
Get-Process -Name "node" -ErrorAction SilentlyContinue | ForEach-Object {
    try { $_.Kill(); $_.WaitForExit(3000) } catch {}
}
Start-Sleep -Milliseconds 300

# 8.1  Single authoritative workspace package list
#      litigation-intelligence ADDED — @factum-il/api depends on it (workspace:*)
$WorkspacePackages = @(
    'shared', 'database', 'legal-ontology', 'events', 'observability',
    'model-router', 'memory', 'retrieval', 'ai', 'ai-guardrails',
    'citation-engine', 'pipeline', 'evals', 'orchestrator', 'policy-engine',
    'agent-core', 'support-diagnostics', 'update-core',
    'enterprise-hooks', 'encrypted-backup', 'litigation-intelligence'
)

# 8.2  Create backend/ and copy API dist/
New-Item -ItemType Directory -Force -Path "$BackendOut\dist" | Out-Null
Copy-Item -Recurse -Force "$RepoRoot\packages\api\dist\*" "$BackendOut\dist"
Write-Host "  API dist/ staged." -ForegroundColor Gray

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
[PSCustomObject]@{
    name         = "factum-il-backend-dist"
    version      = "1.0.0"
    private      = $true
    type         = "module"
    dependencies = [PSCustomObject]$MergedDeps
} | ConvertTo-Json -Depth 10 | Set-Content "$BackendOut\package.json" -Encoding UTF8
Write-Host "  Merged package.json written ($($MergedDeps.Count) third-party deps)." -ForegroundColor Gray

# 8.4  .npmrc + pnpm-workspace.yaml — flat hoisted layout; isolated from repo workspace
#      node-linker=hoisted: no deep .pnpm/ symlink tree (fixes Windows MAX_PATH issues)
#
#      pnpm-workspace.yaml overrides — mirrors the root override so ^11 is resolved in this
#      isolated install (no lockfile, no root workspace). better-sqlite3 v9 has no Node-22
#      prebuilt; ^11 does. (Build-script approval is handled in step 8.5 via --ignore-scripts
#      + npm rebuild, because pnpm reads onlyBuiltDependencies from the workspace ROOT.)
@"
node-linker=hoisted
shamefully-hoist=true
"@ | Set-Content "$BackendOut\.npmrc" -Encoding UTF8
@"
packages: []
overrides:
  better-sqlite3: "^11.0.0"
"@ | Set-Content "$BackendOut\pnpm-workspace.yaml" -Encoding UTF8

# 8.5  Install all third-party prod deps — flat layout, no lockfile, prefer local cache
#      --ignore-scripts skips pnpm's ERR_PNPM_IGNORED_BUILDS security check entirely;
#      npm rebuild better-sqlite3 then downloads the correct Node-22 prebuilt binary.
#      (pnpm reads onlyBuiltDependencies from the workspace ROOT, not the generated
#       pnpm-workspace.yaml inside FactumIL_Dist\, so the setting has no effect.)
Push-Location $BackendOut
pnpm install --prod --no-lockfile --node-linker=hoisted --prefer-offline --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw "pnpm install --prod failed in backend/" }
npm rebuild better-sqlite3
if ($LASTEXITCODE -ne 0) { throw "npm rebuild better-sqlite3 failed — check Node ABI / network in $BackendOut" }
# Verify the native binding loads against the build host's Node (same major as bundled runtime)
node -e "const D=require('better-sqlite3'); const db=new D(':memory:'); db.exec('CREATE TABLE _p(x)'); db.close(); console.log('  better-sqlite3 native binding OK (v'+require('./node_modules/better-sqlite3/package.json').version+')');"
if ($LASTEXITCODE -ne 0) { throw "better-sqlite3 native binding failed — check Node ABI in $BackendOut" }
Pop-Location
Write-Host "  pnpm install --prod complete." -ForegroundColor Gray

# 8.6  Plant workspace package dist/ + patched package.json
#      No retry loops needed — node.exe was killed in 8.0
foreach ($pkg in $WorkspacePackages) {
    $SrcDist = Join-Path $RepoRoot "packages\$pkg\dist"
    if (-not (Test-Path $SrcDist)) {
        Write-Host "  SKIP: @factum-il/$pkg (no dist/ — not built?)" -ForegroundColor Yellow
        continue
    }
    $DstPkgDir = Join-Path $BackendOut "node_modules\@factum-il\$pkg"
    New-Item -ItemType Directory -Force -Path "$DstPkgDir\dist" | Out-Null
    Copy-Item -Recurse -Force "$SrcDist\*" "$DstPkgDir\dist" -ErrorAction Stop

    $SrcPkgJson = Join-Path $RepoRoot "packages\$pkg\package.json"
    if (Test-Path $SrcPkgJson) {
        Copy-Item -Force $SrcPkgJson "$DstPkgDir\package.json" -ErrorAction Stop
        $pkgJson = Get-Content "$DstPkgDir\package.json" | ConvertFrom-Json
        $pkgJson.main    = "./dist/index.js"
        $pkgJson.exports = [PSCustomObject]@{ "." = "./dist/index.js" }
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
    Write-Host "    OK: @factum-il/$pkg" -ForegroundColor DarkGray
}
Write-Host "  Workspace packages staged." -ForegroundColor Gray

# 8.7  Rebuild native modules for Windows x64 (paths are now flat — no deep .pnpm tree)
if (-not (Test-Path variable:IsWindows)) { $IsWindows = $true }  # guard: undefined in PS 5.1 strict mode
if ($IsWindows) {
    Write-Host "  Rebuilding native modules for win-x64 ..." -ForegroundColor Gray
    Push-Location $BackendOut
    if (Test-Path "node_modules\.bin\node-gyp-build") {
        node node_modules\.bin\node-gyp-build 2>$null; $true
    }
    # better-sqlite3 ships prebuilds; this fetches better_sqlite3.node (Win32/x64)
    # into node_modules\better-sqlite3\build\Release\, bundled by installer.iss glob.
    if (Test-Path "node_modules\better-sqlite3\scripts\download-prebuilt.js") {
        node node_modules\better-sqlite3\scripts\download-prebuilt.js `
             --platform win32 --arch x64 2>$null; $true
    }
    Pop-Location
}
Write-Host "  Backend staged: $BackendOut" -ForegroundColor Gray

# ── Stage dashboard + migrations ──────────────────────────────────────────────
Step "Staging dashboard and migrations"

# The API entry (app/api/dist/start.js) resolves the dashboard via:
#   join(__dirname, '..', '..', 'dashboard', 'dist')
# So from {app}\app\api\dist\ it looks for {app}\app\dashboard\dist\
# We preserve the "dist\" subfolder level during staging.
$DashboardDst = Join-Path $OutDir "dashboard\dist"
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
    $NodeUrl = "https://github.com/niraltman1/niraltman1/releases/download/v-deps-1.0.0/node-v$NodeVersion-win-x64.zip"
    Write-Host "  Downloading $NodeUrl ..." -ForegroundColor Gray
    Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZip -UseBasicParsing
} else {
    Write-Host "  Using cached: $NodeZip" -ForegroundColor Gray
}

if (Test-Path $NodeExtract) { Remove-Item -Recurse -Force $NodeExtract }
Expand-Archive -Path $NodeZip -DestinationPath $NodeExtract
Copy-Item -Force "$NodeExtract\node-v$NodeVersion-win-x64\node.exe" "$RuntimeDst\node.exe"
Write-Host "  node.exe staged: $RuntimeDst\node.exe" -ForegroundColor Gray

# ── Download Ollama, WebView2, and AI model GGUF ──────────────────────────────
Step "Downloading Ollama, WebView2, and AI model GGUF"
$ToolsDst   = Join-Path $OutDir "tools"
$DepsBase   = "https://github.com/niraltman1/niraltman1/releases/download/v-deps-1.0.0"
New-Item -ItemType Directory -Force -Path $ToolsDst | Out-Null

# Ollama (pinned via v-deps-1.0.0 release  -  not floating "latest")
$OllamaExe = Join-Path $ToolsDst "OllamaSetup.exe"
try {
    Write-Host "  Downloading OllamaSetup.exe ..." -ForegroundColor Gray
    Invoke-WebRequest -Uri "$DepsBase/OllamaSetup.exe" -OutFile $OllamaExe -UseBasicParsing -TimeoutSec 120
    Write-Host "  OllamaSetup.exe staged ($([math]::Round((Get-Item $OllamaExe).Length/1MB,1)) MB)" -ForegroundColor Gray
} catch {
    Write-Host "  WARNING: Could not download OllamaSetup.exe  -  place it manually in: $ToolsDst" -ForegroundColor Yellow
}

# WebView2 bootstrapper
$WV2Exe = Join-Path $ToolsDst "MicrosoftEdgeWebview2Setup.exe"
try {
    Write-Host "  Downloading MicrosoftEdgeWebview2Setup.exe ..." -ForegroundColor Gray
    Invoke-WebRequest -Uri "$DepsBase/MicrosoftEdgeWebview2Setup.exe" -OutFile $WV2Exe -UseBasicParsing -TimeoutSec 60
    Write-Host "  WebView2 bootstrapper staged ($([math]::Round((Get-Item $WV2Exe).Length/1KB,0)) KB)" -ForegroundColor Gray
} catch {
    Write-Host "  WARNING: Could not download WebView2 bootstrapper  -  place MicrosoftEdgeWebview2Setup.exe in: $ToolsDst" -ForegroundColor Yellow
}

# AI model GGUF  -  bundled so first launch works without internet
$GgufDst = Join-Path $OutDir "models"
New-Item -ItemType Directory -Force -Path $GgufDst | Out-Null
$GgufFile = Join-Path $GgufDst "law-il-E2B-Q4_K_M.gguf"
try {
    Write-Host "  Downloading law-il-E2B-Q4_K_M.gguf (~1.3 GB) ..." -ForegroundColor Gray
    Invoke-WebRequest -Uri "$DepsBase/law-il-E2B-Q4_K_M.gguf" -OutFile $GgufFile -UseBasicParsing -TimeoutSec 1800
    Write-Host "  GGUF staged ($([math]::Round((Get-Item $GgufFile).Length/1GB,2)) GB)" -ForegroundColor Gray
} catch {
    Write-Host "  WARNING: Could not download GGUF  -  model will be pulled from Ollama Hub on first launch." -ForegroundColor Yellow
}

# ── Inject UTF-8 BOMs into staged PowerShell scripts ─────────────────────────
Step "Injecting UTF-8 BOMs into staged PowerShell scripts"
$AddBomScript = Join-Path $RepoRoot "scripts\add-bom-to-dist.ts"
if (Test-Path $AddBomScript) {
    Push-Location $RepoRoot
    node --experimental-strip-types "$AddBomScript" "$OutDir"
    if ($LASTEXITCODE -ne 0) { throw "add-bom-to-dist.ts failed — check staged file encoding" }
    Pop-Location
    Write-Host "  BOM injection complete." -ForegroundColor Gray
} else {
    Write-Host "  SKIP: scripts\add-bom-to-dist.ts not found" -ForegroundColor Yellow
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=" * 70 -ForegroundColor Green
Write-Host " BUILD COMPLETE  -  Factum IL v1.0.0" -ForegroundColor Green
Write-Host "=" * 70 -ForegroundColor Green
Write-Host ""
Write-Host "  Staged to: $OutDir" -ForegroundColor White
Write-Host ""
Write-Host "  shell\FactumIL.Desktop.exe        $(if (Test-Path "$OutDir\shell\FactumIL.Desktop.exe") {'✓'} else {'MISSING'})" -ForegroundColor White
Write-Host "  runtime\node.exe                  $(if (Test-Path "$OutDir\runtime\node.exe") {'✓'} else {'MISSING'})" -ForegroundColor White
Write-Host "  backend\dist\start.js             $(if (Test-Path "$OutDir\backend\dist\start.js") {'✓'} else {'MISSING'})" -ForegroundColor White
Write-Host "  dashboard\index.html              $(if (Test-Path "$OutDir\dashboard\index.html") {'✓'} else {'MISSING'})" -ForegroundColor White
Write-Host "  migrations\                        $((Get-ChildItem "$OutDir\migrations" -Filter *.sql -ErrorAction SilentlyContinue).Count) SQL files" -ForegroundColor White
Write-Host "  tools\OllamaSetup.exe             $(if (Test-Path "$OutDir\tools\OllamaSetup.exe") {'✓'} else {'missing  -  add manually'})" -ForegroundColor White
Write-Host "  models\law-il-E2B-Q4_K_M.gguf    $(if (Test-Path "$OutDir\models\law-il-E2B-Q4_K_M.gguf") {'✓'} else {'missing  -  will pull from Ollama Hub on first launch'})" -ForegroundColor White
Write-Host ""
Write-Host "  Next step:" -ForegroundColor Yellow
Write-Host "    ISCC.exe installer.iss" -ForegroundColor Yellow
Write-Host "    → Factum-IL-Setup.exe  (repo root)" -ForegroundColor Yellow
Write-Host ""
