#Requires -Version 5.1
<#
.SYNOPSIS
    Builds and stages Legal-OS into LegalOS_Dist/ ready for Inno Setup packaging.
    Output layout:
        LegalOS_Dist/
          shell/        WPF exe + WebView2 runtime DLLs
          backend/      Express API (isolated prod node_modules, no pnpm symlinks)
          dashboard/    React SPA compiled assets served by Express
          migrations/   SQL migration files (run once on first boot)
          runtime/      Portable node.exe (no system Node.js required)
.EXAMPLE
    .\apps\desktop\publish.ps1
    .\apps\desktop\publish.ps1 -OutDir "C:\Build\LegalOS_Dist"
#>
[CmdletBinding()]
param(
    [string] $OutDir      = (Join-Path $PSScriptRoot "..\..\LegalOS_Dist"),
    [string] $NodeVersion = "22.13.1"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot   = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$DesktopDir = $PSScriptRoot

# ── Clean output directory ────────────────────────────────────────────────────
if (Test-Path $OutDir) { Remove-Item -Recurse -Force $OutDir }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# ── [1/8] Build @legal-os/shared ─────────────────────────────────────────────
Write-Host "[1/8] Building @legal-os/shared..." -ForegroundColor Cyan
Push-Location (Join-Path $RepoRoot "packages\shared")
npx tsc
if ($LASTEXITCODE -ne 0) { throw "@legal-os/shared build failed" }
Pop-Location

# ── [2/8] Build @legal-os/database ───────────────────────────────────────────
Write-Host "[2/8] Building @legal-os/database..." -ForegroundColor Cyan
Push-Location (Join-Path $RepoRoot "packages\database")
npx tsc
if ($LASTEXITCODE -ne 0) { throw "@legal-os/database build failed" }
Pop-Location

# ── [3/8] Build Node.js API ───────────────────────────────────────────────────
Write-Host "[3/8] Building Node.js API (pnpm build)..." -ForegroundColor Cyan
Push-Location $RepoRoot
pnpm --filter @legal-os/api build
if ($LASTEXITCODE -ne 0) { throw "API build failed" }
Pop-Location

# ── [4/8] Build React dashboard ──────────────────────────────────────────────
Write-Host "[4/8] Building React dashboard (pnpm build)..." -ForegroundColor Cyan
Push-Location $RepoRoot
pnpm --filter dashboard build
if ($LASTEXITCODE -ne 0) { throw "Dashboard build failed" }
Pop-Location

# ── [5/8] Publish C# WPF shell ───────────────────────────────────────────────
Write-Host "[5/8] Publishing WPF shell (dotnet publish)..." -ForegroundColor Cyan
Push-Location $DesktopDir
dotnet publish LegalOS.Desktop.csproj `
    --configuration Release `
    --runtime win-x64 `
    --output "$OutDir\shell" `
    --no-self-contained
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed" }
Pop-Location

# ── [6/8] Stage backend via pnpm deploy ──────────────────────────────────────
#  pnpm deploy creates an isolated node_modules without pnpm symlinks or
#  .pnpm virtual-store references — required for deployment to machines that
#  don't have pnpm installed.
Write-Host "[6/8] Staging backend with pnpm deploy (production deps only)..." -ForegroundColor Cyan
Push-Location $RepoRoot
pnpm --filter @legal-os/api deploy --prod "$OutDir\backend"
if ($LASTEXITCODE -ne 0) { throw "pnpm deploy failed" }
Pop-Location

# Copy compiled API JS output (pnpm deploy excludes .gitignored dist/)
New-Item -ItemType Directory -Force -Path "$OutDir\backend\dist" | Out-Null
Copy-Item -Recurse -Force "$RepoRoot\packages\api\dist\*" "$OutDir\backend\dist"

# Copy compiled workspace package output + patch exports to point at dist/
# (deployed package.json retains source exports; we patch only the deployed copies)
foreach ($pkg in @(
    @{ Name = 'database'; SrcDist = "$RepoRoot\packages\database\dist" },
    @{ Name = 'shared';   SrcDist = "$RepoRoot\packages\shared\dist"   }
)) {
    $pkgDir = "$OutDir\backend\node_modules\@legal-os\$($pkg.Name)"
    if (-not (Test-Path $pkgDir)) {
        New-Item -ItemType Directory -Force -Path $pkgDir | Out-Null
    }

    # Copy compiled JS
    New-Item -ItemType Directory -Force -Path "$pkgDir\dist" | Out-Null
    Copy-Item -Recurse -Force "$($pkg.SrcDist)\*" "$pkgDir\dist"

    # Patch package.json so Node.js resolves to dist/ at runtime
    $pkgJson = Get-Content "$pkgDir\package.json" | ConvertFrom-Json
    $pkgJson.main    = "./dist/index.js"
    $pkgJson.exports = [PSCustomObject]@{ "." = "./dist/index.js" }
    $pkgJson | ConvertTo-Json -Depth 10 | Set-Content "$pkgDir\package.json"
}

# ── [7/8] Stage dashboard + migrations ───────────────────────────────────────
Write-Host "[7/8] Staging dashboard and migrations..." -ForegroundColor Cyan

New-Item -ItemType Directory -Force -Path "$OutDir\dashboard\dist" | Out-Null
Copy-Item -Recurse -Force "$RepoRoot\apps\dashboard\dist\*" "$OutDir\dashboard\dist"

New-Item -ItemType Directory -Force -Path "$OutDir\migrations" | Out-Null
Copy-Item -Force "$RepoRoot\migrations\*.sql" "$OutDir\migrations"

# ── [8/8] Download portable Node.js runtime ──────────────────────────────────
Write-Host "[8/8] Staging portable Node.js v$NodeVersion runtime..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "$OutDir\runtime" | Out-Null

$NodeZip     = "$env:TEMP\node-v$NodeVersion-win-x64.zip"
$NodeExtract = "$env:TEMP\node-v$NodeVersion-win-x64-extract"

if (-not (Test-Path $NodeZip)) {
    Write-Host "  Downloading node-v$NodeVersion-win-x64.zip..." -ForegroundColor Gray
    $NodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"
    Invoke-WebRequest -Uri $NodeUrl -OutFile $NodeZip -UseBasicParsing
} else {
    Write-Host "  Using cached $NodeZip" -ForegroundColor Gray
}

if (Test-Path $NodeExtract) { Remove-Item -Recurse -Force $NodeExtract }
Expand-Archive -Path $NodeZip -DestinationPath $NodeExtract

Copy-Item -Force "$NodeExtract\node-v$NodeVersion-win-x64\node.exe" "$OutDir\runtime\node.exe"

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Build complete. Staged to: $OutDir" -ForegroundColor Green
Write-Host ""
Write-Host "  $OutDir\shell\LegalOS.Desktop.exe" -ForegroundColor White
Write-Host "  $OutDir\backend\dist\start.js"       -ForegroundColor White
Write-Host "  $OutDir\dashboard\dist\index.html"   -ForegroundColor White
Write-Host "  $OutDir\migrations\*.sql             ($((Get-ChildItem $OutDir\migrations\*.sql).Count) files)" -ForegroundColor White
Write-Host "  $OutDir\runtime\node.exe"             -ForegroundColor White
Write-Host ""
Write-Host "Next step: ISCC.exe installer.iss" -ForegroundColor Yellow
